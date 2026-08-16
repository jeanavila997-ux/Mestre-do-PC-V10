@echo off

: Configure MESTRE_PROJETO_PATH
call C:\Users\Jeanc\Mestre-do-PC-V10-clean\mcp-server\set-mestre-path.bat

: Start launcher
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Jeanc\Mestre-do-PC-V10-clean\mcp-server\start-launcher.ps1"

: Test MCP server
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Jeanc\Mestre-do-PC-V10-clean\mcp-server\test-mcp.ps1"

: Check final status
call C:\Users\Jeanc\Mestre-do-PC-V10-clean\mcp-server\check-status.bat
