@echo off
title Mestre do PC - Launcher
cd /d "%~dp0v10"

echo ============================================
echo   Mestre do PC V10/V11 - Iniciando...
echo   URL: http://127.0.0.1:7777
echo ============================================
echo.

start "Mestre do PC - Launcher" cmd /k "title Mestre do PC - Launcher & node launcher.js"

timeout /t 4 /nobreak >nul
start "" http://127.0.0.1:7777/

echo Launcher iniciado. A janela do navegador abrirá em instantes.
echo Para encerrar, feche a janela "Mestre do PC - Launcher".
echo.
pause
