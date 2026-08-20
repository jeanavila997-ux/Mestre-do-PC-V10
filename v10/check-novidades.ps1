$base = Split-Path -Parent $PSScriptRoot
Write-Output '=== Verificando arquivos referenciados ==='
Write-Output ('favicon.png: ' + (Test-Path ($base + '\favicon.png')))
Write-Output ('README-V11.md: ' + (Test-Path ($base + '\README-V11.md')))
Write-Output ('v10/index.html: ' + (Test-Path ($base + '\v10\index.html')))

# Conta operacoes reais
$ops = Get-Content ($base + '\v10\allowed-operations.json') | ConvertFrom-Json
Write-Output ''
Write-Output '=== allowed-operations.json ==='
Write-Output ('Total operacoes: ' + $ops.operations.Count)

# Conta por categoria
$categories = $ops.operations | Group-Object category
Write-Output 'Por categoria:'
foreach ($c in $categories) {
  Write-Output ('  ' + $c.Name + ': ' + $c.Count)
}

# Conta testes
$tests = Get-ChildItem ($base + '\mcp-server\test') -Filter '*.js' -ErrorAction SilentlyContinue
Write-Output ''
Write-Output ('Arquivos de teste: ' + ($tests | Measure-Object).Count)

# Verifica data atual
Write-Output ''
Write-Output ('Data atual: ' + (Get-Date).ToString('MMMM yyyy'))