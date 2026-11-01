#Requires -Version 7
<#
.SYNOPSIS
  Status e lançamento de agentes CLI no terminal do Mestre do PC.

.EXAMPLE
  pwsh -NoProfile -File .\scripts\cli-agents.ps1 -Action status
  pwsh -NoProfile -File .\scripts\cli-agents.ps1 -Action opencode
#>
param(
  [Parameter(Mandatory)]
  [ValidateSet(
    'status',
    'install-opencode',
    'opencode',
    'grok',
    'omp',
    'copilot',
    'llamacpp-status'
  )]
  [string] $Action
)

$ErrorActionPreference = 'Continue'
$Project = if ($env:MESTRE_PROJETO_PATH) { $env:MESTRE_PROJETO_PATH } else {
  Split-Path -Parent (Split-Path -Parent $PSCommandPath)
}

function Find-Cmd([string]$Name) {
  $c = Get-Command $Name -ErrorAction SilentlyContinue
  if ($c) { return $c.Source }
  $guess = @(
    (Join-Path $env:USERPROFILE ".opencode\bin\$Name.exe"),
    (Join-Path $env:USERPROFILE ".opencode\bin\$Name"),
    (Join-Path $env:APPDATA "npm\$Name.ps1"),
    (Join-Path $env:APPDATA "npm\$Name.cmd"),
    (Join-Path $env:LOCALAPPDATA "omp\$Name.exe"),
    (Join-Path $env:LOCALAPPDATA "omp\bin\$Name.exe")
  )
  foreach ($g in $guess) { if (Test-Path -LiteralPath $g) { return $g } }
  return $null
}

function Open-AgentTerminal([string]$Title, [string]$Command) {
  $wt = Get-Command wt.exe -ErrorAction SilentlyContinue
  $inner = "Set-Location -LiteralPath '$($Project.Replace("'","''"))'; Write-Host '=== $Title ===' -ForegroundColor Cyan; $Command"
  if ($wt) {
    Start-Process -FilePath $wt.Source -ArgumentList @(
      '-w', '0', 'nt', '--title', $Title, '-d', $Project,
      'pwsh', '-NoLogo', '-NoExit', '-Command', $inner
    )
  } else {
    Start-Process -FilePath 'pwsh.exe' -ArgumentList @('-NoLogo', '-NoExit', '-Command', $inner)
  }
  Write-Host "Terminal aberto: $Title" -ForegroundColor Green
}

function Probe-Http([string]$Url) {
  try {
    $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
    return "HTTP $($r.StatusCode)"
  } catch {
    return "offline ($($_.Exception.Message.Split([char]10)[0]))"
  }
}

switch ($Action) {
  'status' {
    Write-Host "===== Agentes CLI =====" -ForegroundColor Cyan
    foreach ($n in @('opencode','grok','omp','copilot','llama-server','llama-cli')) {
      $p = Find-Cmd $n
      if ($p) { Write-Host ("{0,-14} {1}" -f $n, $p) -ForegroundColor Green }
      else { Write-Host ("{0,-14} nao encontrado no PATH" -f $n) -ForegroundColor Yellow }
    }
    Write-Host ""
    Write-Host ("llama.cpp  :8080  {0}" -f (Probe-Http 'http://127.0.0.1:8080/v1/models'))
    Write-Host ("LM Studio  :1234  {0}" -f (Probe-Http 'http://127.0.0.1:1234/v1/models'))
    Write-Host ("Ollama     :11434 {0}" -f (Probe-Http 'http://127.0.0.1:11434/api/tags'))
    Write-Host ("9Router    :20128 {0}" -f (Probe-Http 'http://127.0.0.1:20128/v1/models'))
    Write-Host ("Mestre     :7777  {0}" -f (Probe-Http 'http://127.0.0.1:7777/ping'))
  }

  'install-opencode' {
    $bash = @(
      'C:\Program Files\Git\bin\bash.exe',
      'C:\Program Files\Git\usr\bin\bash.exe'
    ) | Where-Object { Test-Path $_ } | Select-Object -First 1
    if (-not $bash) {
      Write-Host "Git Bash nao encontrado. Instale Git for Windows." -ForegroundColor Red
      exit 1
    }
    Write-Host "Instalando OpenCode (opencode.ai/v2/install)..." -ForegroundColor Cyan
    & $bash -lc "curl -fsSL https://opencode.ai/v2/install | bash"
    $bin = Join-Path $env:USERPROFILE '.opencode\bin'
    if (Test-Path $bin) {
      $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
      if ($userPath -notlike "*$bin*") {
        [Environment]::SetEnvironmentVariable('Path', ($userPath.TrimEnd(';') + ';' + $bin), 'User')
        $env:Path = $bin + ';' + $env:Path
        Write-Host "PATH do usuario atualizado: $bin" -ForegroundColor Green
      }
    }
    $exe = Find-Cmd 'opencode'
    if ($exe) {
      Write-Host "OpenCode em $exe" -ForegroundColor Green
      & $exe --version
    } else {
      Write-Host "Instalacao rodou; abra um terminal novo e rode opencode --version." -ForegroundColor Yellow
    }
  }

  'opencode' {
    $exe = Find-Cmd 'opencode'
    if (-not $exe) { Write-Host "OpenCode nao encontrado. Rode install-opencode." -ForegroundColor Red; exit 1 }
    Open-AgentTerminal 'OpenCode' "opencode"
  }

  'grok' {
    if (-not (Find-Cmd 'grok')) { Write-Host "grok nao encontrado no PATH." -ForegroundColor Red; exit 1 }
    Open-AgentTerminal 'Grok CLI' "grok"
  }

  'omp' {
    if (-not (Find-Cmd 'omp')) { Write-Host "omp nao encontrado. Verifique %LOCALAPPDATA%\omp." -ForegroundColor Red; exit 1 }
    Open-AgentTerminal 'OMP' "omp --model qwen2.5-coder:3b-instruct"
  }

  'copilot' {
    if (-not (Find-Cmd 'copilot')) { Write-Host "GitHub Copilot CLI nao encontrado." -ForegroundColor Red; exit 1 }
    Open-AgentTerminal 'Copilot CLI' "copilot"
  }

  'llamacpp-status' {
    Write-Host "===== llama.cpp =====" -ForegroundColor Cyan
    Write-Host ("API  http://127.0.0.1:8080/v1  {0}" -f (Probe-Http 'http://127.0.0.1:8080/v1/models'))
    $srv = Find-Cmd 'llama-server'
    $cli = Find-Cmd 'llama-cli'
    if ($srv) { Write-Host "llama-server: $srv" } else { Write-Host "llama-server nao esta no PATH. Suba o servidor e aponte o provedor llama.cpp no painel de chaves." -ForegroundColor Yellow }
    if ($cli) { Write-Host "llama-cli: $cli" }
    Write-Host "No Mestre: Chaves de API -> llama.cpp -> Testar conexao (porta 8080)."
  }
}
