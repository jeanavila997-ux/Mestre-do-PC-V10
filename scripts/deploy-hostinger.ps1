param (
    [string]$TargetFolder = "~/public_html/"
)

$RemoteUser = "u786088869"
$RemoteHost = "82.112.247.163"
$RemotePort = "65002"

$DistPath = Join-Path $PSScriptRoot "..\dist"
$SitePath = Join-Path $DistPath "site"

# Caminho de destino remoto: raiz de public_html por padrão
$DefaultTargetFolder = "~/public_html/"
$TargetFolder = if ($TargetFolder -eq "~/public_html/") { $DefaultTargetFolder } else { $TargetFolder }

Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "  MESTRE DO PC - DEPLOY PARA HOSPEDAGEM HOSTINGER" -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "📦 Gerando e atualizando pacote do cliente e site..." -ForegroundColor Yellow

node (Join-Path $PSScriptRoot "build-package.js")

if (-not (Test-Path $SitePath)) {
    Write-Host "❌ Erro: Pasta $SitePath não encontrada." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Preparando envio dos arquivos do site e pacote para a Hostinger:" -ForegroundColor Yellow
Write-Host " 🌐 Origem: $SitePath"
Write-Host " 🎯 Destino: ${RemoteUser}@${RemoteHost}:${TargetFolder}" -ForegroundColor Yellow
Write-Host " 🔗 Site: https://avilamix.shop" -ForegroundColor Cyan
Write-Host ""
Write-Host "Iniciando transferência segura (via SCP)..." -ForegroundColor Green
Write-Host "Se você não configurou chave SSH sem senha, digite a sua senha SSH quando solicitado." -ForegroundColor DarkGray
Write-Host ""

# Enviar todos os arquivos de dist/site (index.html, icon.ico, ClientePackage.zip) para ~/public_html/
# Usar caminho absoluto do PowerShell para evitar problemas de wildcard no MSYS/scp.
# Enviamos o CONTEÚDO de $SitePath, não a pasta em si.
$SitePathResolved = Resolve-Path $SitePath | Select-Object -ExpandProperty Path
$ParentFolder = Split-Path -Parent $SitePathResolved
scp -P $RemotePort -r "${SitePathResolved}\*" "${RemoteUser}@${RemoteHost}:${TargetFolder}"

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "===================================================" -ForegroundColor Green
    Write-Host "✅ Deploy concluído com sucesso no site avilamix.shop!" -ForegroundColor Green
    Write-Host "===================================================" -ForegroundColor Green
    Write-Host "Acesse: https://avilamix.shop" -ForegroundColor Cyan
} else {
    Write-Host ""
    Write-Host "===================================================" -ForegroundColor Red
    Write-Host "❌ Erro durante o deploy. Verifique a conexão e as credenciais SSH." -ForegroundColor Red
    Write-Host "===================================================" -ForegroundColor Red
}

# pause
