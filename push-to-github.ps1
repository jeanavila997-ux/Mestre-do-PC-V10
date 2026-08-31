# Script para push das alterações para o GitHub
# Requer credenciais do GitHub configuradas

Write-Host "🚀 Enviando alterações para o GitHub..." -ForegroundColor Cyan
Write-Host ""

$repoPath = "C:\Users\Jeanc\Mestre-do-PC-V10-clean"
$branch = "feat/chat-redesign-aplicado"

Set-Location $repoPath

# Verifica status
Write-Host "📊 Status do repositório:" -ForegroundColor Yellow
git status --short

Write-Host ""
Write-Host "📝 Últimos commits:" -ForegroundColor Yellow
git log --oneline -3

Write-Host ""
Write-Host "🌐 Remote configured:" -ForegroundColor Yellow
git remote -v

Write-Host ""
Write-Host "⚠️  IMPORTANTE: Para enviar ao GitHub, você precisa:" -ForegroundColor Yellow
Write-Host "   1. Ter credenciais do GitHub configuradas" -ForegroundColor White
Write-Host "   2. Ou usar um Personal Access Token" -ForegroundColor White
Write-Host ""
Write-Host "📋 Comando para executar manualmente:" -ForegroundColor Cyan
Write-Host "   git push -u origin $branch" -ForegroundColor White
Write-Host ""
Write-Host "🔑 Se não tiver credenciais configuradas:" -ForegroundColor Cyan
Write-Host "   1. Acesse: https://github.com/settings/tokens" -ForegroundColor White
Write-Host "   2. Crie um token com permissão 'repo'" -ForegroundColor White
Write-Host "   3. Use: git push https://SEU_TOKEN@github.com/jeanavila997-ux/Mestre-do-PC-V10.git $branch" -ForegroundColor White
Write-Host ""

# Tenta fazer o push
$response = Read-Host "Deseja tentar o push agora? (s/n)"
if ($response -eq 's' -or $response -eq 'S') {
    try {
        Write-Host "🔄 Executando git push..." -ForegroundColor Green
        git push -u origin $branch
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host ""
            Write-Host "✅ Push realizado com sucesso!" -ForegroundColor Green
            Write-Host ""
            Write-Host "🔗 Veja seu código em:" -ForegroundColor Cyan
            Write-Host "   https://github.com/jeanavila997-ux/Mestre-do-PC-V10/tree/$branch" -ForegroundColor White
        } else {
            Write-Host ""
            Write-Host "❌ Falha no push. Verifique suas credenciais." -ForegroundColor Red
            Write-Host ""
            Write-Host "💡 Dica: Configure um Personal Access Token em:" -ForegroundColor Yellow
            Write-Host "   https://github.com/settings/tokens" -ForegroundColor White
        }
    } catch {
        Write-Host ""
        Write-Host "❌ Erro: $_" -ForegroundColor Red
    }
} else {
    Write-Host "⏭️  Push cancelado. Execute manualmente quando estiver pronto." -ForegroundColor Yellow
}
