# Script de Reinício do Launcher - Mestre do PC V10/V11
# Para as instâncias antigas e inicia uma nova

Write-Host "🔄 Reiniciando o Launcher do Mestre do PC..." -ForegroundColor Cyan

# Para processos do launcher Node.js
Write-Host "⏹️  Parando launcher Node.js..." -ForegroundColor Yellow
$nodeProcs = Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like '*launcher.js*' }
if ($nodeProcs) {
    $nodeProcs | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}

# Para processos do launcher PowerShell
Write-Host "⏹️  Parando launcher PowerShell..." -ForegroundColor Yellow
$psProcs = Get-Process | Where-Object { $_.ProcessName -like '*MestreDoPC*' }
if ($psProcs) {
    $psProcs | Stop-Process -Force -ErrorAction SilentlyContinue
}

Start-Sleep -Seconds 2

# Verifica se ainda há processos
$remainingNode = Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like '*launcher.js*' }
$remainingPs = Get-Process | Where-Object { $_.ProcessName -like '*MestreDoPC*' }

if ($remainingNode -or $remainingPs) {
    Write-Host "⚠️  Alguns processos ainda estão em execução. Tentando forçar..." -ForegroundColor Yellow
    if ($remainingNode) {
        $remainingNode | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    }
    if ($remainingPs) {
        $remainingPs | Stop-Process -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 2
}

Write-Host "✅ Processos antigos encerrados." -ForegroundColor Green

# Inicia o novo launcher (Node.js)
Write-Host "🚀 Iniciando novo launcher (Node.js)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoProfile -WindowStyle Hidden -Command `"cd '$PSScriptRoot\v10'; npm start`""

Start-Sleep -Seconds 3

# Verifica se o launcher está rodando
$checking = $true
$attempts = 0
$maxAttempts = 10

while ($checking -and $attempts -lt $maxAttempts) {
    Start-Sleep -Seconds 1
    try {
        $response = Invoke-WebRequest -Uri "http://127.0.0.1:7777/" -TimeoutSec 2 -UseBasicParsing
        if ($response.StatusCode -eq 200) {
            $checking = $false
            Write-Host "✅ Launcher iniciado com sucesso!" -ForegroundColor Green
            Write-Host "🌐 Acesse: http://127.0.0.1:7777/" -ForegroundColor Cyan
        }
    } catch {
        $attempts++
        Write-Host "⏳ Aguardando launcher... ($attempts/$maxAttempts)" -ForegroundColor Yellow
    }
}

if ($checking) {
    Write-Host "❌ Launcher não respondeu após $maxAttempts tentativas." -ForegroundColor Red
    Write-Host "📝 Verifique os logs em: C:\Users\Jeanc\Mestre-do-PC-V10-clean\v10\" -ForegroundColor Yellow
}
