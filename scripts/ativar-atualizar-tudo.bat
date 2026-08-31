@echo off
setlocal
title Mestre do PC - Ativar e Atualizar Tudo

echo.
echo  ========================================
echo   MESTRE DO PC - Ativacao Completa
echo  ========================================
echo.
echo  Este script ira:
echo   - Elevar para Administrador
echo   - Configurar variaveis de ambiente
echo   - Atualizar repositorio (git pull)
echo   - Instalar dependencias (npm ci)
echo   - Validar scripts (PS + JS)
echo   - Iniciar Ollama + Launcher
echo   - Registrar tarefas agendadas
echo   - Sincronizar whitelist
echo   - Executar testes
echo   - Abrir interface web
echo.
echo  Pressione qualquer tecla para continuar...
pause >nul

rem Prefere PowerShell 7 (pwsh); cai para Windows PowerShell se ausente.
where pwsh >nul 2>nul
if %errorlevel%==0 (
    pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0ativar-atualizar-tudo.ps1" %*
) else (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0ativar-atualizar-tudo.ps1" %*
)

if errorlevel 1 (
    echo.
    echo  [ERRO] A ativacao falhou. Verifique os logs.
    pause
    exit /b 1
)

echo.
echo  [OK] Concluido. Pressione qualquer tecla para sair.
pause >nul
exit /b 0
