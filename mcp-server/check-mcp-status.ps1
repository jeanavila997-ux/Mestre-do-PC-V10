$root = Split-Path -Parent $PSScriptRoot
$conn = Get-NetTCPConnection -LocalPort 7777 -ErrorAction SilentlyContinue | Select-Object -First 1
if ($conn) {
  Write-Output '✅ Launcher está rodando na porta 7777'
  try {
    $r = Invoke-RestMethod -Uri 'http://127.0.0.1:7777/mcp-status' -TimeoutSec 3 -ErrorAction Stop
    Write-Output ('✅ MCP integrado: ' + $r.modelProfile + ' (' + $r.ollamaModel + ')')
  } catch {
    Write-Output '⚠️ Launcher rodando, mas /mcp-status falhou'
    Write-Output ('Erro: ' + $_.Exception.Message)
  }
} else {
  Write-Output '⚠️ Launcher NÃO está rodando'
  Write-Output '📌 Execute INSTALAR.bat como Administrador na raiz do projeto Mestre-do-PC-V10-clean'
  Write-Output ('📌 Ou execute: powershell -ExecutionPolicy Bypass -File "' + $root + '\mcp-server\start-launcher-manual.ps1"')
}
