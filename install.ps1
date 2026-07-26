# ================================================================
# Mestre do PC V10 - Instalador Automatizado
# ================================================================
# Instala Node.js (se ausente), dependencias do MCP, tarefa agendada,
# registra o MCP no Claude Desktop e cria atalhos.
#
# Uso:
#   pwsh -ExecutionPolicy Bypass -File install.ps1
#   pwsh -ExecutionPolicy Bypass -File install.ps1 -SkipNode -NoShortcuts
# ================================================================

param(
    [string] $InstallDir = $PSScriptRoot,
    [switch] $SkipNode,
    [switch] $SkipMcpConfig,
    [switch] $NoShortcuts,
    [switch] $Quiet
)

$ErrorActionPreference = "Stop"

function Write-Step {
    param([string] $Message, [string] $Color = "Cyan")
    if (-not $Quiet) { Write-Host "[INSTALL] $Message" -ForegroundColor $Color }
}

function Write-Ok    { param([string] $m) if (-not $Quiet) { Write-Host "[ OK ] $m" -ForegroundColor Green } }
function Write-Warn2 { param([string] $m) if (-not $Quiet) { Write-Host "[WARN] $m" -ForegroundColor Yellow } }

# ---------------------------------------------------------------
# 0. Exige Administrador
# ---------------------------------------------------------------
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Warn2 "Reiniciando como Administrador..."
    $psExe = Join-Path $env:WINDIR "System32\WindowsPowerShell\v1.0\powershell.exe"
    Start-Process $psExe -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    exit
}

Write-Step "Diretorio de instalacao: $InstallDir"

# ---------------------------------------------------------------
# 1. Valida arquivos essenciais
# ---------------------------------------------------------------
$required = @(
    "MestreDoPC-Launcher.ps1",
    "Register-MestreTask.ps1",
    "start-mestre.bat",
    "v10\start-v10.bat",
    "v10\index.html",
    "mcp-server\package.json",
    "mcp-server\index.js"
)
foreach ($rel in $required) {
    $full = Join-Path $InstallDir $rel
    if (-not (Test-Path $full)) {
        Write-Error "Arquivo obrigatorio nao encontrado: $full"
        exit 1
    }
}
Write-Ok "Arquivos essenciais presentes."

# ---------------------------------------------------------------
# 2. Node.js (winget) - idempotente
# ---------------------------------------------------------------
if (-not $SkipNode) {
    Write-Step "Verificando Node.js..."
    $node = Get-Command node -ErrorAction SilentlyContinue
    if ($node) {
        $ver = & node --version
        Write-Ok "Node detectado: $ver"
    } else {
        Write-Warn2 "Node.js ausente. Instalando via winget..."
        $winget = Get-Command winget -ErrorAction SilentlyContinue
        if (-not $winget) {
            Write-Error "winget nao esta disponivel. Instale Node.js LTS manualmente de https://nodejs.org"
            exit 1
        }
        & winget install --id OpenJS.NodeJS.LTS --silent --accept-source-agreements --accept-package-agreements
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Falha ao instalar Node.js via winget (codigo $LASTEXITCODE)."
            exit 1
        }
        # Recarrega PATH para a sessao atual
        $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
                    [Environment]::GetEnvironmentVariable("Path", "User")
        Write-Ok "Node.js instalado."
    }
}

# ---------------------------------------------------------------
# 3. npm install no mcp-server
# ---------------------------------------------------------------
$mcpDir = Join-Path $InstallDir "mcp-server"
Write-Step "Instalando dependencias do mcp-server..."
Push-Location $mcpDir
try {
    & npm install --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw "npm install falhou (codigo $LASTEXITCODE)" }
    Write-Ok "Dependencias instaladas."
} finally {
    Pop-Location
}

# ---------------------------------------------------------------
# 3b. Ollama + signin (para modelos cloud)
# ---------------------------------------------------------------
Write-Step "Verificando Ollama..."
$ollama = Get-Command ollama -ErrorAction SilentlyContinue
if ($ollama) {
    Write-Ok "Ollama detectado: $(& ollama -v 2>&1 | Select-Object -First 1)"
    # Baixa modelo local padrao (nao exige login)
    if (-not (& ollama list 2>$null | Select-String -SimpleMatch 'qwen2.5-coder')) {
        Write-Step "Baixando modelo local padrao qwen2.5-coder:1.5b (~1 GB)..."
        & ollama pull qwen2.5-coder:1.5b 2>&1 | Out-Host
    } else {
        Write-Ok "Modelo local qwen2.5-coder ja presente."
    }
    # Signin para modelos cloud (opcional, interativo)
    Write-Step "Ollama Cloud (opcional): para usar modelos cloud (glm-5.2:cloud, gemma4:cloud...) execute 'ollama signin' apos a instalacao."
} else {
    Write-Warn2 "Ollama ausente. A IA Local nao funcionara. Instale via: irm https://ollama.com/install.ps1 | iex"
    Write-Warn2 "Ou baixe em https://ollama.com/download — depois rode novamente este instalador."
}

