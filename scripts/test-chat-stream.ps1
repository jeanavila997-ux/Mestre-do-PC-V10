# Teste do Chat com IA - Formato Correto (messages array)
Write-Host "=== Teste do Chat Stream ===" -ForegroundColor Cyan

$uri = "http://localhost:7777/ollama/chat"
$headers = @{
    "X-Mestre-Client" = "v10-web"
    "Content-Type" = "application/json"
}

# Formato esperado: messages array (padrao Ollama Chat API)
$body = @{
    messages = @(
        @{
            role = "user"
            content = "Diga OLA se estiver funcionando"
        }
    )
    stream = $false
} | ConvertTo-Json -Depth 5 -Compress

Write-Host "Enviando requisicao..."
Write-Host "Body: $body"

try {
    $response = Invoke-RestMethod -Uri $uri -Method POST -Headers $headers -Body $body
    Write-Host "`nResposta:" -ForegroundColor Yellow
    Write-Host ($response | ConvertTo-Json -Depth 5)
    Write-Host "`nStatus: SUCESSO" -ForegroundColor Green
} catch {
    Write-Host "`nErro: $_" -ForegroundColor Red
    Write-Host "Status Code: $($_.Exception.Response.StatusCode)" -ForegroundColor Yellow
}
