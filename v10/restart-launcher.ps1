Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2
$proc = Start-Process -FilePath 'node' -ArgumentList "$PSScriptRoot\launcher.js" -WindowStyle Minimized -PassThru
Start-Sleep -Seconds 3
Write-Output ('PID: ' + $proc.Id)
try {
    $r = Invoke-WebRequest -Uri 'http://127.0.0.1:7777/ping' -UseBasicParsing -TimeoutSec 5
    Write-Output ('Status: ' + $r.StatusCode + ' | ' + $r.Content)
} catch {
    Write-Output ('Erro: ' + $_.Exception.Message)
}
