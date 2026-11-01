#Requires -Version 7
<#
.SYNOPSIS
  Comandos de navegador do Mestre do PC: speedtest, DevTools, memória, abas, CDP.

.DESCRIPTION
  Sempre usa 127.0.0.1 (nunca localhost). CDP padrão na porta 9222 (Edge isolado).
  Analogia: o script é o painel da oficina — mede, lista e só fecha o que for sucata.

.EXAMPLE
  pwsh -NoProfile -File .\scripts\browser-devtools.ps1 -Action memoria-processos
#>
param(
  [Parameter(Mandatory)]
  [ValidateSet(
    'speedtest-mini',
    'open-speedtest',
    'config-devtools',
    'open-devtools-pages',
    'memoria-processos',
    'memoria-virtual',
    'melhorar-velocidade',
    'listar-abas',
    'fechar-abas-descartaveis',
    'analisar-devtools',
    'iniciar-edge-cdp',
    'abrir-extensao-pasta'
  )]
  [string] $Action,

  [int] $CdpPort = 9222
)

$ErrorActionPreference = 'Continue'
$cdp = "http://127.0.0.1:$CdpPort"

function Get-CdpJson {
  param([string] $Path = '/json')
  try {
    return Invoke-RestMethod -Uri ($cdp + $Path) -TimeoutSec 3
  } catch {
    return $null
  }
}

function Get-BrowserProcs {
  Get-Process -Name chrome, msedge, msedgewebview2, firefox, brave -ErrorAction SilentlyContinue
}

function Write-Section([string] $Title) {
  Write-Host ""
  Write-Host "===== $Title =====" -ForegroundColor Cyan
}

function Get-ProjectRoot {
  if ($env:MESTRE_PROJETO_PATH -and (Test-Path -LiteralPath $env:MESTRE_PROJETO_PATH)) {
    return $env:MESTRE_PROJETO_PATH
  }
  $here = Split-Path -Parent $PSCommandPath
  return (Split-Path -Parent $here)
}

