$launcherPath = Join-Path (Split-Path -Parent $PSScriptRoot) 'v10\launcher.js'

# Inicia o launcher em uma janela visível (para debug)
Start-Process node -ArgumentList $launcherPath -WindowStyle Normal

Write-Output 'Launcher started in a visible window. Check if port 7777 is listening.'
Write-Output 'If UAC prompt appears, allow it.'
