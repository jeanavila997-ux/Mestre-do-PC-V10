$opsPath = 'C:\Users\Jeanc\Mestre-do-PC-V10-clean\v10\allowed-operations.json'
$data = Get-Content $opsPath -Raw | ConvertFrom-Json

# Procura a operacao de drivers com problema
$found = $false
foreach ($op in $data.operations) {
  if ($op.id -match 'driver' -and $op.id -match 'problema') {
    Write-Output "=== ANTES ==="
    Write-Output "  ID: $($op.id)"
    Write-Output "  Title: $($op.title)"
    Write-Output "  Category: $($op.category)"
    Write-Output "  Destructive: $($op.destructive)"
    Write-Output "  Command: $($op.command)"
    $found = $true
  }
}

if (-not $found) {
  Write-Output "Operacao nao encontrada por 'driver.*problema'. Listando todas com 'driver':"
  foreach ($op in $data.operations) {
    if ($op.id -match 'driver') {
      Write-Output "  ID: $($op.id) | Cat: $($op.category) | Dest: $($op.destructive)"
      Write-Output "    Command: $($op.command)"
    }
  }
}