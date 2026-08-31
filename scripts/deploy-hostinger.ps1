param (
    [string]$TargetFolder = "~/public_html/"
)

$LocalPath = "..\dist\ClientePackage.zip"
$RemoteUser = "u786088869"
$RemoteHost = "82.112.247.163"
$RemotePort = "65002"

$FullLocalPath = Resolve-Path $LocalPath -ErrorAction Stop | Select-Object -ExpandProperty Path

Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "  MESTRE DO PC - DEPLOY PARA HOSPEDAGEM HOSTINGER" -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Preparando envio do arquivo:" -ForegroundColor Yellow
Write-Host " 📦 $FullLocalPath" 
Write-Host " Para: ${RemoteUser}@${RemoteHost}:${TargetFolder}" -ForegroundColor Yellow
Write-Host ""
Write-Host "Iniciando transferência segura (via SCP)..." -ForegroundColor Green
Write-Host "Se você não configurou a sua chave SSH, o sistema solicitará a sua senha agora." -ForegroundColor DarkGray
Write-Host ""

scp -P $RemotePort "$FullLocalPath" "${RemoteUser}@${RemoteHost}:${TargetFolder}"

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "===================================================" -ForegroundColor Green
    Write-Host "✅ Upload concluído com sucesso!" -ForegroundColor Green
    Write-Host "===================================================" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "===================================================" -ForegroundColor Red
    Write-Host "❌ Erro durante o upload. Verifique sua conexão e credenciais." -ForegroundColor Red
    Write-Host "===================================================" -ForegroundColor Red
}

pause
