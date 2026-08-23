$base = Split-Path -Parent $PSScriptRoot
$ops = Get-Content ($base + '\v10\allowed-operations.json') | ConvertFrom-Json

# Lista todas as operacoes por categoria
Write-Output '=== TODAS AS OPERACOES POR CATEGORIA ==='
$categories = $ops.operations | Group-Object category | Sort-Object Count -Descending
foreach ($c in $categories) {
  Write-Output ''
  Write-Output ('--- ' + $c.Name + ' (' + $c.Count + ') ---')
  foreach ($op in ($ops.operations | Where-Object { $_.category -eq $c.Name })) {
    Write-Output ('  ' + $op.id + ' | ' + $op.title + ' | destructive=' + $op.destructive)
  }
}

# Procura as ferramentas de IA
Write-Output ''
Write-Output '=== FERRAMENTAS DE IA ==='
$iaOps = $ops.operations | Where-Object { $_.id -match 'ia|perguntar|resolver|comparar|analisar|sugerir' }
foreach ($op in $iaOps) {
  Write-Output ('  ' + $op.id + ' | ' + $op.title)
}

# Procura as 5 novas V11.1
Write-Output ''
Write-Output '=== NOVAS V11.1 ==='
$newOps = $ops.operations | Where-Object { $_.id -match 'consultar_fonte|extrair_evidencia|simular_cenario|congelar_tabela|gerar_snapshot' }
foreach ($op in $newOps) {
  Write-Output ('  ' + $op.id + ' | ' + $op.title + ' | ' + $op.category)
}