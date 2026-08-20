# Launcher primário do V10 é o Node.js (v10\launcher.js), não o PowerShell legado.
$launcherPath = Join-Path (Split-Path -Parent $PSScriptRoot) 'v10\launcher.js'

if (-not (Test-Path $launcherPath)) {
  Write-Output ('❌ Launcher não encontrado: ' + $launcherPath)
  exit 1
}

# Inicia o launcher Node.js em background (janela oculta).
# Obs.: para elevação garantida, use a tarefa agendada MestreDoPC_Admin_Launcher.
$nodeExe = (Get-Command node).Source
$proc = Start-Process -FilePath $nodeExe -ArgumentList "`"$launcherPath`"" -WindowStyle Hidden -PassThru

Write-Output ('Launcher started in background (PID: ' + $proc.Id + ')')
Write-Output 'Waiting 5 seconds for launcher to initialize...'
Start-Sleep -Seconds 5

# Verifica se a porta 7777 está ouvindo
$conn = Get-NetTCPConnection -LocalPort 7777 -ErrorAction SilentlyContinue | Select-Object -First 1
if ($conn) {
  Write-Output '✅ Launcher is running on port 7777'
} else {
  Write-Output '❌ Launcher did not start on port 7777'
}
