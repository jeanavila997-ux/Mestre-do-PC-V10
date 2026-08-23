$opsPath = Join-Path $PSScriptRoot 'allowed-operations.json'
$data = Get-Content $opsPath -Raw | ConvertFrom-Json

$wmiCount = 0
$destReadonly = @()

foreach ($op in $data.operations) {
  if ($op.command -match 'Get-WmiObject') {
    $wmiCount++
    Write-Output "WMI: $($op.id) | $($op.category) | $($op.destructive)"
    Write-Output "  $($op.command.Substring(0, [Math]::Min(120, $op.command.Length)))..."
    Write-Output ""
  }
  
  # Verifica se comandos de leitura estao marcados como destructive
  $cmd = $op.command.ToLower()
  $isReadOnly = $cmd -match 'get-ciminstance|get-wmiobject|get-(item|childitem|process|service|event|content|computerinfo)|select-|where-|format-|out-|export-csv|test-|show-|read-|find-|measure-|sort-|group-|compare-'
  if ($op.destructive -eq $true -and $isReadOnly) {
    $destReadonly += $op
  }
}

Write-Output "=== RESUMO ==="
Write-Output "Get-WmiObject restantes: $wmiCount"
Write-Output "Destructive=True mas parece leitura: $($destReadonly.Count)"
if ($destReadonly.Count -gt 0) {
  Write-Output ""
  foreach ($op in $destReadonly) {
    Write-Output "  $($op.id) | $($op.category) | Destructive=$($op.destructive)"
    Write-Output "    $($op.command.Substring(0, [Math]::Min(100, $op.command.Length)))..."
  }
}