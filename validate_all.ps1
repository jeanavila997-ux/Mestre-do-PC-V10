# Validar JSON
try {
  $json = Get-Content 'C:\Users\Jeanc\Mestre-do-PC-V10-repo-pronto\Mestre-do-PC-V10-clean\v10\allowed-operations.json' -Raw | ConvertFrom-Json
  Write-Output "✅ JSON valido - operacoes: $($json.operations.Count)"
} catch {
  Write-Output "❌ JSON Erro: $($_.Exception.Message)"
}

# Validar HTML
$content = Get-Content 'C:\Users\Jeanc\Mestre-do-PC-V10-repo-pronto\Mestre-do-PC-V10-clean\v10\index.html' -Raw
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
$secEnd = $content.IndexOf('];', $secStart)
$secSection = $content.Substring($secStart, $secEnd - $secStart)
$subCount = ([regex]::Matches($secSection, 'label:')).Count
Write-Output "✅ Subcategorias na categoria Seguranca: $subCount"