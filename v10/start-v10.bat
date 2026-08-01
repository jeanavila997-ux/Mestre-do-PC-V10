@echo off
setlocal
title Mestre do PC V10 - Bootstrap

set "TASK_NAME=MestreDoPC_Admin_Launcher"
set "BASE_DIR=%~dp0"
set "APP_URL=http://127.0.0.1:7777/"

if not exist "%BASE_DIR%index.html" (
    echo [ERRO] HTML da V10 nao encontrado em "%BASE_DIR%index.html".
    timeout /t 3 /nobreak >nul
    exit /b 1
)

echo.
echo ==================================================
echo  MESTRE DO PC V10 -- Bootstrap
echo ==================================================
echo.

call :checkHealth
if %errorlevel% equ 0 goto openHtml

echo [INFO] Launcher offline. Disparando tarefa admin...
schtasks /Run /TN "%TASK_NAME%" >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERRO] Tarefa "%TASK_NAME%" nao encontrada.
    echo        Execute INSTALAR.bat como Administrador uma vez para registra-la.
    timeout /t 4 /nobreak >nul
    exit /b 1
)

call :waitForHealth 25
if %errorlevel% neq 0 (
    echo [ERRO] O launcher nao respondeu na porta 7777 apos 25 segundos.
    echo        Tente executar MestreDoPC-Launcher.ps1 como Administrador manualmente.
    timeout /t 4 /nobreak >nul
    exit /b 1
)

:openHtml
echo [OK] Launcher saudavel. Abrindo interface V10...
start "" "%APP_URL%"
exit /b 0

:checkHealth
powershell.exe -NoLogo -NoProfile -Command "try { $r = Invoke-RestMethod -Uri 'http://127.0.0.1:7777/ping' -TimeoutSec 2 -ErrorAction Stop; if ($r.status -eq 'ok') { exit 0 } else { exit 1 } } catch { exit 1 }"
exit /b %errorlevel%

:waitForHealth
set "MAX_ATTEMPTS=%~1"
if "%MAX_ATTEMPTS%"=="" set "MAX_ATTEMPTS=20"
set /a CURRENT_ATTEMPT=0
:waitLoop
set /a CURRENT_ATTEMPT+=1
call :checkHealth
if %errorlevel% equ 0 exit /b 0
if %CURRENT_ATTEMPT% geq %MAX_ATTEMPTS% exit /b 1
timeout /t 1 /nobreak >nul
goto waitLoop
