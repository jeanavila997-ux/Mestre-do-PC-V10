const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const baseDir = path.resolve(__dirname, '..');
const pkgDir = path.join(baseDir, 'dist', 'ClientePackage');
const scriptsDir = path.join(pkgDir, 'scripts');

fs.mkdirSync(pkgDir, { recursive: true });
fs.mkdirSync(scriptsDir, { recursive: true });

// Copiar ícone e logo
fs.copyFileSync(path.join(baseDir, 'icon.ico'), path.join(pkgDir, 'icon.ico'));
if (fs.existsSync(path.join(baseDir, 'logo-mestre-v7-transparent.png'))) {
  fs.copyFileSync(path.join(baseDir, 'logo-mestre-v7-transparent.png'), path.join(pkgDir, 'logo.png'));
}

// Copiar scripts base
if (fs.existsSync(path.join(baseDir, 'install.ps1'))) {
  fs.copyFileSync(path.join(baseDir, 'install.ps1'), path.join(scriptsDir, 'instalar.ps1'));
}
if (fs.existsSync(path.join(baseDir, 'uninstall.ps1'))) {
  fs.copyFileSync(path.join(baseDir, 'uninstall.ps1'), path.join(scriptsDir, 'desinstalar.ps1'));
}

// Criar 'Instalar Mestre do PC.bat'
const installerBat = `@echo off
title Instalador - Mestre do PC
chcp 65001 >nul
cls
echo ===================================================
echo       MESTRE DO PC - INSTALADOR OFICIAL
echo ===================================================
echo.
echo Iniciando processo de instalacao...
echo.

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Solicitando privilegios de administrador...
    powershell -Command "Start-Process cmd -ArgumentList '/c \"\"%~f0\"\"' -Verb RunAs"
    exit /b
)

cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File ".\\scripts\\instalar.ps1"

echo.
echo ===================================================
echo Instalacao concluida com sucesso!
echo ===================================================
pause
`;
fs.writeFileSync(path.join(pkgDir, 'Instalar Mestre do PC.bat'), installerBat, 'utf8');

// Criar 'Desinstalar Mestre do PC.bat'
const uninstallerBat = `@echo off
title Desinstalador - Mestre do PC
chcp 65001 >nul
cls
echo ===================================================
echo      MESTRE DO PC - DESINSTALADOR OFICIAL
echo ===================================================
echo.
echo Deseja realmente desinstalar o Mestre do PC?
echo Pressione qualquer tecla para continuar ou feche esta janela.
pause >nul

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Solicitando privilegios de administrador...
    powershell -Command "Start-Process cmd -ArgumentList '/c \"\"%~f0\"\"' -Verb RunAs"
    exit /b
)

cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File ".\\scripts\\desinstalar.ps1"

echo.
echo ===================================================
echo Desinstalacao concluida.
echo ===================================================
pause
`;
fs.writeFileSync(path.join(pkgDir, 'Desinstalar Mestre do PC.bat'), uninstallerBat, 'utf8');

// Criar LEIA-ME.txt
const readme = `=====================================================
          PACOTE DE ENTREGA - MESTRE DO PC
=====================================================

COMO INSTALAR:
1. Clique duas vezes em "Instalar Mestre do PC.lnk" (ou no arquivo "Instalar Mestre do PC.bat").
2. Se o Windows solicitar permissão de Administrador, clique em "Sim".
3. Aguarde a finalização da instalação automática.

COMO DESINSTALAR:
1. Caso deseje remover o sistema, execute "Desinstalar Mestre do PC.lnk" (ou "Desinstalar Mestre do PC.bat").

CONTEÚDO DESTE PACOTE:
- Instalar Mestre do PC.lnk     -> Atalho com ícone oficial para instalação rápida
- Desinstalar Mestre do PC.lnk   -> Atalho com ícone oficial para desinstalação
- Instalar Mestre do PC.bat     -> Script executável com elevação de privilégios
- Desinstalar Mestre do PC.bat   -> Script executável de desinstalação
- icon.ico                      -> Ícone oficial do aplicativo
- logo.png                      -> Logotipo oficial
- scripts/                      -> Rotinas de automação PowerShell
=====================================================
`;
fs.writeFileSync(path.join(pkgDir, 'LEIA-ME.txt'), readme, 'utf8');

