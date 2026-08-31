@echo off
title Deploy Hostinger - Mestre do PC
chcp 65001 >nul
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File ".\deploy-hostinger.ps1"
pause
