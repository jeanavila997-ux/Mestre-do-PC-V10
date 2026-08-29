# Teste rápido da API de memórias
$testMemory = @{
    type = "note"
    title = "Teste de Memória"
    content = "Testando o sistema de memórias via API"
    metadata = @{
        tags = @("teste", "api")
        importance = 3
        source = "teste-powershell"
    }
}

try {
    $json = $testMemory | ConvertTo-Json -Depth 5 -Compress
    Write-Host "Enviando: $json" -ForegroundColor Cyan
    
    $response = Invoke-RestMethod -Uri 'http://127.0.0.1:7777/memories/create' -Method POST -ContentType 'application/json' -Body $json
    
    if ($response.success) {
        Write-Host "✅ Sucesso!" -ForegroundColor Green
        Write-Host "ID: $($response.memory.id)" -ForegroundColor Yellow
        Write-Host "Título: $($response.memory.title)" -ForegroundColor Yellow
    } else {
        Write-Host "❌ Erro: $($response.error)" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Erro na requisição: $_" -ForegroundColor Red
    Write-Host "Detalhes: $($_.Exception.Response.StatusCode)" -ForegroundColor Red
}
