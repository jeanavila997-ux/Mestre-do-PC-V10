$opsPath = 'C:\Users\Jeanc\Mestre-do-PC-V10-clean\v10\allowed-operations.json'
$data = Get-Content $opsPath -Raw | ConvertFrom-Json

# Verificar operacoes que podem ter sido marcadas como nao-destrutivas incorretamente
$checkIds = @(
  'desinstalar_atualizacao_especifica',
  'desativar_hibernacao_libera_espaco',
  'congelar_tabela_final',
  'desativar_telemetria_diagtrack',
  'desativar_cortana',
  'pausar_windows_update_35_dias'
)

foreach ($op in $data.operations) {
  if ($checkIds -contains $op.id) {
    Write-Output "=== $($op.id) ==="
    Write-Output "  Destructive: $($op.destructive)"
    Write-Output "  Command: $($op.command)"
    Write-Output ""
  }
}