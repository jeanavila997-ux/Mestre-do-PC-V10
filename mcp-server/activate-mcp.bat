@echo off

rem Configura MESTRE_PROJETO_PATH
call "%~dp0set-mestre-path.bat"

rem Inicia o launcher
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-launcher.ps1"

rem Testa o MCP server
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0test-mcp.ps1"

rem Status final
call "%~dp0check-status.bat"
