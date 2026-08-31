# Script para push com token do GitHub
# Defina o token antes de rodar: $env:GITHUB_TOKEN = "seu_token_aqui"
$token = $env:GITHUB_TOKEN
if (-not $token) {
    Write-Host "❌ Defina a variável de ambiente GITHUB_TOKEN antes de rodar este script." -ForegroundColor Red
    Write-Host "   Exemplo: `$env:GITHUB_TOKEN = 'ghp_...'" -ForegroundColor Yellow
    exit 1
}
$repoUrl = "https://jeanavila997-ux:$token@github.com/jeanavila997-ux/Mestre-do-PC-V10.git"
$branch = "feat/chat-redesign-aplicado"

Write-Host "🚀 Enviando para GitHub..." -ForegroundColor Cyan
Write-Host "Branch: $branch" -ForegroundColor Yellow
Write-Host ""

# Configura remote com token
git remote set-url origin $repoUrl

# Faz o push
git push -u origin $branch

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ SUCESSO! Código enviado para:" -ForegroundColor Green
    Write-Host "   https://github.com/jeanavila997-ux/Mestre-do-PC-V10/tree/$branch" -ForegroundColor Cyan
} else {
    Write-Host ""
    Write-Host "❌ Falha no push." -ForegroundColor Red
    Write-Host ""
    Write-Host "Possíveis causas:" -ForegroundColor Yellow
    Write-Host "   1. Token inválido ou expirado" -ForegroundColor White
    Write-Host "   2. Token sem permissão 'repo'" -ForegroundColor White
    Write-Host "   3. Nome de usuário incorreto" -ForegroundColor White
    Write-Host ""
    Write-Host "💡 Solução:" -ForegroundColor Cyan
    Write-Host "   1. Acesse: https://github.com/settings/tokens" -ForegroundColor White
    Write-Host "   2. Gere um NOVO token com permissão 'repo'" -ForegroundColor White
    Write-Host "   3. Substitua o token neste script" -ForegroundColor White
}
