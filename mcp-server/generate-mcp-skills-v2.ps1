$allowedOpsPath = Join-Path $PSScriptRoot '..\v10\allowed-operations.json'
$outputPath = Join-Path $PSScriptRoot 'mcp-skills.json'

$data = Get-Content $allowedOpsPath | ConvertFrom-Json
$items = @()

# Mapeamento direto de categorias do allowed-operations.json para categorias do app
$directMap = @{
  'Limpeza'      = 'mcp-limpeza'
  'MODELOS'      = 'mcp-modelos'
  'Instalações'  = 'mcp-install'
  'Backup'       = 'mcp-backup'
  'Bibliotecas'  = 'mcp-install'
  'Privacidade'  = 'mcp-privacidade'
  'Memória'      = 'mcp-memoria'
  'Git'          = 'mcp-git'
  'Performance'  = 'mcp-perf'
  'Processos'    = 'mcp-perf'
  'Disco'        = 'mcp-disco'
  'Reparo'       = 'mcp-reparo'
  'Sistema'      = 'mcp-sistema'
  'Defender'     = 'mcp-privacidade'
  'Atualizações' = 'mcp-sistema'
  'Pesquisa'     = 'mcp-novos'
  'Ollama'       = 'mcp-modelos'
  'Tarefas'      = 'mcp-sistema'
  'Dados'        = 'mcp-novos'
  'Análise'      = 'mcp-novos'
  'Projeto'      = 'mcp-sistema'
  'Drivers'      = 'mcp-sistema'
  'Rede'         = 'mcp-rede'
}

# Mapeamento por palavra-chave para categoria "Outros"
$keywordMap = @{
  'limp'            = 'mcp-limpeza'
  'temp'            = 'mcp-limpeza'
  'cache'           = 'mcp-limpeza'
  'prefetch'        = 'mcp-limpeza'
  'lixeira'         = 'mcp-limpeza'
  'desativar_super' = 'mcp-perf'
  'reativar_super'  = 'mcp-perf'
  'encerrar'        = 'mcp-perf'
  'startup'         = 'mcp-sistema'
  'trim'            = 'mcp-disco'
  'pastas_gigantes' = 'mcp-disco'
  'hibernacao'      = 'mcp-sistema'
  'diagnostico_de_rede' = 'mcp-rede'
  'conectividade'   = 'mcp-rede'
  'velocidade_download' = 'mcp-rede'
  'flush'           = 'mcp-rede'
  'resetar_pilha'   = 'mcp-rede'
  'adaptadores'     = 'mcp-rede'
  'dns'             = 'mcp-rede'
  'ipv6'            = 'mcp-rede'
  'vpn'             = 'mcp-rede'
  'firewall'        = 'mcp-privacidade'
  'boot'            = 'mcp-sistema'
  'diagnostico'     = 'mcp-sistema'
  'relatorio'       = 'mcp-sistema'
  'checkup'         = 'mcp-sistema'
  'atualizacoes'    = 'mcp-sistema'
  'bios'            = 'mcp-sistema'
  'erro'            = 'mcp-sistema'
  'historico'       = 'mcp-sistema'
  'inventario'      = 'mcp-sistema'
  'software'        = 'mcp-sistema'
  'desligar'        = 'mcp-sistema'
  'reiniciar'       = 'mcp-sistema'
  'suspender'       = 'mcp-sistema'
  'hibernar'        = 'mcp-sistema'
  'energia'         = 'mcp-sistema'
  'branch'          = 'mcp-git'
  'clonar'          = 'mcp-git'
  'bloatware'       = 'mcp-privacidade'
  'anuncios'        = 'mcp-privacidade'
  'sugestoes'       = 'mcp-privacidade'
  'onedrive'        = 'mcp-privacidade'
  'experiencias'    = 'mcp-privacidade'
  'conteudo'        = 'mcp-privacidade'
  'segundo_plano'   = 'mcp-privacidade'
  'privacidade'     = 'mcp-privacidade'
  'restaurar'       = 'mcp-backup'
  'recuperacao'     = 'mcp-backup'
  'exportar'        = 'mcp-backup'
  'driver'          = 'mcp-sistema'
  'video'           = 'mcp-perf'
  'prioridade'      = 'mcp-perf'
  'sombras'         = 'mcp-perf'
  'temperatura'     = 'mcp-sistema'
}

function Get-McpCategory($op) {
  # Primeiro tenta mapeamento direto
  if ($directMap.ContainsKey($op.category)) {
    return $directMap[$op.category]
  }
  
  # Para "Outros", usa mapeamento por palavra-chave no ID
  $idLower = $op.id.ToLower()
  foreach ($kv in $keywordMap.GetEnumerator()) {
    if ($idLower.Contains($kv.Key)) {
      return $kv.Value
    }
  }
  
  # Default: mcp-sistema
  return 'mcp-sistema'
}

$categoryCounts = @{}

foreach ($op in $data.operations) {
  $mcpCat = Get-McpCategory $op
  
  if (-not $categoryCounts.ContainsKey($mcpCat)) {
    $categoryCounts[$mcpCat] = 0
  }
  $categoryCounts[$mcpCat]++
  
  $item = @{
    id = 'mcp__' + $op.id
    title = 'MCP: ' + $op.title
    category = $mcpCat
    body = 'Ferramenta MCP: ' + $op.title + "`n`nCategoria: " + $op.category + "`nDestructive: " + $op.destructive + "`n`nComando: " + $op.command
    tags = @('mcp', 'mestre-do-pc', $mcpCat.Replace('mcp-',''))
    pinned = $false
    created = [DateTimeOffset]::Now.ToUnixTimeMilliseconds()
    stats = @{ copies = 0; lastCopied = $null; views = 0 }
  }
  $items += $item
}

$export = @{
  version = 2
  exportedAt = [DateTimeOffset]::Now.ToString("o")
  source = 'Mestre do PC V11.1 - MCP Tools (categorized)'
  stats = @{}
  items = $items
}

$export | ConvertTo-Json -Depth 10 | Set-Content $outputPath -Encoding UTF8

Write-Output ('✅ MCP skills categorizadas: ' + $items.Count + ' skills em ' + $outputPath)
Write-Output ''
Write-Output '=== Distribuicao por categoria ==='
$categoryCounts.GetEnumerator() | Sort-Object Value -Descending | ForEach-Object {
  Write-Output ('  ' + $_.Key + ': ' + $_.Value + ' skills')
}