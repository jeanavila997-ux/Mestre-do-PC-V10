param(
    [string] $InstallDir = $PSScriptRoot,
    [string] $TaskName  = "MestreDoPC_Admin_Launcher",
    [switch] $Quiet
)

$ErrorActionPreference = "Stop"

$launcherPath = Join-Path $InstallDir "MestreDoPC-Launcher.ps1"
if (-not (Test-Path $launcherPath)) {
    Write-Error "Launcher nao encontrado em: $launcherPath"
    exit 1
}

$powerShellPath = Join-Path $env:WINDIR "System32\WindowsPowerShell\v1.0\powershell.exe"
$userId = [Security.Principal.WindowsIdentity]::GetCurrent().Name

try {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
} catch { }

$action    = New-ScheduledTaskAction `
                 -Execute  $powerShellPath `
                 -Argument "-NoLogo -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$launcherPath`""

# AtLogon: sobe automaticamente ao entrar no Windows
$trigger   = New-ScheduledTaskTrigger -AtLogon -User $userId

$principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Highest

$settings  = New-ScheduledTaskSettingsSet `
                 -AllowStartIfOnBatteries `
                 -DontStopIfGoingOnBatteries `
                 -StartWhenAvailable `
                 -MultipleInstances IgnoreNew `
                 -ExecutionTimeLimit (New-TimeSpan -Hours 0)   # sem limite de tempo

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action   $action  `
    -Trigger  $trigger `
    -Principal $principal `
    -Settings  $settings `
    -Force | Out-Null

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop

if (-not $task) {
    Write-Error "Falha ao validar a tarefa '$TaskName'."
    exit 1
}

if (-not $Quiet) {
    Write-Host "[OK] Tarefa '$TaskName' registrada com trigger AtLogon para $launcherPath" -ForegroundColor Green
}
