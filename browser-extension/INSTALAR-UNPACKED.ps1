#Requires -Version 7
<#
.SYNOPSIS
  Prepara a instalação unpacked da extensão Mestre do PC no Edge/Chrome.

.DESCRIPTION
  O Windows não deixa um script instalar extensão unpacked em silêncio
  (política de loja). Este script copia o caminho, abre as páginas de
  extensões e mostra o passo a passo.
#>
$ErrorActionPreference = 'Stop'
$dir = $PSScriptRoot
Set-Clipboard -Value $dir
Start-Process $dir

$edge = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
$chrome = "$env:ProgramFiles\Google\Chrome\Application\chrome.exe"

if ($edge) { Start-Process -FilePath $edge -ArgumentList 'edge://extensions' }
if (Test-Path $chrome) { Start-Process -FilePath $chrome -ArgumentList 'chrome://extensions' }

Write-Host ""
Write-Host "Caminho copiado:" -ForegroundColor Cyan
Write-Host $dir
Write-Host ""
Write-Host "1. Ative 'Modo do desenvolvedor'"
Write-Host "2. Clique em 'Carregar sem compactação'"
Write-Host "3. Cole o caminho da pasta (Ctrl+V)"
Write-Host "4. Copie o ID da extensão"
Write-Host "5. No launcher: MESTRE_EXTENSION_TOKEN + MESTRE_EXTENSION_ORIGINS=chrome-extension://ID"
Write-Host "6. Na extensão: Configurações → cole o mesmo token"
Write-Host ""
Write-Host "ZIP pronto para enviar: dist\mestre-do-pc-extension-chrome-v*.zip"
