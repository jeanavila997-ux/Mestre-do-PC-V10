$opsPath = 'C:\Users\Jeanc\Mestre-do-PC-V10-clean\v10\allowed-operations.json'
$data = Get-Content $opsPath -Raw | ConvertFrom-Json

# Palavras-chave que indicam comando destrutivo de verdade
$destructiveKeywords = @(
  'Remove-Item', 'Remove-', 'Stop-Process', 'Stop-Service', 'Disable-',
  'Uninstall-', 'Clear-', 'Reset-', 'Delete', 'del ', 'rd ', 'rmdir',
  'format ', 'diskpart', 'reg delete', 'netsh .*delete', 'schtasks /delete',
  'taskkill', 'Stop-Computer', 'Restart-Computer', 'shutdown',
  'Set-ExecutionPolicy', 'Set-MpPreference', 'Action=Block',
  'New-Item .*Remove', 'Out-Null.*Remove', 'foreach.*Remove-Item'
)

function Test-Destructive($command) {
  $cmd = $command.ToLower()
  foreach ($kw in $destructiveKeywords) {
    if ($cmd -match $kw.ToLower()) { return $true }
  }
  return $false
}

$wmiFixed = 0
$destFixed = 0
$catFixed = 0

foreach ($op in $data.operations) {
  $changed = $false
  
  # 1. Get-WmiObject -> Get-CimInstance
  if ($op.command -match 'Get-WmiObject') {
    $op.command = $op.command -replace 'Get-WmiObject', 'Get-CimInstance'
    $wmiFixed++
    $changed = $true
  }
  
  # 2. Destructive: True -> False se o comando e so leitura
  if ($op.destructive -eq $true -and -not (Test-Destructive $op.command)) {
    Write-Output "DEST FIX: $($op.id) | $($op.category) | comando nao e destrutivo"
    $op.destructive = $false
    $destFixed++
    $changed = $true
  }
  
  # 3. Categoria Backup -> Drivers para operacoes de driver
  if ($op.id -match 'driver' -and $op.category -eq 'Backup') {
    $op.category = 'Drivers'
    $catFixed++
    $changed = $true
  }
  
  if ($changed) {
    Write-Output "  -> $($op.id) | cat=$($op.category) | dest=$($op.destructive)"
  }
}

$data | ConvertTo-Json -Depth 10 | Set-Content $opsPath -Encoding UTF8

Write-Output ""
Write-Output "=== RESUMO ==="
Write-Output "Get-WmiObject -> Get-CimInstance: $wmiFixed corrigidos"
Write-Output "Destructive True -> False: $destFixed corrigidos"
Write-Output "Categoria Backup -> Drivers: $catFixed corrigidos"