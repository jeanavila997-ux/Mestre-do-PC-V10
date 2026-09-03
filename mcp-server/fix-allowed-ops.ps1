$file = Join-Path $PSScriptRoot '..\v10\allowed-operations.json'
$data = Get-Content $file | ConvertFrom-Json

$newOps = @(
  @{ id = 'consultar_fonte_oficial_gov'; title = 'Consultar Fonte Oficial Gov'; category = 'Pesquisa'; destructive = $false; command = 'Write-Host "Consulta a fontes oficiais gov.br"' },
  @{ id = 'extrair_evidencia_de_pdf_local'; title = 'Extrair Evidência de PDF Local'; category = 'Pesquisa'; destructive = $false; command = 'Write-Host "Extração de evidência de PDF local"' },
  @{ id = 'simular_cenario_economico'; title = 'Simular Cenário Econômico'; category = 'Análise'; destructive = $false; command = 'Write-Host "Simulação de cenário econômico"' },
  @{ id = 'congelar_tabela_final'; title = 'Congelar Tabela Final'; category = 'Dados'; destructive = $true; command = 'Write-Host "Congelamento de tabela final"' },
  @{ id = 'gerar_snapshot_git'; title = 'Gerar Snapshot Git'; category = 'Git'; destructive = $false; command = 'Write-Host "Geração de snapshot git"' }
)

foreach ($op in $newOps) {
  if (-not ($data.operations | Where-Object { $_.id -eq $op.id })) {
    $data.operations += $op
    Write-Output ('Added: ' + $op.id)
  }
}

$data | ConvertTo-Json -Depth 10 | Set-Content $file -Encoding UTF8
Write-Output '✅ allowed-operations.json updated'
