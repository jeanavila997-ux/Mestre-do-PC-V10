$opsPath = Join-Path $PSScriptRoot 'allowed-operations.json'
$data = Get-Content $opsPath -Raw | ConvertFrom-Json

$fixes = 0
foreach ($op in $data.operations) {
  if ($op.id -eq 'drivers_com_problema' -or $op.id -eq 'verificar_drivers_problematicos') {
    Write-Output "=== CORRIGINDO: $($op.id) ==="
    
    # 1. Get-WmiObject -> Get-CimInstance
    $oldCmd = $op.command
    $op.command = $op.command -replace 'Get-WmiObject', 'Get-CimInstance'
    Write-Output "  Comando:"
    Write-Output "    ANTES: $oldCmd"
    Write-Output "    DEPOIS: $($op.command)"
    
    # 2. Categoria: Backup -> Drivers
    $oldCat = $op.category
    $op.category = 'Drivers'
    Write-Output "  Categoria: $oldCat -> Drivers"
    
    # 3. Destructive: True -> False (é apenas leitura)
    $oldDest = $op.destructive
    $op.destructive = $false
    Write-Output "  Destructive: $oldDest -> False"
    Write-Output ""
    $fixes++
  }
}

if ($fixes -gt 0) {
  $data | ConvertTo-Json -Depth 10 | Set-Content $opsPath -Encoding UTF8
  Write-Output "✅ $fixes operacoes corrigidas e salvas em allowed-operations.json"
} else {
  Write-Output "❌ Nenhuma operacao encontrada para corrigir"
}