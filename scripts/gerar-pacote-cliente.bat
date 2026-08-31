@echo off
title Gerador de Pacote do Cliente - Mestre do PC
chcp 65001 >nul
cd /d "%~dp0.."
node scripts/build-package.js
echo.
pause
