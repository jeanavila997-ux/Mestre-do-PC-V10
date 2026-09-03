# ============================================================
#  Mestre do PC - Inicializador robusto (PowerShell)
#  Isola PS 5.1 e PS 7, permite segundo plano
# ============================================================
#  Uso:
#    .\iniciar-mestre.ps1              - Inicia launcher Node em segundo plano
#    .\iniciar-mestre.ps1 -Elevado      - Inicia launcher PowerShell elevado
#    .\iniciar-mestre.ps1 -Foreground   - Inicia launcher Node em primeiro plano
#    .\iniciar-mestre.ps1 -Stop         - Para o launcher em execucao
#    .\iniciar-mestre.ps1 -Status       - Verifica se o launcher esta ativo

[CmdletBinding()]
param(
    [switch]$Elevado,
    [switch]$Foreground,
    [switch]$Stop,
    [switch]$Status
)

$ErrorActionPreference = 'Stop'

# --- Isolamento de PSModulePath -----------------------------------------------
# Garante que PS 5.1 só veja modulos do PS 5.1, mesmo se invocado de uma
# sessao do PS 7 que poluiu a variavel de ambiente.
$env:PSModulePath = @(
    "$env:USERPROFILE\OneDrive\Documents\WindowsPowerShell\Modules",
    "$env:ProgramFiles\WindowsPowerShell\Modules",
    "$env:SystemRoot\system32\WindowsPowerShell\v1.0\Modules"
) -join ';'

# --- Constantes ---------------------------------------------------------------
$ProjectDir = Join-Path $env:USERPROFILE 'Mestre-do-PC-V10-clean'
$NodeLauncher = Join-Path $ProjectDir 'v10\launcher.js'
$PsLauncher = Join-Path $ProjectDir 'MestreDoPC-Launcher.ps1'
$BaseUrl = 'http://127.0.0.1:7777'

# --- Helper: verificar se o launcher esta ativo ------------------------------
function Test-LauncherAtivo {
    try {
        $resp = Invoke-WebRequest -Uri "$BaseUrl/status" -UseBasicParsing -TimeoutSec 3
        return ($resp.StatusCode -eq 200)
    } catch {
        return $false
    }
}

# --- Helper: obter PID do launcher Node --------------------------------------
function Get-LauncherPid {
    $nodePath = (Get-Command node -ErrorAction SilentlyContinue).Source
    if (-not $nodePath) { return $null }
    $procs = Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -match 'launcher\.js' }
    if ($procs) { return $procs.ProcessId | Select-Object -First 1 }
    return $null
}

# --- Modo -Stop ---------------------------------------------------------------
if ($Stop) {
    $pid_ = Get-LauncherPid
    if ($pid_) {
        Stop-Process -Id $pid_ -Force -ErrorAction SilentlyContinue
        Write-Host "[OK] Launcher Node (PID $pid_) finalizado." -ForegroundColor Green
    } else {
        Write-Host "[INFO] Nenhum launcher Node encontrado em execucao." -ForegroundColor Yellow
    }
    return
}

# --- Modo -Status -------------------------------------------------------------
if ($Status) {
    if (Test-LauncherAtivo) {
        $pid_ = Get-LauncherPid
        Write-Host "[OK] Launcher ativo em $BaseUrl (PID: $pid_)" -ForegroundColor Green
    } else {
        Write-Host "[INFO] Launcher nao esta respondendo em $BaseUrl" -ForegroundColor Yellow
    }
    return
}

# --- Modo -Elevado: launcher PowerShell --------------------------------------
if ($Elevado) {
    if (Test-LauncherAtivo) {
        Write-Host "[INFO] Launcher ja esta ativo em $BaseUrl" -ForegroundColor Yellow
        Start-Process $BaseUrl
        return
    }

    Write-Host "[INFO] Iniciando launcher PowerShell elevado..." -ForegroundColor Cyan
    $psExe = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
    Start-Process $psExe -Verb RunAs -ArgumentList @(
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-WindowStyle', 'Hidden',
        '-File', "`"$PsLauncher`""
    )
    Start-Sleep -Seconds 4
    if (Test-LauncherAtivo) {
        Write-Host "[OK] Launcher PowerShell elevado ativo em $BaseUrl" -ForegroundColor Green
        Start-Process $BaseUrl
    } else {
        Write-Warning "Nao foi possivel confirmar o launcher elevado."
        Start-Process $BaseUrl
    }
    return
}

# --- Modo padrao: launcher Node em segundo plano ------------------------------
if (Test-LauncherAtivo) {
    Write-Host "[INFO] Launcher ja esta ativo em $BaseUrl" -ForegroundColor Yellow
    Start-Process $BaseUrl
    return
}

$nodeExe = (Get-Command node -ErrorAction Stop).Source

if ($Foreground) {
    Write-Host "[INFO] Iniciando launcher Node em primeiro plano..." -ForegroundColor Cyan
    Write-Host "[INFO] Pressione Ctrl+C para parar." -ForegroundColor DarkGray
    & $nodeExe $NodeLauncher
    return
}

Write-Host "[INFO] Iniciando launcher Node em segundo plano..." -ForegroundColor Cyan

$job = Start-Job -ScriptBlock {
    param($Node, $Path)
    & $Node $Path
} -ArgumentList $nodeExe, $NodeLauncher

Start-Sleep -Seconds 3

if (Test-LauncherAtivo) {
    $jobId = $job.Id
    Write-Host "[OK] Launcher Node ativo em $BaseUrl (Job ID: $jobId)" -ForegroundColor Green
    Write-Host "[INFO] Para parar: .\iniciar-mestre.ps1 -Stop" -ForegroundColor DarkGray
    Start-Process $BaseUrl
} else {
    Write-Warning "Launcher iniciado mas ainda nao responde. Aguardando..."
    Start-Sleep -Seconds 2
    Start-Process $BaseUrl
}