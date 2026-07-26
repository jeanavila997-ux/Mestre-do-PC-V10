# ================================================================
# Mestre do PC V10 - Script de Inicializacao
# ================================================================
# Roda no logon via tarefa agendada MESTREDOPC_STARTUP.
# NAO precisa de Admin — apenas verifica e garante servicos.
#
# Fluxo:
#   1. Aguarda 10s (sistema completar o login)
#   2. Garante Ollama rodando em localhost:11434
#   3. Pre-aquece o modelo local padrao
#   4. Garante launcher Mestre do PC rodando em :7777
# ================================================================

$ErrorActionPreference = "SilentlyContinue"

$LogFile    = Join-Path $PSScriptRoot "..\logs\startup.log"
$OllamaExe  = "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe"
$OllamaApi  = "http://localhost:11434"
$LauncherTask = "MestreDoPC_Admin_Launcher"
$MestreApi  = "http://127.0.0.1:7777"
$Model      = "qwen2.5-coder:1.5b"          # local, funciona offline e sem login

function Log {
    param([string] $msg)
    $ts = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
    $line = "[$ts] $msg"
    Write-Host $line
    try {
        $dir = Split-Path $LogFile
        if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
        Add-Content -Path $LogFile -Value $line -ErrorAction SilentlyContinue
    } catch {}
}

function Wait-Http {
    param([string] $Url, [int] $MaxWait = 20)
    for ($i = 0; $i -lt $MaxWait; $i++) {
        try {
            $r = Invoke-RestMethod -Uri $Url -TimeoutSec 2 -ErrorAction Stop
            return $true
        } catch {}
        Start-Sleep -Seconds 1
    }
    return $false
}

# ------------------------------------------------------------------
# 1. Aguarda o login terminar
# ------------------------------------------------------------------
Log "Startup iniciado. Aguardando 10s..."
Start-Sleep -Seconds 10

# ------------------------------------------------------------------
# 2. Garante Ollama rodando
# ------------------------------------------------------------------
Log "Verificando Ollama em $OllamaApi ..."
$ollamaOk = Wait-Http -Url "$OllamaApi/api/tags" -MaxWait 8

if (-not $ollamaOk) {
    Log "Ollama nao respondeu. Tentando iniciar..."
    if (Test-Path $OllamaExe) {
        Start-Process -FilePath $OllamaExe -WindowStyle Hidden
        $ollamaOk = Wait-Http -Url "$OllamaApi/api/tags" -MaxWait 20
    } else {
        Log "WARN: ollama.exe nao encontrado em $OllamaExe"
    }
}

if ($ollamaOk) {
    Log "Ollama OK."
} else {
    Log "WARN: Ollama nao subiu em 30s. Continuando sem pre-aquecimento."
}

# ------------------------------------------------------------------
# 3. Pre-aquece o modelo local por 10 minutos
# ------------------------------------------------------------------
if ($ollamaOk) {
    Log "Pre-aquecendo modelo $Model ..."
    try {
        $body = @{ model = $Model; prompt = ""; keep_alive = "10m" } | ConvertTo-Json -Compress
        $warmRes = Invoke-RestMethod `
            -Uri "$OllamaApi/api/generate" `
            -Method POST `
            -ContentType "application/json" `
            -Body $body `
            -TimeoutSec 60 `
            -ErrorAction Stop
        Log "Modelo $Model aquecido e em memoria (keepalive 10min)."
    } catch {
        Log "WARN: Pre-aquecimento falhou: $($_.Exception.Message)"
    }
}

# ------------------------------------------------------------------
# 4. Garante launcher Mestre do PC rodando
# ------------------------------------------------------------------
Log "Verificando launcher em $MestreApi ..."
try {
    $ping = Invoke-RestMethod -Uri "$MestreApi/ping" -TimeoutSec 2 -ErrorAction Stop
    if ($ping.status -eq "ok") {
        Log "Launcher ja rodando (PID $($ping.pid), Admin=$($ping.admin))."
        exit 0
    }
} catch {}

Log "Launcher nao respondeu. Disparando tarefa '$LauncherTask'..."
try {
    Start-ScheduledTask -TaskName $LauncherTask -ErrorAction Stop
    $started = Wait-Http -Url "$MestreApi/ping" -MaxWait 20
    if ($started) {
        Log "Launcher subiu com sucesso."
    } else {
        Log "WARN: Launcher nao respondeu em 20s. Verifique manualmente."
    }
} catch {
    Log "ERRO ao disparar tarefa: $($_.Exception.Message)"
}

Log "Startup concluido."
