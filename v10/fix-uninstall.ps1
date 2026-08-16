$opsPath = 'C:\Users\Jeanc\Mestre-do-PC-V10-clean\v10\allowed-operations.json'
$data = Get-Content $opsPath -Raw | ConvertFrom-Json

# Reverter: desinstalar_atualizacao_especifica deve ser destructive
# wusa /uninstall desinstala uma atualizacao do Windows
foreach ($op in $data.operations) {
  if ($op.id -eq 'desinstalar_atualizacao_especifica') {
    $op.destructive = $true
    Write-Output "✅ $($op.id) -> Destructive: True (wusa /uninstall remove atualizacao do sistema)"
  }
}

$data | ConvertTo-Json -Depth 10 | Set-Content $opsPath -Encoding UTF8
Write-Output "Salvo."