param (
    [string]$TargetFolder = "~/public_html/"
)

$ErrorActionPreference = "Stop"

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

& node (Join-Path $PSScriptRoot "build-package.cjs")
if ($LASTEXITCODE -ne 0) {
    Write-Error "Falha ao gerar o pacote (codigo $LASTEXITCODE). Deploy cancelado."
    exit 1
}

if (-not (Test-Path $SitePath)) {
    Write-Host "❌ Erro: Pasta $SitePath não encontrada." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Preparando envio dos arquivos do site e pacote para a Hostinger:" -ForegroundColor Yellow
Write-Host " 🌐 Origem: $SitePath"
Write-Host " 🎯 Destino: ${RemoteUser}@${RemoteHost}:${TargetFolder}" -ForegroundColor Yellow
Write-Host " 🔗 Site: https://vitrinedeapps.cloud" -ForegroundColor Cyan
Write-Host ""
Write-Host "Iniciando transferência segura (via SCP)..." -ForegroundColor Green
Write-Host "Se você não configurou chave SSH sem senha, digite a sua senha SSH quando solicitado." -ForegroundColor DarkGray
Write-Host ""

# Enviar o CONTEUDO de dist/site, usando caminhos nativos aceitos pelo scp do Windows.
$SitePathResolved = (Resolve-Path $SitePath).Path
$SourcePaths = @(Get-ChildItem -LiteralPath $SitePathResolved -Force | ForEach-Object { $_.FullName })
if ($SourcePaths.Count -eq 0) {
    Write-Error "Nenhum arquivo encontrado para deploy em $SitePathResolved."
    exit 1
}
$Destination = "${RemoteUser}@${RemoteHost}:$TargetFolder"
$ScpArgs = @("-P", $RemotePort, "-r") + $SourcePaths + @($Destination)
Write-Host "Deploying from: $SitePathResolved" -ForegroundColor DarkGray
& scp @ScpArgs

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "===================================================" -ForegroundColor Green
    Write-Host "✅ Deploy concluído com sucesso no site vitrinedeapps.cloud!" -ForegroundColor Green
    Write-Host "===================================================" -ForegroundColor Green
    Write-Host "Acesse: https://vitrinedeapps.cloud" -ForegroundColor Cyan
} else {
    Write-Host ""
    Write-Host "===================================================" -ForegroundColor Red
    Write-Host "❌ Erro durante o deploy. Verifique a conexão e as credenciais SSH." -ForegroundColor Red
    Write-Host "===================================================" -ForegroundColor Red
    exit 1
}

# pause