// Gerar script temporário do powershell para criar os atalhos .lnk com ícone
const psShortcutsCode = `
$wscript = New-Object -ComObject WScript.Shell

$shortcut1 = $wscript.CreateShortcut("${path.join(pkgDir, 'Instalar Mestre do PC.lnk').replace(/\\/g, '\\\\')}")
$shortcut1.TargetPath = "${path.join(pkgDir, 'Instalar Mestre do PC.bat').replace(/\\/g, '\\\\')}"
$shortcut1.WorkingDirectory = "${pkgDir.replace(/\\/g, '\\\\')}"
$shortcut1.Description = "Instalador do Mestre do PC"
$shortcut1.IconLocation = "${path.join(pkgDir, 'icon.ico').replace(/\\/g, '\\\\')},0"
$shortcut1.Save()

$shortcut2 = $wscript.CreateShortcut("${path.join(pkgDir, 'Desinstalar Mestre do PC.lnk').replace(/\\/g, '\\\\')}")
$shortcut2.TargetPath = "${path.join(pkgDir, 'Desinstalar Mestre do PC.bat').replace(/\\/g, '\\\\')}"
$shortcut2.WorkingDirectory = "${pkgDir.replace(/\\/g, '\\\\')}"
$shortcut2.Description = "Desinstalador do Mestre do PC"
$shortcut2.IconLocation = "${path.join(pkgDir, 'icon.ico').replace(/\\/g, '\\\\')},0"
$shortcut2.Save()
`;

const tempPsFile = path.join(baseDir, 'scripts', 'temp-shortcuts.ps1');
fs.writeFileSync(tempPsFile, psShortcutsCode, 'utf8');

try {
  execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${tempPsFile}"`, { stdio: 'inherit' });
} finally {
  if (fs.existsSync(tempPsFile)) {
    fs.unlinkSync(tempPsFile);
  }
}

console.log('✅ Pacote de envio ao cliente criado com sucesso em:', pkgDir);

// Gerar arquivo ZIP pronto para envio
const zipPath = path.join(baseDir, 'dist', 'ClientePackage.zip');
console.log('📦 Gerando arquivo compactado para envio...');
try {
  const psZipCode = `Compress-Archive -Path '${pkgDir}\\*' -DestinationPath '${zipPath}' -Force`;
  execSync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${psZipCode}"`, { stdio: 'inherit' });
  console.log('🎉 Arquivo ZIP gerado com sucesso em:', zipPath);
} catch (err) {
  console.warn('⚠️ Não foi possível gerar o arquivo ZIP automaticamente:', err.message);
}

// Preparar pasta dist/site (Landing page para hospedagem)
const siteDir = path.join(baseDir, 'dist', 'site');
fs.mkdirSync(siteDir, { recursive: true });
fs.copyFileSync(path.join(baseDir, 'icon.ico'), path.join(siteDir, 'icon.ico'));
if (fs.existsSync(path.join(baseDir, 'logo-mestre-v7-transparent.png'))) {
  fs.copyFileSync(path.join(baseDir, 'logo-mestre-v7-transparent.png'), path.join(siteDir, 'logo.png'));
}
if (fs.existsSync(path.join(baseDir, 'favicon.png'))) {
  fs.copyFileSync(path.join(baseDir, 'favicon.png'), path.join(siteDir, 'favicon.png'));
}
if (fs.existsSync(zipPath)) {
  fs.copyFileSync(zipPath, path.join(siteDir, 'ClientePackage.zip'));
}
console.log('🌐 Site para hospedagem preparado em:', siteDir);