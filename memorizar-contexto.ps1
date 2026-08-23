# Script para memorizar contexto atual
$memoriesFile = "C:\Users\Jeanc\Mestre-do-PC-V10-clean\v10\data\memories\chat-memories.json"

# Carrega memórias existentes
$data = Get-Content $memoriesFile -Raw | ConvertFrom-Json

# Nova memória de contexto
$newMemory = @{
    id = ($data.memories | Measure-Object -Maximum id).Maximum + 1
    type = "context"
    title = "Contexto Atual - Solicitação de Memorização"
    content = @"
Sessão de desenvolvimento do Sistema de Gestão de Memórias V11.

✅ CONCLUÍDO:
1. Sistema de memórias implementado (API REST com 9 endpoints)
2. Interface web completa (memories.html)
3. Botão 🧠 Memórias no chat
4. Ajuste de permissões do chat
5. 3 memórias iniciais criadas
6. Documento completo em docs/MEMORIA-COMPLETA-SESSAO.md

📁 ARQUIVOS:
- v10/memory-manager.js (19KB)
- v10/memory-routes.js (API)
- v10/memories.html (25KB)
- docs/SISTEMA-MEMORIAS.md (15KB)
- docs/MEMORIA-COMPLETA-SESSAO.md (12.6KB)

🔌 API ENDPOINTS:
POST /memories/create
GET /memories/list
GET /memories/get/:id
PUT /memories/update/:id
DELETE /memories/delete/:id
GET /memories/search
GET /memories/export
POST /memories/import
GET /memories/stats

🎯 STATUS:
- Launcher: Rodando em http://127.0.0.1:7777
- Memórias: 3 iniciais + esta
- Commit: 7119262 (local)
- Push: Pendente (token GitHub)

📝 PRÓXIMOS PASSOS:
1. Integrar auto-save no chat
2. Criar MCP tools
3. Backup automático semanal
4. Comandos slash (/memory)
"@
    createdAt = [DateTimeOffset]::Now.ToUnixTimeMilliseconds()
    updatedAt = [DateTimeOffset]::Now.ToUnixTimeMilliseconds()
    source = "chat-command"
    tags = @("contexto", "memorização", "sessão", "v11", "status")
    importance = 5
    additionalContext = @{
        commit = "7119262"
        branch = "feat/chat-redesign-aplicado"
        filesCreated = 13
        linesAdded = 4582
        launcherRunning = $true
        port = 7777
        memoryCount = ($data.memories.Count + 1)
    }
}

# Adiciona e salva
$data.memories += $newMemory
$data.totalMemories = $data.memories.Count
$data.lastUpdated = [DateTimeOffset]::Now.ToUnixTimeMilliseconds()

$data | ConvertTo-Json -Depth 10 | Set-Content $memoriesFile -Encoding UTF8

Write-Host "✅ Contexto memorizado com sucesso!" -ForegroundColor Green
Write-Host "   ID: $($newMemory.id)" -ForegroundColor Cyan
Write-Host "   Tipo: $($newMemory.type)" -ForegroundColor Cyan
Write-Host "   Tags: $($newMemory.tags -join ', ')" -ForegroundColor Cyan
Write-Host "   Total de memórias: $($data.totalMemories)" -ForegroundColor Cyan
Write-Host ""
Write-Host "🌐 Acesse: http://127.0.0.1:7777/memories.html" -ForegroundColor Yellow
