$launcherPath = 'C:\Users\Jeanc\Mestre-do-PC-V10-clean\v10\MestreDoPC-Launcher.ps1'

# Inicia o launcher em background com powershell -WindowStyle Hidden
$job = Start-Job -ScriptBlock {
  param($path)
  powershell -ExecutionPolicy Bypass -File $path
} -ArgumentList $launcherPath

Write-Output ('Launcher started in background (Job ID: ' + $job.Id + ')')
Write-Output 'Waiting 5 seconds for launcher to initialize...'
Start-Sleep -Seconds 5

# Verifica se a porta 7777 está ouvindo
$conn = Get-NetTCPConnection -LocalPort 7777 -ErrorAction SilentlyContinue | Select-Object -First 1
if ($conn) {
  Write-Output '✅ Launcher is running on port 7777'
} else {
  Write-Output '❌ Launcher did not start on port 7777'
}
