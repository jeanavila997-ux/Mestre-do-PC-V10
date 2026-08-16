$conn = Get-NetTCPConnection -LocalPort 7777 -ErrorAction SilentlyContinue | Select-Object -First 1
if ($conn) {
  $p = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
  Write-Output ('Port 7777 is LISTENING by: ' + $p.ProcessName + ' (PID ' + $p.Id + ')')
} else {
  Write-Output 'Port 7777 is NOT listening'
}

$mpp = $env:MESTRE_PROJETO_PATH
if (-not $mpp) { $mpp = 'NOT_SET' }
Write-Output ('MESTRE_PROJETO_PATH=' + $mpp)
Write-Output ('node_modules present=' + (Test-Path 'C:\Users\Jeanc\Mestre-do-PC-V10-clean\mcp-server\node_modules'))
