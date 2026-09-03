# Raiz do projeto = pai da pasta mcp-server
$projPath = Split-Path -Parent $PSScriptRoot

# Configura para a sessão atual
$env:MESTRE_PROJETO_PATH = $projPath
Write-Output ('MESTRE_PROJETO_PATH (session) set to ' + $env:MESTRE_PROJETO_PATH)

# Configura persistente para o usuário atual
[Environment]::SetEnvironmentVariable('MESTRE_PROJETO_PATH', $projPath, 'User')
Write-Output 'MESTRE_PROJETO_PATH set persistently for current user'
