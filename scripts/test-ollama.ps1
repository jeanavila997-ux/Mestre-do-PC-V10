# Teste do Ollama - Chat IA
$uri = "http://localhost:11434/api/generate"
$body = @{
    model = "qwen2.5-coder:3b-instruct"
    prompt = "Olá, você está funcionando? Responda em português de forma breve."
    stream = $false
} | ConvertTo-Json -Compress

Write-Host "Testando Ollama..."
try {
    $response = Invoke-RestMethod -Uri $uri -Method POST -Body $body -ContentType 'application/json'
    Write-Host "Resposta do Ollama:"
    Write-Host $response.response
    Write-Host "`nStatus: SUCESSO"
}
catch {
    Write-Host "Erro: $_" -ForegroundColor Red
    Write-Host "Status: FALHA"
}
