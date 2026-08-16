# Validar JSON — usa caminho relativo ao diretório do projeto
$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$opsFile = Join-Path $projectDir 'v10\allowed-operations.json'
try {
  $json = Get-Content $opsFile -Raw | ConvertFrom-Json
  $count = if ($json.operations) { $json.operations.Count } else { $json.Count }
  Write-Output "✅ JSON valido - operacoes: $count"
} catch {
  Write-Output "❌ JSON Erro: $($_.Exception.Message)"
}

# Validar HTML
$htmlFile = Join-Path $projectDir 'v10\index.html'
$content = Get-Content $htmlFile -Raw
if ($content -match 'chmod_644') {
  Write-Output "✅ chmod 644 encontrado no HTML"
}
if ($content -match 'chown user:group') {
  Write-Output "✅ chown user:group encontrado no HTML"
}
$chmodCount = ([regex]::Matches($content, 'chmod_')).Count
$chownCount = ([regex]::Matches($content, 'chown ')).Count
Write-Output "✅ Comandos chmod no HTML: $chmodCount"
Write-Output "✅ Comandos chown no HTML: $chownCount"

# Contar subcategorias de seguranca
$secStart = $content.IndexOf('cat_sec')
if ($secStart -ge 0) {
  $secEnd = $content.IndexOf('];', $secStart)
  $secSection = $content.Substring($secStart, $secEnd - $secStart)
  $subCount = ([regex]::Matches($secSection, 'label:')).Count
  Write-Output "✅ Subcategorias na categoria Seguranca: $subCount"
} else {
  Write-Output "⚠️ Categoria 'cat_sec' não encontrada no HTML"
}