switch ($Action) {
  'speedtest-mini' {
    Write-Section 'Speedtest mini (Cloudflare + GitHub, sem Tele2)'
    $targets = @(
      @{ Name = 'Cloudflare 2MB'; Url = 'https://speed.cloudflare.com/__down?bytes=2000000'; Bytes = 2000000 }
      @{ Name = 'GitHub gitignore zip'; Url = 'https://github.com/github/gitignore/archive/refs/heads/main.zip'; Bytes = 0 }
    )
    foreach ($t in $targets) {
      $tmp = Join-Path $env:TEMP ("mestre-speed-" + [guid]::NewGuid().ToString('N') + '.bin')
      try {
        $sw = [System.Diagnostics.Stopwatch]::StartNew()
        Invoke-WebRequest -Uri $t.Url -OutFile $tmp -UseBasicParsing -TimeoutSec 45
        $sw.Stop()
        $len = (Get-Item -LiteralPath $tmp).Length
        $sec = [math]::Max($sw.Elapsed.TotalSeconds, 0.001)
        $mbps = [math]::Round((($len / 1MB) * 8) / $sec, 2)
        Write-Host ("{0}: {1:N2} MB em {2:N2}s → ~{3} Mbps" -f $t.Name, ($len / 1MB), $sec, $mbps) -ForegroundColor Green
      } catch {
        Write-Host ("{0}: falhou — {1}" -f $t.Name, $_.Exception.Message) -ForegroundColor Yellow
      } finally {
        Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
      }
    }
    Write-Host "Dica: para o teste visual no navegador, rode open-speedtest (fast.com + Cloudflare)." -ForegroundColor DarkGray
  }

  'open-speedtest' {
    Write-Section 'Abrir testes visuais no navegador'
    $urls = @(
      'https://fast.com',
      'https://speed.cloudflare.com'
    )
    foreach ($u in $urls) {
      Start-Process $u
      Write-Host "Aberto: $u" -ForegroundColor Green
    }
  }

  'config-devtools' {
    Write-Section 'Configuração DevTools / CDP'
    Write-Host "Porta CDP esperada: $cdp (loopback IPv4)"
    $ver = Get-CdpJson -Path '/json/version'
    if ($ver) {
      Write-Host "CDP ATIVO" -ForegroundColor Green
      Write-Host ("Browser: {0}" -f $ver.Browser)
      Write-Host ("webSocketDebuggerUrl: {0}" -f $ver.webSocketDebuggerUrl)
    } else {
      Write-Host "CDP offline nesta porta." -ForegroundColor Yellow
      Write-Host "Para ligar um Edge isolado com DevTools Protocol:"
      Write-Host "  pwsh -NoProfile -File (Join-Path `$env:MESTRE_PROJETO_PATH 'scripts\start-edge-cdp.ps1')"
    }
    Write-Host ""
    Write-Host "Atalhos úteis no Edge/Chrome (abra pelo menu ou Ctrl+Shift+I):"
    Write-Host "  F12                  → DevTools"
    Write-Host "  Ctrl+Shift+P         → Command Menu"
    Write-Host "  Ctrl+Shift+J         → Console"
    Write-Host "  Ctrl+Shift+C         → Inspecionar"
    Write-Host "  Performance / Memory → gravar CPU e heap"
    Write-Host ""
    Write-Host "Flags (só leitura — você confirma no navegador):"
    Write-Host "  edge://flags  ou  chrome://flags"
    Write-Host "  edge://gpu    → aceleração de hardware"
    Write-Host "  edge://discards → abas elegíveis para descarte"
  }

  'open-devtools-pages' {
    Write-Section 'Abrir páginas internas de DevTools'
    $edge = @(
      "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
      "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
    ) | Where-Object { Test-Path $_ } | Select-Object -First 1
    $chrome = @(
      "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
      "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
    ) | Where-Object { Test-Path $_ } | Select-Object -First 1
    $pages = @('edge://gpu', 'edge://discards', 'edge://system', 'edge://memory-redirect')
    if ($edge) {
      foreach ($p in $pages) { Start-Process -FilePath $edge -ArgumentList $p }
      Write-Host "Edge: gpu / discards / system / memory" -ForegroundColor Green
    }
    if ($chrome) {
      foreach ($p in @('chrome://gpu', 'chrome://discards', 'chrome://system')) {
        Start-Process -FilePath $chrome -ArgumentList $p
      }
      Write-Host "Chrome: gpu / discards / system" -ForegroundColor Green
    }
    if (-not $edge -and -not $chrome) {
      Write-Host "Nenhum Edge/Chrome encontrado." -ForegroundColor Yellow
    }
  }

  'memoria-processos' {
    Write-Section 'Memória dos navegadores (Working Set)'
    $procs = Get-BrowserProcs
    if (-not $procs) {
      Write-Host "Nenhum processo de navegador em execução." -ForegroundColor Yellow
      break
    }
    $groups = $procs | Group-Object Name
    foreach ($g in $groups) {
      $ws = [math]::Round((($g.Group | Measure-Object WorkingSet64 -Sum).Sum) / 1MB, 0)
      $pm = [math]::Round((($g.Group | Measure-Object PagedMemorySize64 -Sum).Sum) / 1MB, 0)
      Write-Host ("{0,-18} {1,3} procs  WS={2,5} MB  Commit~{3,5} MB" -f $g.Name, $g.Count, $ws, $pm)
    }
    $totalWs = [math]::Round((($procs | Measure-Object WorkingSet64 -Sum).Sum) / 1MB, 0)
    Write-Host ("TOTAL navegadores: {0} MB" -f $totalWs) -ForegroundColor Cyan
  }

  'memoria-virtual' {
    Write-Section 'Memória virtual (sistema + navegador)'
    $os = Get-CimInstance Win32_OperatingSystem
    $ramTotal = [math]::Round($os.TotalVisibleMemorySize / 1MB, 2)
    $ramFree = [math]::Round($os.FreePhysicalMemory / 1MB, 2)
    $commitLimit = [math]::Round($os.TotalVirtualMemorySize / 1MB, 2)
    $commitFree = [math]::Round($os.FreeVirtualMemory / 1MB, 2)
    Write-Host ("RAM física: {0} GB usados de {1} GB ({2} GB livres)" -f ([math]::Round($ramTotal - $ramFree, 2)), $ramTotal, $ramFree)
    Write-Host ("Commit (RAM+pagefile): {0} GB usados de {1} GB" -f ([math]::Round($commitLimit - $commitFree, 2)), $commitLimit)
    Get-CimInstance Win32_PageFileUsage | ForEach-Object {
      Write-Host ("Pagefile {0}: alocado {1} MB · em uso {2} MB · pico {3} MB" -f $_.Name, $_.AllocatedBaseSize, $_.CurrentUsage, $_.PeakUsage)
    }
    $comp = Get-Process -Name 'Memory Compression' -ErrorAction SilentlyContinue
    if ($comp) {
      Write-Host ("Memory Compression: {0} MB (Windows espremendo RAM)" -f [math]::Round($comp.WorkingSet64 / 1MB, 0)) -ForegroundColor Yellow
    }
    Write-Host ""
    Write-Host "No navegador, memória virtual = processos por aba (renderer) + GPU + extensão."
    Write-Host "Use a extensão do Mestre (botão Memória das abas) ou edge://discards para ver abas pesadas."
  }

  'melhorar-velocidade' {
    Write-Section 'Melhorar velocidade do navegador (passos seguros)'
    ipconfig /flushdns | Out-Null
    Write-Host "Cache DNS limpo." -ForegroundColor Green
    $names = @(Get-BrowserProcs | Select-Object -ExpandProperty Name -Unique)
    if ($names -contains 'chrome' -and $names -contains 'msedge') {
      Write-Host "Chrome e Edge estão abertos juntos — feche um deles para liberar RAM." -ForegroundColor Yellow
    }
    $edgeCount = @(Get-Process -Name msedge -ErrorAction SilentlyContinue).Count
    $chromeCount = @(Get-Process -Name chrome -ErrorAction SilentlyContinue).Count
    Write-Host ("Processos Edge={0} Chrome={1}" -f $edgeCount, $chromeCount)
    Write-Host "Próximos passos manuais (não forço):"
    Write-Host "  1) Extensão Mestre → Fechar abas descartáveis / duplicadas"
    Write-Host "  2) edge://discards → Discard"
    Write-Host "  3) NVIDIA Overlay / PC Manager se a RAM continuar apertada"
    Write-Host "Este comando NÃO mata o navegador inteiro (isso já existe em Encerrar Todos Edge/Chrome)."
  }

  'listar-abas' {
    Write-Section "Abas via CDP $cdp"
    $tabs = Get-CdpJson -Path '/json'
    if (-not $tabs) {
      Write-Host "CDP offline. Rode iniciar-edge-cdp ou abra o Edge/Chrome com --remote-debugging-port=$CdpPort." -ForegroundColor Yellow
      Write-Host "Sem CDP, use a extensão do Mestre (precisa da permissão tabs) para listar abas do perfil do dia a dia."
      break
    }
    $pages = @($tabs | Where-Object { $_.type -eq 'page' })
    Write-Host ("{0} aba(s) tipo page:" -f $pages.Count)
    $i = 1
    foreach ($p in $pages) {
      Write-Host ("{0,3}. [{1}] {2}" -f $i, $p.id, ($p.title -replace '\s+', ' '))
      Write-Host ("     {0}" -f $p.url) -ForegroundColor DarkGray
      $i++
    }
  }

  'fechar-abas-descartaveis' {
    Write-Section 'Fechar abas sucata via CDP (newtab / about:blank)'
    $tabs = Get-CdpJson -Path '/json'
    if (-not $tabs) {
      Write-Host "CDP offline — não fecho abas do perfil principal sem a extensão." -ForegroundColor Yellow
      Write-Host "Instale a extensão (pasta browser-extension) e use o botão Fechar abas descartáveis."
      break
    }
    $junk = @($tabs | Where-Object {
      $_.type -eq 'page' -and (
        $_.url -match '^(about:blank|chrome://newtab|edge://newtab|chrome://new-tab-page)' -or
        [string]::IsNullOrWhiteSpace($_.title)
      )
    })
    if ($junk.Count -eq 0) {
      Write-Host "Nenhuma aba sucata (newtab/blank) neste CDP." -ForegroundColor Green
      break
    }
    foreach ($t in $junk) {
      try {
        Invoke-RestMethod -Uri ($cdp + '/json/close/' + $t.id) -TimeoutSec 3 | Out-Null
        Write-Host ("Fechou: {0}" -f $t.url) -ForegroundColor Green
      } catch {
        Write-Host ("Falhou {0}: {1}" -f $t.id, $_.Exception.Message) -ForegroundColor Yellow
      }
    }
  }

  'analisar-devtools' {
    Write-Section 'Análise DevTools (CDP)'
    $ver = Get-CdpJson -Path '/json/version'
    $tabs = Get-CdpJson -Path '/json'
    if (-not $ver) {
      Write-Host "CDP offline em $cdp." -ForegroundColor Yellow
      Write-Host "Checklist sem CDP:"
      Write-Host "  - F12 na aba pesada → Performance → Record 3s"
      Write-Host "  - Memory → Take heap snapshot se a aba cresce sem parar"
      Write-Host "  - Network → Disable cache + recarregar para ver LCP"
      break
    }
    Write-Host ("Browser: {0}" -f $ver.Browser)
    Write-Host ("Protocol: {0}" -f $ver.'Protocol-Version')
    $pages = @($tabs | Where-Object { $_.type -eq 'page' })
    $iframes = @($tabs | Where-Object { $_.type -eq 'iframe' })
    $workers = @($tabs | Where-Object { $_.type -match 'worker' })
    Write-Host ("Alvos: pages={0} iframes={1} workers={2} total={3}" -f $pages.Count, $iframes.Count, $workers.Count, @($tabs).Count)
    Write-Host "Abas com WebSocket (DevTools já anexado):"
    foreach ($p in $pages) {
      $ws = if ($p.webSocketDebuggerUrl) { 'sim' } else { 'nao' }
      Write-Host ("  [{0}] ws={1}  {2}" -f $p.id, $ws, $p.url)
    }
  }

  'iniciar-edge-cdp' {
    Write-Section 'Iniciar Edge com CDP'
    $script = Join-Path (Get-ProjectRoot) 'scripts\start-edge-cdp.ps1'
    if (-not (Test-Path -LiteralPath $script)) {
      Write-Host "Arquivo não encontrado: $script" -ForegroundColor Red
      exit 1
    }
    & $script -Port $CdpPort
  }

  'abrir-extensao-pasta' {
    Write-Section 'Pasta da extensão (carregar sem compactação)'
    $dir = Join-Path (Get-ProjectRoot) 'browser-extension'
    if (-not (Test-Path -LiteralPath $dir)) {
      Write-Host "Pasta não encontrada: $dir" -ForegroundColor Red
      exit 1
    }
    Set-Clipboard -Value $dir
    Start-Process $dir
    $edge = @(
      "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
      "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
    ) | Where-Object { Test-Path $_ } | Select-Object -First 1
    if ($edge) {
      Start-Process -FilePath $edge -ArgumentList 'edge://extensions'
    }
    $chrome = "$env:ProgramFiles\Google\Chrome\Application\chrome.exe"
    if (Test-Path $chrome) {
      Start-Process -FilePath $chrome -ArgumentList 'chrome://extensions'
    }
    Write-Host "Caminho copiado para a área de transferência:"
    Write-Host $dir -ForegroundColor Green
    Write-Host "1) Ative Modo do desenvolvedor"
    Write-Host "2) Carregar sem compactação → cole o caminho"
    Write-Host "3) Copie o ID da extensão e configure MESTRE_EXTENSION_ORIGINS + token"
  }
}
