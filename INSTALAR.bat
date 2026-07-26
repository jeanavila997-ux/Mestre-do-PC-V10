@echo off
setlocal
title Mestre do PC V10 - Instalador

echo.
echo  ==========================================
echo   MESTRE DO PC V10 -- Instalacao
echo  ==========================================
echo.
echo  Aguarde... UAC sera solicitado uma vez.
echo.

:: Verifica se ja e Admin
net session >nul 2>&1
if %errorlevel% equ 0 goto :runInstall

:: Nao e Admin: eleva e espera terminar
powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -Command ^
  "$p=Start-Process powershell.exe -Verb RunAs -Wait -PassThru -ArgumentList '-NoLogo -NoProfile -ExecutionPolicy Bypass -File ""%~dp0install.ps1""'; exit $p.ExitCode"
if %errorlevel% neq 0 goto :installFailed

:openApp
echo.
echo  [OK] Instalacao concluida.
echo  Atalho "Mestre do PC" criado na Area de Trabalho.
echo.
timeout /t 3 /nobreak >nul
exit /b 0

:runInstall
:: Ja e Admin: roda direto
powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
if %errorlevel% neq 0 goto :installFailed
goto :openApp

:installFailed
echo.
echo  [ERRO] A instalacao nao foi concluida.
echo.
pause
exit /b 1
