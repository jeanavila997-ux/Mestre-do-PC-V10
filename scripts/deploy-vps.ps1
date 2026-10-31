# Envia a PASTA COMPLETA do Mestre para a VPS, sem espalhar arquivos.
# Origem: este repositório. Destino remoto: /opt/apps/mestre-do-pc
# Staging local: dist/vps-bundle/ (dentro do projeto, nunca na Área de Trabalho)
#
# Uso:
#   pwsh -NoProfile -File scripts/deploy-vps.ps1
#   pwsh -NoProfile -File scripts/deploy-vps.ps1 -SkipRemote   # só empacota

[CmdletBinding()]
param(
    [string] $RemoteHost = "72.62.11.116",
    [string] $RemoteUser = "root",
    [string] $RemotePath = "/opt/apps/mestre-do-pc",
    [string] $IdentityFile = (Join-Path $env:USERPROFILE ".ssh\id_ed25519_vps"),
    [switch] $SkipRemote
)

$ErrorActionPreference = "Stop"
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $ProjectRoot

$BundleRoot = Join-Path $ProjectRoot "dist\vps-bundle"
$StageDir = Join-Path $BundleRoot "mestre-do-pc"
$Archive = Join-Path $BundleRoot "mestre-do-pc.tgz"

Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "  MESTRE DO PC — pasta completa para a VPS" -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "Projeto : $ProjectRoot"
Write-Host "Staging : $StageDir"
Write-Host "Arquivo : $Archive"
Write-Host "Remoto  : ${RemoteUser}@${RemoteHost}:${RemotePath}"
Write-Host ""

