# Teste do Chat com IA - Mestre do PC V10
Write-Host "=== Teste do Chat com IA ===" -ForegroundColor Cyan

# Teste 1: Ollama direto
Write-Host "`n1. Testando Ollama direto..." -ForegroundColor Yellow
$uriOllama = "http://localhost:11434/api/generate"
$bodyOllama = @{
    model = "qwen2.5-coder:3b-instruct"
    prompt = "Diga 'OLA' se estiver funcionando."
    stream = $false
} | ConvertTo-Json -Compress

try {
    $response = Invoke-RestMethod -Uri $uriOllama -Method POST -Body $bodyOllama -ContentType 'application/json'
    Write-Host "   Resposta: $($response.response)" -ForegroundColor Green
    Write-Host "   Status: OLLAMA OK" -ForegroundColor Green
} catch {
    Write-Host "   Erro: $_" -ForegroundColor Red
}

# Teste 2: Chat via Launcher (proxy)
Write-Host "`n2. Testando Chat via Launcher..." -ForegroundColor Yellow
$uriLauncher = "http://localhost:7777/ollama/chat"
$headers = @{
    "X-Mestre-Client" = "v10-web"
    "Content-Type" = "application/json"
}
$bodyLauncher = @{
    message = "Diga 'OLA CHAT' se estiver funcionando. Responda em 1 palavra."
    conversationId = $null
} | ConvertTo-Json -Compress

try {
    $response = Invoke-RestMethod -Uri $uriLauncher -Method POST -Headers $headers -Body $bodyLauncher
    Write-Host "   Resposta: $($response.output)" -ForegroundColor Green
    Write-Host "   Status: CHAT OK" -ForegroundColor Green
} catch {
    Write-Host "   Erro: $_" -ForegroundColor Red
    Write-Host "   Detalhe: O launcher pode estar offline ou requerer autenticacao" -ForegroundColor Yellow
}

Write-Host "`n=== Teste Concluido ===" -ForegroundColor Cyan