# ---------------------------------------------------------------
# 4a. Tarefa agendada do Launcher (Admin, AtLogon)
# ---------------------------------------------------------------
Write-Step "Registrando tarefa do Launcher (AtLogon, Admin)..."
$registerScript = Join-Path $InstallDir "Register-MestreTask.ps1"
& $registerScript -InstallDir $InstallDir -Quiet
if ($LASTEXITCODE -ne 0) { throw "Falha ao registrar tarefa do launcher." }
Write-Ok "Tarefa 'MestreDoPC_Admin_Launcher' registrada com trigger AtLogon."

# ---------------------------------------------------------------
# 4b. Tarefa de Startup (usuario, AtLogon, sem Admin)
#     Garante Ollama + pre-aquece o modelo local + re-sobe launcher se morreu
# ---------------------------------------------------------------
Write-Step "Registrando tarefa de startup (Ollama + modelo)..."
$startupScript = Join-Path $InstallDir "startup\MestreDoPC-Startup.ps1"
if (Test-Path $startupScript) {
    $psExe     = Join-Path $env:WINDIR "System32\WindowsPowerShell\v1.0\powershell.exe"
    $userId    = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    $stAction  = New-ScheduledTaskAction `
                     -Execute  $psExe `
                     -Argument "-NoLogo -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$startupScript`""
    $stTrigger = New-ScheduledTaskTrigger -AtLogon -User $userId
    $stPrincipal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited
    $stSettings = New-ScheduledTaskSettingsSet `
                     -AllowStartIfOnBatteries `
                     -DontStopIfGoingOnBatteries `
                     -StartWhenAvailable `
                     -MultipleInstances IgnoreNew `
                     -ExecutionTimeLimit (New-TimeSpan -Minutes 5)

    try { Unregister-ScheduledTask -TaskName "MestreDoPC_Startup" -Confirm:$false -ErrorAction SilentlyContinue | Out-Null } catch {}
    Register-ScheduledTask `
        -TaskName  "MestreDoPC_Startup" `
        -Action    $stAction   `
        -Trigger   $stTrigger  `
        -Principal $stPrincipal `
        -Settings  $stSettings  `
        -Force | Out-Null
    Write-Ok "Tarefa 'MestreDoPC_Startup' registrada com trigger AtLogon."
} else {
    Write-Warn2 "startup\MestreDoPC-Startup.ps1 nao encontrado — tarefa de startup pulada."
}

# ---------------------------------------------------------------
# 5. Registro MCP — prioriza Claude Code (CLI) e cai para Claude Desktop
# ---------------------------------------------------------------
if (-not $SkipMcpConfig) {
    Write-Step "Registrando MCP..."

    # Caminho 1: Claude Code CLI (se disponivel) -> ~/.claude.json
    $claudeCli = Get-Command claude -ErrorAction SilentlyContinue
    if ($claudeCli) {
        $indexJsCli = (Join-Path $InstallDir "mcp-server\index.js")
        try {
            & claude mcp remove mestre_do_pc --scope user 2>$null | Out-Null
            & claude mcp add mestre_do_pc --scope user --env "MESTRE_PROJETO_PATH=$InstallDir" -- node $indexJsCli
            if ($LASTEXITCODE -eq 0) {
                Write-Ok "MCP 'mestre_do_pc' registrado no Claude Code (~/.claude.json)."
            }
        } catch {
            Write-Warn2 "Claude CLI presente mas falhou: $($_.Exception.Message)"
        }
    }

    Write-Step "Configurando MCP no Claude Desktop (fallback)..."
    $claudeCfgDir  = Join-Path $env:APPDATA "Claude"
    $claudeCfgFile = Join-Path $claudeCfgDir "claude_desktop_config.json"

    if (-not (Test-Path $claudeCfgDir)) {
        New-Item -ItemType Directory -Path $claudeCfgDir -Force | Out-Null
    }

    # Converte PSCustomObject (saida de ConvertFrom-Json em PS 5.1) em hashtable recursivo.
    function ConvertTo-HashtableDeep {
        param($obj)
        if ($null -eq $obj) { return $null }
        if ($obj -is [System.Collections.IDictionary]) { return $obj }
        if ($obj -is [System.Management.Automation.PSCustomObject]) {
            $h = [ordered]@{}
            foreach ($p in $obj.PSObject.Properties) {
                $h[$p.Name] = ConvertTo-HashtableDeep $p.Value
            }
            return $h
        }
        if ($obj -is [System.Collections.IEnumerable] -and -not ($obj -is [string])) {
            return @($obj | ForEach-Object { ConvertTo-HashtableDeep $_ })
        }
        return $obj
    }

    $cfg = [ordered]@{}
    if (Test-Path $claudeCfgFile) {
        try {
            $raw = Get-Content $claudeCfgFile -Raw -ErrorAction Stop
            if ($raw.Trim().Length -gt 0) {
                $parsed = $raw | ConvertFrom-Json -ErrorAction Stop
                $cfg = ConvertTo-HashtableDeep $parsed
                if (-not ($cfg -is [System.Collections.IDictionary])) { $cfg = [ordered]@{} }
            }
        } catch {
            Write-Warn2 "Config atual invalido. Fazendo backup em claude_desktop_config.json.bak"
            Copy-Item $claudeCfgFile "$claudeCfgFile.bak" -Force
            $cfg = [ordered]@{}
        }
    }

    if (-not $cfg.Contains("mcpServers")) { $cfg["mcpServers"] = [ordered]@{} }
    if (-not ($cfg["mcpServers"] -is [System.Collections.IDictionary])) {
        $cfg["mcpServers"] = [ordered]@{}
    }

    $indexJs = (Join-Path $InstallDir "mcp-server\index.js")
    $cfg["mcpServers"]["mestre_do_pc"] = [ordered]@{
        command = "node"
        args    = @($indexJs)
        env     = [ordered]@{ MESTRE_PROJETO_PATH = $InstallDir }
    }

    ($cfg | ConvertTo-Json -Depth 10) | Set-Content -Path $claudeCfgFile -Encoding UTF8
    Write-Ok "MCP 'mestre_do_pc' registrado em $claudeCfgFile"
}

# ---------------------------------------------------------------
# 6. Atalhos (Desktop + Menu Iniciar)
# ---------------------------------------------------------------
if (-not $NoShortcuts) {
    Write-Step "Criando atalhos..."
    $startBat = Join-Path $InstallDir "v10\start-v10.bat"
    $iconPath = Join-Path $InstallDir "icon.ico"

    $targets = @(
        (Join-Path ([Environment]::GetFolderPath("Desktop")) "Mestre do PC.lnk"),
        (Join-Path ([Environment]::GetFolderPath("Programs")) "Mestre do PC.lnk")
    )

    $wsh = New-Object -ComObject WScript.Shell
    foreach ($lnk in $targets) {
        $s = $wsh.CreateShortcut($lnk)
        $s.TargetPath       = $startBat
        $s.WorkingDirectory = Join-Path $InstallDir "v10"
        if (Test-Path $iconPath) { $s.IconLocation = $iconPath }
        $s.Description      = "Mestre do PC V10 - Ultimate Plus"
        $s.Save()
    }
    Write-Ok "Atalhos criados."
}

# ---------------------------------------------------------------
# 7. Health-check: aciona launcher e faz GET /ping
# ---------------------------------------------------------------
Write-Step "Health-check..."
try {
    Start-ScheduledTask -TaskName "MestreDoPC_Admin_Launcher" -ErrorAction Stop
} catch {
    Write-Warn2 "Nao foi possivel disparar a tarefa agendada automaticamente."
}

$ok = $false
for ($i = 0; $i -lt 20; $i++) {
    try {
        $r = Invoke-RestMethod -Uri "http://127.0.0.1:7777/ping" -TimeoutSec 2 -ErrorAction Stop
        if ($r.status -eq "ok") { $ok = $true; break }
    } catch { }
    Start-Sleep -Seconds 1
}

if ($ok) {
    Write-Ok "Launcher respondendo em http://127.0.0.1:7777"
} else {
    Write-Warn2 "Launcher nao respondeu em 20s. Verifique manualmente rodando v10\start-v10.bat"
}

Write-Host ""
Write-Host "==================================================" -ForegroundColor Green
Write-Host " INSTALACAO CONCLUIDA" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
Write-Host " * Reinicie o Claude Desktop para carregar o MCP." -ForegroundColor Gray
Write-Host " * Abra 'Mestre do PC' pelo atalho do Desktop."    -ForegroundColor Gray
Write-Host ""