if (Test-Path $BundleRoot) {
    Remove-Item -LiteralPath $BundleRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $StageDir -Force | Out-Null

$excludeDirs = @(
    ".git", "node_modules", "logs", "data", "temp", "tmp", ".cache",
    ".agents", ".claude", ".codex", ".cursor", ".qwen", ".codesight",
    "vps-bundle"
)
$excludeFiles = @(
    ".env", ".env.local", ".env.production", ".env.development"
)

function Copy-Tree {
    param([string] $Relative)
    $source = Join-Path $ProjectRoot $Relative
    if (-not (Test-Path $source)) { return }
    $dest = Join-Path $StageDir $Relative
    New-Item -ItemType Directory -Path (Split-Path $dest -Parent) -Force | Out-Null
    if ((Get-Item $source).PSIsContainer) {
        robocopy $source $dest /E /NFL /NDL /NJH /NJS /nc /ns /np `
            /XD $excludeDirs `
            /XF $excludeFiles "*.log" "*.pid" "*.bak" "*.bak-*" "*.db" "*.db-shm" "*.db-wal" "$null" |
            Out-Null
        $code = $LASTEXITCODE
        if ($code -ge 8) { throw "robocopy falhou em $Relative (codigo $code)" }
    } else {
        Copy-Item -LiteralPath $source -Destination $dest -Force
    }
}

Write-Host "Montando pasta completa em dist/vps-bundle/mestre-do-pc ..." -ForegroundColor Yellow

foreach ($item in @(
    "v10",
    "mcp-server",
    "dist\site",
    "deploy",
    "scripts",
    "startup",
    "mobile",
    "assets",
    "skills-globais",
    "docs",
    "browser-extension",
    "install.ps1",
    "uninstall.ps1",
    "start-mestre.bat",
    "start-mestre-v10.ps1",
    "package.json",
    "package-lock.json",
    ".env.example",
    "README.md",
    "AGENTS.md",
    "LICENSE",
    "icon.ico",
    "favicon.png",
    "logo-mestre-v7-transparent.png",
    "INSTALAR.bat"
)) {
    Copy-Tree $item
}

$readme = @"
MESTRE DO PC — pasta completa (nao espalhar)

Esta pasta e a unidade de deploy. Fica em /opt/apps/mestre-do-pc na VPS.
Nao extraia na Area de Trabalho do Windows e nao misture com outros apps.

Site publico (Traefik): https://mestre.72-62-11-116.sslip.io
Mobile PWA:             https://mestre.72-62-11-116.sslip.io/mobile/
Health:                 http://127.0.0.1:7780/ping  (so na VPS)

Subir:
  cd /opt/apps/mestre-do-pc
  docker compose -f deploy/vps/docker-compose.yml up -d
"@
Set-Content -LiteralPath (Join-Path $StageDir "LEIA-ME-VPS.txt") -Value $readme -Encoding UTF8

Write-Host "Compactando (um arquivo so)..." -ForegroundColor Yellow
if (Test-Path $Archive) { Remove-Item -LiteralPath $Archive -Force }
Push-Location $BundleRoot
try {
    tar -czf $Archive -C $BundleRoot mestre-do-pc
    if ($LASTEXITCODE -ne 0) { throw "tar falhou com codigo $LASTEXITCODE" }
} finally {
    Pop-Location
}

$bytes = (Get-Item $Archive).Length
Write-Host ("Arquivo pronto: {0:N1} MB" -f ($bytes / 1MB)) -ForegroundColor Green

if ($SkipRemote) {
    Write-Host "SkipRemote: pasta completa ficou em $StageDir"
    exit 0
}

if (-not (Test-Path $IdentityFile)) {
    throw "Chave SSH nao encontrada: $IdentityFile. Gere com ssh-keygen -t ed25519 -f `"$IdentityFile`"."
}

$ssh = @(
    "-i", $IdentityFile,
    "-o", "BatchMode=yes",
    "-o", "IdentitiesOnly=yes",
    "-o", "StrictHostKeyChecking=accept-new",
    "-o", "ConnectTimeout=12",
    "${RemoteUser}@${RemoteHost}"
)

Write-Host "Testando SSH..." -ForegroundColor Yellow
& ssh @ssh "echo ok && uname -n && mkdir -p '$RemotePath'"
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "SSH recusou a chave. Cole a publica no painel Hostinger (VPS → Settings → SSH keys):" -ForegroundColor Red
    Get-Content "$IdentityFile.pub"
    Write-Host ""
    Write-Host "A pasta completa JA esta pronta em:" -ForegroundColor Yellow
    Write-Host "  $StageDir"
    Write-Host "  $Archive"
    Write-Host "Nada foi copiado para a Area de Trabalho."
    exit 2
}

Write-Host "Enviando arquivo unico..." -ForegroundColor Yellow
& scp -i $IdentityFile -o BatchMode=yes -o IdentitiesOnly=yes $Archive "${RemoteUser}@${RemoteHost}:/tmp/mestre-do-pc.tgz"
if ($LASTEXITCODE -ne 0) { throw "scp falhou" }

Write-Host "Extraindo na pasta unica remota $RemotePath ..." -ForegroundColor Yellow
$remote = @"
set -euo pipefail
mkdir -p '$RemotePath'
tar -xzf /tmp/mestre-do-pc.tgz -C /opt/apps
rm -f /tmp/mestre-do-pc.tgz
cd '$RemotePath'
if command -v docker >/dev/null 2>&1; then
  docker compose -f deploy/vps/docker-compose.yml up -d
fi
echo DEPLOY_OK
ls -la '$RemotePath' | head
curl -fsS http://127.0.0.1:7780/ping || true
"@
& ssh @ssh $remote
if ($LASTEXITCODE -ne 0) { throw "comandos remotos falharam" }

Write-Host ""
Write-Host "===================================================" -ForegroundColor Green
Write-Host " Pasta completa enviada para $RemotePath" -ForegroundColor Green
Write-Host " Site: https://mestre.72-62-11-116.sslip.io" -ForegroundColor Cyan
Write-Host " App:  https://mestre.72-62-11-116.sslip.io/mobile/" -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Green
