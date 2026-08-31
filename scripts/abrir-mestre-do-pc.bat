@echo off
chcp 65001 >nul

:: Inicia o launcher Node.js em uma janela minimizada separada
start "Mestre do PC Launcher" /min cmd /c "cd /d %USERPROFILE%\Mestre-do-PC-V10-clean\v10 && node launcher.js"

:: Aguarda o servidor subir
timeout /t 3 /nobreak >nul

:: Abre a interface no navegador padrão
start http://127.0.0.1:7777

exit /b 0
