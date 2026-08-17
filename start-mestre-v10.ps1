# ================================================================
# Mestre do PC V10 - Ativador Completo (atalho do Desktop)
# ================================================================
# Ao clicar no atalho, este script:
#   1. Verifica/ativa o Ollama em localhost:11434
#   2. Verifica/ativa o Launcher Mestre do PC em 127.0.0.1:7777
#   3. Abre a interface web no navegador padrao
# ================================================================

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$InstallDir = $PSScriptRoot
$OllamaExe = "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe"
$OllamaApi = "http://localhost:11434"
$LauncherUrl = "http://127.0.0.1:7777"
$LauncherPs1 = Join-Path $InstallDir "MestreDoPC-Launcher.ps1"
$LogFile = Join-Path $InstallDir "logs\shortcut.log"

function Write-Log {
    param([string] $msg, [string] $level = "INFO")
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$ts] [$level] $msg"
    Write-Host $line
    try {
        $dir = Split-Path $LogFile
        if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
        Add-Content -Path $LogFile -Value $line -ErrorAction SilentlyContinue
    } catch {}
}

function Wait-Http {
    param([string] $Url, [int] $MaxSeconds = 30)
    for ($i = 0; $i -lt $MaxSeconds; $i++) {
        try {
            $r = Invoke-RestMethod -Uri $Url -TimeoutSec 2 -ErrorAction Stop
            return $true
        } catch {}
        Start-Sleep -Seconds 1
    }
    return $false
}

function Start-Ollama {
    Write-Log "Ollama nao respondeu. Tentando iniciar..."
    if (Test-Path $OllamaExe) {
        Start-Process -FilePath $OllamaExe -WindowStyle Hidden -ErrorAction SilentlyContinue
        if (Wait-Http -Url "$OllamaApi/api/tags" -MaxSeconds 30) {
            Write-Log "Ollama iniciado com sucesso." -level "OK"
            return $true
        }
    }
    Write-Log "Nao foi possivel iniciar o Ollama automaticamente." -level "WARN"
    return $false
}

function Start-MestreLauncher {
    Write-Log "Verificando Launcher Mestre do PC em $LauncherUrl ..."
    if (Wait-Http -Url "$LauncherUrl/ping" -MaxSeconds 3) {
        Write-Log "Launcher ja esta rodando." -level "OK"
        return $true
    }

    # A porta 7777 é a fonte da verdade. O PID file pode apontar para um
    # processo que já morreu e teve o PID reutilizado por outro programa —
    # confiar nele faz o script achar que o launcher está no ar quando não está.
    # Por isso não lemos o PID file aqui: se a porta não respondeu acima,
    # simplesmente iniciamos o launcher de novo.

    Write-Log "Iniciando MestreDoPC-Launcher.ps1..."
    if (-not (Test-Path $LauncherPs1)) {
        throw "Launcher nao encontrado: $LauncherPs1"
    }

    # MestreDoPC-Launcher.ps1 se auto-eleva; aqui chamamos sem admin.
    Start-Process -FilePath "pwsh.exe" `
        -ArgumentList "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$LauncherPs1`"" `
        -WorkingDirectory $InstallDir

    if (Wait-Http -Url "$LauncherUrl/ping" -MaxSeconds 30) {
        Write-Log "Launcher iniciado com sucesso." -level "OK"
        return $true
    }

    return $false
}

# ================================================================
# 1. Ollama
# ================================================================
Write-Log "Verificando Ollama em $OllamaApi ..."
if (-not (Wait-Http -Url "$OllamaApi/api/tags" -MaxSeconds 3)) {
    Start-Ollama | Out-Null
}

# ================================================================
# 2. Launcher Mestre do PC
# ================================================================
$launcherOk = Start-MestreLauncher
if (-not $launcherOk) {
    throw "Nao foi possivel iniciar o Launcher Mestre do PC em $LauncherUrl"
}

# ================================================================
# 3. Abrir navegador
# ================================================================
Write-Log "Abrindo interface web em $LauncherUrl ..."
Start-Process $LauncherUrl

Write-Log "Mestre do PC V10 ativado com sucesso!" -level "OK"
