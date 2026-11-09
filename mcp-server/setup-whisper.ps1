# Setup da integracao Whisper - Mestre do PC V11
# Cria o venv Python em %LOCALAPPDATA%\MestreDoPC\whisper-venv e instala faster-whisper.
# Executar: pwsh -NoProfile -File mcp-server\setup-whisper.ps1

$ErrorActionPreference = "Stop"
$venv = Join-Path $env:LOCALAPPDATA "MestreDoPC\whisper-venv"
$python = Join-Path $venv "Scripts\python.exe"

Write-Host "Setup do Whisper (faster-whisper) no Mestre do PC V11" -ForegroundColor Cyan

if (-not (Test-Path $python)) {
    Write-Host "1. Criando venv em $venv ..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Force -Path (Split-Path $venv) | Out-Null
    & py -3 -m venv $venv 2>$null
    if ($LASTEXITCODE -ne 0) { & python -m venv $venv }
} else {
    Write-Host "1. Venv ja existe: $venv" -ForegroundColor Green
}

Write-Host "2. Instalando dependencias (faster-whisper, sounddevice, soundfile, av<16)..." -ForegroundColor Yellow
& $python -m pip install --upgrade pip --quiet
& $python -m pip install faster-whisper sounddevice soundfile "av>=13,<16" --quiet

Write-Host "3. Verificando importacao..." -ForegroundColor Yellow
& $python -c "import faster_whisper, sounddevice, soundfile; print('ok')"

Write-Host ""
Write-Host "Pronto. O modelo (padrao: base) e baixado na primeira transcricao." -ForegroundColor Green
Write-Host "Teste: cd mcp-server; node test-audio-transcription.js" -ForegroundColor Cyan
