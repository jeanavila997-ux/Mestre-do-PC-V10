$allowedOpsPath = Join-Path $PSScriptRoot '..\v10\allowed-operations.json'
$outputPath = Join-Path $PSScriptRoot 'mcp-skills.json'

$data = Get-Content $allowedOpsPath | ConvertFrom-Json
$items = @()

foreach ($op in $data.operations) {
  $item = @{
    id = 'mcp__' + $op.id
    title = 'MCP: ' + $op.title
    category = 'skill'
    body = 'Ferramenta MCP: ' + $op.title + '

Categoria: ' + $op.category + '
Destructive: ' + $op.destructive + '

Comando: ' + $op.command
    tags = @('mcp', 'mestre-do-pc', $op.category.ToLower().Replace(' ', '-'))
    pinned = $false
    created = [DateTimeOffset]::Now.ToUnixTimeMilliseconds()
    stats = @{ copies = 0; lastCopied = $null; views = 0 }
  }
  $items += $item
}

$export = @{
  version = 2
  exportedAt = [DateTimeOffset]::Now.ToString("o")
  source = 'Mestre do PC V10 - MCP Tools'
  stats = @{}
  items = $items
}

$export | ConvertTo-Json -Depth 10 | Set-Content $outputPath -Encoding UTF8
Write-Output ('✅ MCP skills geradas: ' + $items.Count + ' skills em ' + $outputPath)
