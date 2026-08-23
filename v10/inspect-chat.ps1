cd C:\Users\Jeanc\Mestre-do-PC-V10-clean\v10
$lines = Get-Content index.html
Write-Output ('Total linhas: ' + $lines.Count)
$patterns = 'ia-overlay','ia-modal','ia-header','ia-messages','ia-input-area','ia-tab','ia-toolbar','ia-attach-panel','ia-memory','openAI','closeIA','sendIA','streamOllamaReply'
foreach ($p in $patterns) {
    $found = $lines | Select-String -Pattern $p | Select-Object -First 3
    if ($found) {
        Write-Output ('--- ' + $p)
        $found | ForEach-Object { Write-Output ('L' + $_.LineNumber + ': ' + $_.Line.Trim()) }
    }
}
