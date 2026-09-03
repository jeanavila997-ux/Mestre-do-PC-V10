$ErrorActionPreference = "Stop"
$Repo = "jeanavila997-ux/Mestre-do-PC-V10"

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  throw "GitHub CLI não encontrado. Instale com: winget install --id GitHub.cli"
}

gh auth status

gh repo create $Repo --public --description "Aplicativo local de diagnóstico e manutenção do Windows com interface V10, Ollama e MCP." --disable-wiki

git init
git branch -M main
git add .
git commit -m "chore: initialize clean Mestre do PC V10 repository"
git remote add origin "https://github.com/$Repo.git"
git push -u origin main

Write-Host "Repositório criado: https://github.com/$Repo" -ForegroundColor Green
