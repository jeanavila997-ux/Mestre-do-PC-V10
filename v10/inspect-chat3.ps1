cd C:\Users\Jeanc\Mestre-do-PC-V10-clean\v10
$lines = Get-Content index.html

$chatFunctions = @(
    'saveIaConversation',
    'restoreIaConversation',
    'clearIaConversation',
    'renderAttachments',
    'addAttachment',
    'removeAttachment',
    'clearAttachments',
    'attachContext',
    'onIAFileSelected',
    'attachImageFile',
    'onIAImageSelected',
    'resizeImageToDataUrl',
    'buildContextPrompt',
    'preloadModel',
    'openAI',
    'closeIA',
    'switchIATab',
    'checkOllama',
    'sendIA',
    'streamOllamaReply',
    'stopIA',
    'addIAMessageActions',
    'regenerateIA',
    'addIAMessage',
    'renderIAContent',
    'runIACmd',
    'scrollIAToBottom',
    'showOutput',
    'saveOutputHistory',
    'addOutputEntry',
    'renderOutputHistory',
    'copyOutputEntry',
    'clearOutputHistory',
    'sendOutputToIA',
    'saveOutputAsMemory',
    'downloadOutputReport',
    'downloadChatMarkdown',
    'downloadChatContext',
    'initMemoriesDb',
    'getAllMemories',
    'saveMemoryToDb',
    'deleteMemoryFromDb',
    'loadMemories',
    'renderMemoriesList',
    'renderActiveMemoryChips',
    'escapeHtml',
    'openMemoryEditor',
    'closeMemoryEditor',
    'saveMemory',
    'editMemory',
    'deleteMemory',
    'toggleActiveMemory'
)

foreach ($fn in $chatFunctions) {
    $found = $lines | Select-String -Pattern "function $fn\(" | Select-Object -First 1
    if ($found) {
        Write-Output ($fn + ' -> L' + $found.LineNumber)
    }
}
