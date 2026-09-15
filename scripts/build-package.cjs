const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const baseDir = path.resolve(__dirname, '..');
const distDir = path.join(baseDir, 'dist');
const pkgDir = path.join(distDir, 'ClientePackage');
const siteDir = path.join(distDir, 'site');
const zipPath = path.join(distDir, 'ClientePackage.zip');

function requirePath(relativePath) {
  const fullPath = path.join(baseDir, relativePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Arquivo obrigatório não encontrado: ${relativePath}`);
  }
  return fullPath;
}

function copyRequiredFile(relativePath, destination = relativePath) {
  const source = requirePath(relativePath);
  const target = path.join(pkgDir, destination);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function copyRuntimeDirectory(relativePath) {
  const sourceRoot = requirePath(relativePath);
  const excludedNames = new Set([
    '.env',
    '.git',
    'data',
    'logs',
    'node_modules',
    'temp',
    'tmp',
  ]);

  fs.cpSync(sourceRoot, path.join(pkgDir, relativePath), {
    recursive: true,
    filter(sourcePath) {
      if (sourcePath === sourceRoot) return true;
      const name = path.basename(sourcePath);
      if (excludedNames.has(name)) return false;
      return !/\.(?:bak|db|db-shm|db-wal|log|pid|tmp)$/i.test(name) && name !== '$null';
    },
  });
}

function findPowerShell() {
  for (const executable of ['pwsh', 'powershell']) {
    const probe = spawnSync(executable, ['-NoProfile', '-Command', 'exit 0'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    if (!probe.error && probe.status === 0) return executable;
  }
  throw new Error('PowerShell 7 ou Windows PowerShell 5.1 é necessário para gerar o ZIP.');
}

function createZip(sourceDir, destination) {
  const scriptPath = path.join(os.tmpdir(), `mestre-build-zip-${process.pid}.ps1`);
  const script = [
    'param([string] $Source, [string] $Destination)',
    '$ErrorActionPreference = "Stop"',
    'Compress-Archive -Path (Join-Path $Source "*") -DestinationPath $Destination -Force',
  ].join('\r\n');

  fs.writeFileSync(scriptPath, script, 'utf8');
  try {
    const result = spawnSync(
      findPowerShell(),
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-Source', sourceDir, '-Destination', destination],
      { stdio: 'inherit', windowsHide: true },
    );
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`Compress-Archive falhou com código ${result.status}.`);
    }
  } finally {
    fs.rmSync(scriptPath, { force: true });
  }
}

function writeLaunchers() {
  const installerBat = `@echo off\r
setlocal\r
title Instalador - Mestre do PC\r
chcp 65001 >nul\r
cd /d "%~dp0"\r
net session >nul 2>&1\r
if errorlevel 1 (\r
    powershell -NoProfile -Command "Start-Process cmd -ArgumentList '/c \"\"%~f0\"\"' -Verb RunAs"\r
    exit /b\r
)\r
where pwsh >nul 2>&1\r
if errorlevel 1 (\r
    powershell -NoProfile -ExecutionPolicy Bypass -File ".\\install.ps1" -InstallDir "%~dp0"\r
) else (\r
    pwsh -NoProfile -ExecutionPolicy Bypass -File ".\\install.ps1" -InstallDir "%~dp0"\r
)\r
if errorlevel 1 (\r
    echo Falha na instalacao.\r
    pause\r
    exit /b 1\r
)\r
echo Instalacao concluida com sucesso.\r
pause\r
`;

  const uninstallerBat = `@echo off\r
setlocal\r
title Desinstalador - Mestre do PC\r
chcp 65001 >nul\r
cd /d "%~dp0"\r
net session >nul 2>&1\r
if errorlevel 1 (\r
    powershell -NoProfile -Command "Start-Process cmd -ArgumentList '/c \"\"%~f0\"\"' -Verb RunAs"\r
    exit /b\r
)\r
where pwsh >nul 2>&1\r
if errorlevel 1 (\r
    powershell -NoProfile -ExecutionPolicy Bypass -File ".\\uninstall.ps1" -InstallDir "%~dp0"\r
) else (\r
    pwsh -NoProfile -ExecutionPolicy Bypass -File ".\\uninstall.ps1" -InstallDir "%~dp0"\r
)\r
if errorlevel 1 (\r
    echo Falha na desinstalacao.\r
    pause\r
    exit /b 1\r
)\r
echo Desinstalacao concluida.\r
pause\r
`;

  fs.writeFileSync(path.join(pkgDir, 'Instalar Mestre do PC.bat'), installerBat, 'utf8');
  fs.writeFileSync(path.join(pkgDir, 'Desinstalar Mestre do PC.bat'), uninstallerBat, 'utf8');
  fs.writeFileSync(
    path.join(pkgDir, 'LEIA-ME.txt'),
    [
      'PACOTE DE ENTREGA - MESTRE DO PC',
      '',
      'COMO INSTALAR:',
      '1. Extraia todo o conteúdo deste ZIP.',
      '2. Execute "Instalar Mestre do PC.bat".',
      '3. Autorize a elevação de Administrador e aguarde a conclusão.',
      '',
      'COMO DESINSTALAR:',
      'Execute "Desinstalar Mestre do PC.bat".',
      '',
      'Os atalhos definitivos são criados pelo instalador com caminhos da máquina de destino.',
      '',
    ].join('\r\n'),
    'utf8',
  );
}

function build() {
  fs.mkdirSync(distDir, { recursive: true });
  fs.rmSync(pkgDir, { recursive: true, force: true });
  fs.rmSync(zipPath, { force: true });
  fs.mkdirSync(pkgDir, { recursive: true });

  for (const relativePath of [
    'install.ps1',
    'uninstall.ps1',
    'start-mestre.bat',
    'start-mestre-v10.ps1',
    'icon.ico',
  ]) {
    copyRequiredFile(relativePath);
  }
  if (fs.existsSync(path.join(baseDir, 'logo-mestre-v7-transparent.png'))) {
    copyRequiredFile('logo-mestre-v7-transparent.png', 'logo.png');
  }

  copyRequiredFile('scripts/Register-MestreTask.ps1');
  copyRuntimeDirectory('startup');
  copyRuntimeDirectory('v10');
  copyRuntimeDirectory('mcp-server');
  writeLaunchers();

  const installerRequirements = [
    'install.ps1',
    'uninstall.ps1',
    'start-mestre.bat',
    'start-mestre-v10.ps1',
    'startup/MestreDoPC-Startup.ps1',
    'v10/launcher.js',
    'scripts/Register-MestreTask.ps1',
    'v10/start-v10.bat',
    'v10/index.html',
    'v10/allowed-operations.json',
    'mcp-server/package.json',
    'mcp-server/package-lock.json',
    'mcp-server/index.js',
  ];
  for (const relativePath of installerRequirements) {
    const packagedPath = path.join(pkgDir, ...relativePath.split('/'));
    if (!fs.existsSync(packagedPath)) {
      throw new Error(`Pacote incompleto: ${relativePath}`);
    }
  }

  createZip(pkgDir, zipPath);

  fs.mkdirSync(siteDir, { recursive: true });
  requirePath('dist/site/index.html');
  for (const generatedName of ['ClientePackage.zip', 'icon.ico', 'logo.png', 'favicon.png']) {
    fs.rmSync(path.join(siteDir, generatedName), { force: true });
  }
  fs.copyFileSync(requirePath('icon.ico'), path.join(siteDir, 'icon.ico'));
  if (fs.existsSync(path.join(baseDir, 'logo-mestre-v7-transparent.png'))) {
    fs.copyFileSync(path.join(baseDir, 'logo-mestre-v7-transparent.png'), path.join(siteDir, 'logo.png'));
  }
  if (fs.existsSync(path.join(baseDir, 'favicon.png'))) {
    fs.copyFileSync(path.join(baseDir, 'favicon.png'), path.join(siteDir, 'favicon.png'));
  }
  fs.copyFileSync(zipPath, path.join(siteDir, 'ClientePackage.zip'));

  console.log('Pacote criado e validado:', zipPath);
  console.log('Site preparado:', siteDir);
}

try {
  build();
} catch (error) {
  console.error(`Falha ao gerar pacote: ${error.message}`);
  process.exitCode = 1;
}
