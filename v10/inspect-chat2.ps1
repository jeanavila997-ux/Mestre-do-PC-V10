cd C:\Users\Jeanc\Mestre-do-PC-V10-clean\v10
$lines = Get-Content index.html

# Encontrar inicio e fim do CSS do chat
$chatCssStart = ($lines | Select-String -Pattern '\.ia-overlay \{ position: fixed' | Select-Object -First 1).LineNumber
$chatCssEnd = ($lines | Select-String -Pattern '/\* ===== Modal parâmetro' | Select-Object -First 1).LineNumber
Write-Output ('CSS chat: ' + $chatCssStart + ' - ' + ($chatCssEnd - 1))

# Encontrar inicio e fim do HTML do chat
$chatHtmlStart = ($lines | Select-String -Pattern '<div class="ia-overlay" id="iaOverlay"' | Select-Object -First 1).LineNumber
$chatHtmlEnd = ($lines | Select-String -Pattern '</div>\s*$' | Select-Object -Index ($chatHtmlStart) | Select-Object -First 1).LineNumber
# Melhor: procurar fechamento do modal
for ($i = $chatHtmlStart; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match '</div>\s*</div>\s*<div class="toast"') {
        Write-Output ('HTML chat: ' + $chatHtmlStart + ' - ' + $i)
        break
    }
}

# Encontrar inicio e fim do JS do chat
$chatJsStart = ($lines | Select-String -Pattern 'function openAI\(\)' | Select-Object -First 1).LineNumber
$chatJsEnd = ($lines | Select-String -Pattern 'function toggleActiveMemory' | Select-Object -First 1).LineNumber
Write-Output ('JS chat start: ' + $chatJsStart)
Write-Output ('JS chat end (toggleActiveMemory): ' + $chatJsEnd)

# Mostrar contexto das linhas de transicao
for ($i = ($chatCssEnd - 3); $i -le ($chatCssEnd + 2); $i++) { Write-Output ('L' + ($i+1) + ': ' + $lines[$i].Trim()) }
Write-Output '--- HTML fim ---'
for ($i = ($chatHtmlStart + 55); $i -le ($chatHtmlStart + 65); $i++) { if ($i -lt $lines.Count) { Write-Output ('L' + ($i+1) + ': ' + $lines[$i].Trim()) } }
