<#
.SYNOPSIS
    Ativa e atualiza todos os componentes do Mestre do PC V10/V11.

.DESCRIPTION
    Script de ativação/atualização completo. Alinhado com a arquitetura V10:

    - Launcher primário: Node.js (v10\launcher.js) na porta 7777, elevado via
      tarefa agendada MestreDoPC_Admin_Launcher (RunLevel Highest).
    - MCP Server: mcp-server\index.js (stdio), testado com `npm test`.
    - Ollama: local em 127.0.0.1:11434 (ou cloud via OLLAMA_API_KEY).

    O script:
      1. Verifica/eleva para Administrador (mesmo host PowerShell)
      2. Define variáveis de ambiente (sessão + permanentes, sem sobrescrever
         valores já configurados pelo usuário)
      3. Faz backup leve (rede, programas instalados, config do app)
      4. Verifica pré-requisitos (PowerShell 7, Node 20+, npm, git, Ollama)
      5. Atualiza o repositório (git pull --autostash)
      6. Instala/atualiza dependências (mcp-server + v10)
      7. Valida sintaxe de scripts PowerShell e JavaScript
      8. Inicia Ollama e pré-aquece o modelo padrão
      9. Para instâncias antigas do launcher (Node e PowerShell legado)
     10. Inicia o launcher elevado (porta 7777)
     11. Registra tarefas agendadas (Launcher + Startup)
     12. Sincroniza allowed-operations.json
     13. Configura ExecutionPolicy (CurrentUser)
     14. Executa testes do MCP
     15. Verifica status final de todos os serviços
     16. Abre a interface web
     17. Exibe o token da extensão e próximos passos

.PARAMETER SkipGit
    Pula o git pull (útil se há alterações locais não commitadas).

.PARAMETER SkipOllama
    Pula a inicialização e o pré-aquecimento do Ollama.

.PARAMETER SkipTests
    Pula a execução dos testes do MCP.

.PARAMETER SkipBackup
    Pula a criação do backup de segurança.

.PARAMETER Force
    Remove node_modules e reinstala dependências do zero (npm ci --force).

.EXAMPLE
    .\ativar-atualizar-tudo.ps1
    .\ativar-atualizar-tudo.ps1 -SkipGit -SkipTests
    .\ativar-atualizar-tudo.ps1 -Force
#>

[CmdletBinding()]
param(
    [switch]$SkipGit,
    [switch]$SkipOllama,
    [switch]$SkipTests,
    [switch]$SkipBackup,
    [switch]$Force
)

# =====================================================================
# 0 – Configuração global
# =====================================================================
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$ProjectRoot = $PSScriptRoot
$LogDir = Join-Path $ProjectRoot 'logs'
$LogFile = Join-Path $LogDir 'ativar-atualizar.log'
$StartTime = Get-Date

if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
}

function Write-Log {
    param(
        [string]$Message,
        [ValidateSet('INFO', 'OK', 'WARN', 'ERROR', 'STEP')]
        [string]$Level = 'INFO'
    )
    $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    $line = "[$timestamp] [$Level] $Message"
    Add-Content -Path $LogFile -Value $line -Encoding UTF8
    switch ($Level) {
        'STEP'  { Write-Host "`n========== $Message ==========" -ForegroundColor Cyan }
        'OK'    { Write-Host "  [OK] $Message" -ForegroundColor Green }
        'WARN'  { Write-Host "  [WARN] $Message" -ForegroundColor Yellow }
        'ERROR' { Write-Host "  [ERROR] $Message" -ForegroundColor Red }
        default { Write-Host "  [INFO] $Message" -ForegroundColor Gray }
    }
}

function Test-Command {
    param([string]$Name)
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Wait-Http {
    param(
        [string]$Url,
        [int]$TimeoutSeconds = 30,
        [int]$IntervalSeconds = 2
    )
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $null = Invoke-RestMethod -Uri $Url -TimeoutSec 3 -ErrorAction Stop
            return $true
        } catch {
            Start-Sleep -Seconds $IntervalSeconds
        }
    }
    return $false
}

function Get-CurrentPowerShellExe {
    $proc = Get-Process -Id $PID -ErrorAction SilentlyContinue
    if ($proc -and $proc.Path -and (Test-Path $proc.Path)) { return $proc.Path }
    if ($PSVersionTable.PSEdition -eq 'Core') { return 'pwsh.exe' }
    return (Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe')
}

function Get-OllamaExe {
    $candidate = Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe'
    if (Test-Path $candidate) { return $candidate }
    $cmd = Get-Command ollama -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    return $null
}

# =====================================================================
# 1 – Verificar privilégios de Administrador e elevar
# =====================================================================
Write-Log 'Verificando privilégios de Administrador...' 'STEP'

$isAdmin = ([Security.Principal.WindowsPrincipal] `
    [Security.Principal.WindowsIdentity]::GetCurrent()
).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Log 'Reiniciando como Administrador...' 'WARN'
    $elevArgs = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $PSCommandPath)
    foreach ($switchName in @('SkipGit', 'SkipOllama', 'SkipTests', 'SkipBackup', 'Force')) {
        if ($PSBoundParameters.ContainsKey($switchName)) { $elevArgs += "-$switchName" }
    }
    $proc = Start-Process -FilePath (Get-CurrentPowerShellExe) `
        -Verb RunAs -Wait -PassThru -ArgumentList $elevArgs
    exit $proc.ExitCode
}

Write-Log 'Executando como Administrador.' 'OK'

# =====================================================================
# 2 – Definir variáveis de ambiente (sessão + permanentes)
# =====================================================================
Write-Log 'Configurando variáveis de ambiente...' 'STEP'

# Âncora do projeto: sempre aponta para a raiz atual (não sobrescreve o resto).
[Environment]::SetEnvironmentVariable('MESTRE_PROJETO_PATH', $ProjectRoot, 'User')
[Environment]::SetEnvironmentVariable('MESTRE_PROJETO_PATH', $ProjectRoot)

# Padrões — só persistem se ainda não existirem (respeita override do usuário).
$envDefaults = [ordered]@{
    'MESTRE_BASE_URL'        = 'http://127.0.0.1:7777'
    'MESTRE_AUDIT_LOG_DIR'   = Join-Path $ProjectRoot 'logs\audit'
    'OLLAMA_URL'             = 'http://127.0.0.1:11434'
    'OLLAMA_MODEL'           = 'qwen2.5-coder:3b-instruct'
    'OLLAMA_MODEL_PROFILE'   = 'balanced'
    'OLLAMA_NUM_CTX'         = '8192'
    'OLLAMA_TEMPERATURE'     = '0.7'
    'OLLAMA_TOP_P'           = '0.9'
    'OLLAMA_TOP_K'           = '40'
    'OLLAMA_KEEP_ALIVE'      = '5m'
    'MPC_PORT'               = '7777'
    'MPC_HOST'               = '127.0.0.1'
}

foreach ($kv in $envDefaults.GetEnumerator()) {
    if (-not [Environment]::GetEnvironmentVariable($kv.Key, 'User')) {
        [Environment]::SetEnvironmentVariable($kv.Key, $kv.Value, 'User')
        Write-Log "Env var persistida: $($kv.Key)" 'OK'
    }
    if (-not [Environment]::GetEnvironmentVariable($kv.Key)) {
        [Environment]::SetEnvironmentVariable($kv.Key, $kv.Value)
    }
}

# OLLAMA_API_KEY (modo cloud) nunca é tocada — é opt-in do usuário.
if ([Environment]::GetEnvironmentVariable('OLLAMA_API_KEY', 'User')) {
    Write-Log 'OLLAMA_API_KEY detectada — modo cloud do Ollama ativo.' 'OK'
}

# Token da extensão do navegador (gerado uma única vez, persistido).
$extToken = [Environment]::GetEnvironmentVariable('MESTRE_EXTENSION_TOKEN', 'User')
if (-not $extToken) {
    $bytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $extToken = -join ($bytes | ForEach-Object { $_.ToString('x2') })
    [Environment]::SetEnvironmentVariable('MESTRE_EXTENSION_TOKEN', $extToken, 'User')
    Write-Log 'Token de extensão gerado e persistido.' 'WARN'
}
[Environment]::SetEnvironmentVariable('MESTRE_EXTENSION_TOKEN', $extToken)

# =====================================================================
# 3 – Backup de segurança (leve: rede + programas + config do app)
# =====================================================================
if (-not $SkipBackup) {
    Write-Log 'Criando backup de segurança...' 'STEP'

    $backupDir = Join-Path $env:USERPROFILE 'MestrePC-Backups'
    $backupStamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $backupPath = Join-Path $backupDir $backupStamp
    New-Item -ItemType Directory -Force -Path $backupPath | Out-Null

    # Configuração de rede
    try {
        ipconfig /all | Out-File -FilePath (Join-Path $backupPath 'network-config.txt') -Encoding UTF8
        Write-Log "Backup de rede salvo: $backupPath\network-config.txt" 'OK'
    } catch {
        Write-Log "Falha no backup de rede: $_" 'WARN'
    }

    # Lista de programas instalados
    try {
        Get-ItemProperty 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
                         'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*' `
            -ErrorAction SilentlyContinue |
            Where-Object { $_.DisplayName } |
            Select-Object DisplayName, DisplayVersion, Publisher |
            Sort-Object DisplayName |
            Format-Table -AutoSize |
            Out-File -FilePath (Join-Path $backupPath 'installed-programs.txt') -Encoding UTF8
        Write-Log "Lista de programas salva: $backupPath\installed-programs.txt" 'OK'
    } catch {
        Write-Log "Falha ao listar programas: $_" 'WARN'
    }

    # Configurações do próprio app (whitelist + lockfiles) — rápido e útil
    $configFiles = @(
        'v10\allowed-operations.json',
        'mcp-server\package-lock.json',
        'v10\package.json'
    )
    foreach ($rel in $configFiles) {
        $src = Join-Path $ProjectRoot $rel
        if (Test-Path $src) {
            Copy-Item -LiteralPath $src -Destination (Join-Path $backupPath (Split-Path $rel -Leaf)) -Force
            Write-Log "Config salva: $rel" 'OK'
        }
    }
} else {
    Write-Log 'Backup pulado (-SkipBackup)' 'WARN'
}

# =====================================================================
# 4 – Verificar pré-requisitos (PowerShell 7, Node.js, npm, git, Ollama)
# =====================================================================
Write-Log 'Verificando pré-requisitos...' 'STEP'

# PowerShell 7
$pwshVersion = $PSVersionTable.PSVersion.ToString()
if ($PSVersionTable.PSVersion.Major -lt 7) {
    Write-Log "PowerShell 7+ recomendado (atual: $pwshVersion)" 'WARN'
} else {
    Write-Log "PowerShell $pwshVersion OK" 'OK'
}

# Node.js
if (Test-Command 'node') {
    $nodeVer = (node --version 2>&1)
    $nodeMajor = [int]($nodeVer -replace 'v(\d+)\..*', '$1')
    if ($nodeMajor -lt 20) {
        Write-Log "Node.js $nodeVer — recomendado 20+" 'WARN'
    } else {
        Write-Log "Node.js $nodeVer OK" 'OK'
    }
} else {
    Write-Log 'Node.js não encontrado! Instale em https://nodejs.org' 'ERROR'
    throw 'Node.js é obrigatório'
}

# npm
if (Test-Command 'npm') {
    Write-Log "npm $(npm --version 2>&1) OK" 'OK'
} else {
    Write-Log 'npm não encontrado!' 'ERROR'
    throw 'npm é obrigatório'
}

# git
if (Test-Command 'git') {
    Write-Log "git $(git --version 2>&1) OK" 'OK'
} else {
    Write-Log 'git não encontrado — git pull será pulado' 'WARN'
    $SkipGit = $true
}

# Ollama
$ollamaExe = Get-OllamaExe
if ($ollamaExe) {
    Write-Log "Ollama detectado: $ollamaExe" 'OK'
} else {
    Write-Log 'Ollama não encontrado — funcionalidades de IA ficarão indisponíveis' 'WARN'
}

# =====================================================================
# 5 – Atualizar repositório (git pull --autostash)
# =====================================================================
if (-not $SkipGit) {
    Write-Log 'Atualizando repositório (git pull --autostash)...' 'STEP'
    try {
        Push-Location $ProjectRoot
        git pull --autostash 2>&1 | ForEach-Object { Write-Log $_ 'INFO' }
        if ($LASTEXITCODE -eq 0) {
            Write-Log 'Repositório atualizado.' 'OK'
        } else {
            Write-Log 'git pull retornou erro — verifique conflitos.' 'ERROR'
        }
    } catch {
        Write-Log "Falha no git pull: $_" 'ERROR'
    } finally {
        Pop-Location
    }
} else {
    Write-Log 'git pull pulado (-SkipGit)' 'WARN'
}

# =====================================================================
# 6 – Instalar/atualizar dependências (mcp-server + v10)
# =====================================================================
Write-Log 'Instalando dependências do MCP Server...' 'STEP'

$mcpDir = Join-Path $ProjectRoot 'mcp-server'
if (Test-Path $mcpDir) {
    Push-Location $mcpDir
    try {
        if ($Force) {
            Write-Log 'Reinstalação forçada (--force)...' 'WARN'
            Remove-Item -Recurse -Force 'node_modules' -ErrorAction SilentlyContinue
            npm ci --force --no-audit --no-fund 2>&1 | ForEach-Object {
                if ($_ -match 'error|ERR') { Write-Log $_ 'ERROR' }
                elseif ($_ -match 'added|changed|removed') { Write-Log $_ 'OK' }
            }
        } else {
            npm ci --no-audit --no-fund 2>&1 | ForEach-Object {
                if ($_ -match 'error|ERR') { Write-Log $_ 'ERROR' }
                elseif ($_ -match 'added|changed|removed') { Write-Log $_ 'OK' }
            }
        }
        if ($LASTEXITCODE -eq 0) {
            Write-Log 'Dependências do MCP instaladas.' 'OK'
        } else {
            Write-Log "npm ci falhou (código $LASTEXITCODE)." 'ERROR'
        }
    } catch {
        Write-Log "Falha ao instalar dependências: $_" 'ERROR'
    } finally {
        Pop-Location
    }
} else {
    Write-Log "Pasta mcp-server não encontrada em $mcpDir" 'ERROR'
}

# Dependências do launcher Node.js (v10)
$v10Dir = Join-Path $ProjectRoot 'v10'
if (Test-Path (Join-Path $v10Dir 'package.json')) {
    Write-Log 'Instalando dependências do v10/launcher...' 'STEP'
    Push-Location $v10Dir
    try {
        npm install --no-audit --no-fund 2>&1 | ForEach-Object {
            if ($_ -match 'error|ERR') { Write-Log $_ 'ERROR' }
            elseif ($_ -match 'added|changed|removed') { Write-Log $_ 'OK' }
        }
        if ($LASTEXITCODE -eq 0) {
            Write-Log 'Dependências v10 instaladas.' 'OK'
        } else {
            Write-Log 'npm install (v10) falhou.' 'WARN'
        }
    } catch {
        Write-Log "Falha v10: $_" 'WARN'
    } finally {
        Pop-Location
    }
}

# =====================================================================
# 7 – Validar sintaxe de scripts PowerShell e JavaScript
# =====================================================================
Write-Log 'Validando sintaxe de todos os scripts...' 'STEP'

# PowerShell
$psFiles = @(
    'MestreDoPC-Launcher.ps1'
    'install.ps1'
    'Register-MestreTask.ps1'
    'start-mestre-v10.ps1'
    'uninstall.ps1'
    'validate-v11.ps1'
    'startup\MestreDoPC-Startup.ps1'
)

foreach ($file in $psFiles) {
    $fullPath = Join-Path $ProjectRoot $file
    if (Test-Path $fullPath) {
        $errors = $null
        [System.Management.Automation.Language.Parser]::ParseFile($fullPath, [ref]$null, [ref]$errors)
        if ($errors.Count -eq 0) {
            Write-Log "PS OK: $file" 'OK'
        } else {
            Write-Log "PS ERRO: $file — $($errors.Count) erro(s)" 'ERROR'
            $errors | ForEach-Object { Write-Log "  → $($_.Message)" 'ERROR' }
        }
    }
}

# JavaScript
$jsFiles = @(
    'mcp-server\index.js'
    'mcp-server\security.js'
    'mcp-server\audit-logger.js'
    'v10\launcher.js'
)

foreach ($file in $jsFiles) {
    $fullPath = Join-Path $ProjectRoot $file
    if (Test-Path $fullPath) {
        $result = & node --check $fullPath 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Log "JS OK: $file" 'OK'
        } else {
            Write-Log "JS ERRO: $file — $result" 'ERROR'
        }
    }
}

# =====================================================================
# 8 – Iniciar Ollama e pré-aquecer modelo
# =====================================================================
if (-not $SkipOllama -and $ollamaExe) {
    Write-Log 'Iniciando Ollama...' 'STEP'

    $ollamaUp = $false
    try {
        $null = Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/tags' -TimeoutSec 5 -ErrorAction Stop
        $ollamaUp = $true
        Write-Log 'Ollama já está rodando.' 'OK'
    } catch {
        Write-Log 'Ollama não responde. Iniciando em background...' 'INFO'
    }

    if (-not $ollamaUp) {
        try {
            Start-Process -FilePath $ollamaExe -ArgumentList 'serve' -WindowStyle Hidden -ErrorAction Stop
            $ollamaUp = Wait-Http -Url 'http://127.0.0.1:11434/api/tags' -TimeoutSeconds 30 -IntervalSeconds 3
            if ($ollamaUp) {
                Write-Log 'Ollama iniciado com sucesso.' 'OK'
            } else {
                Write-Log 'Ollama não subiu em 30s. Continuando sem IA.' 'WARN'
            }
        } catch {
            Write-Log "Falha ao iniciar Ollama: $_" 'WARN'
        }
    }

    # Pré-aquecer modelo padrão
    if ($ollamaUp) {
        $model = [Environment]::GetEnvironmentVariable('OLLAMA_MODEL')
        Write-Log "Pré-aquecendo modelo $model..." 'INFO'
        try {
            $warmupBody = @{
                model      = $model
                keep_alive = '10m'
                messages   = @(@{ role = 'user'; content = 'Olá' })
                stream     = $false
            } | ConvertTo-Json -Depth 5

            $null = Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/chat' `
                -Method Post -Body $warmupBody -ContentType 'application/json' -TimeoutSec 120
            Write-Log "Modelo $model aquecido e em memória." 'OK'
        } catch {
            Write-Log "Falha ao pré-aquecer modelo (pode não estar instalado): $_" 'WARN'
            Write-Log "Tentando baixar $model..." 'INFO'
            try {
                $pullProc = Start-Process -FilePath $ollamaExe -ArgumentList "pull $model" `
                    -WindowStyle Hidden -Wait -PassThru -ErrorAction Stop
                if ($pullProc.ExitCode -eq 0) {
                    Write-Log "Modelo $model baixado." 'OK'
                } else {
                    Write-Log "Falha ao baixar modelo (código $($pullProc.ExitCode))." 'WARN'
                }
            } catch {
                Write-Log "Falha ao baixar modelo: $_" 'WARN'
            }
        }
    }
} else {
    Write-Log 'Ollama pulado (-SkipOllama ou não instalado)' 'WARN'
}

# =====================================================================
# 9 – Parar instâncias antigas do launcher
# =====================================================================
Write-Log 'Parando instâncias antigas do Launcher...' 'STEP'

# 1) Quem estiver escutando na porta 7777 (se for processo nosso)
$conn = Get-NetTCPConnection -LocalPort 7777 -State Listen -ErrorAction SilentlyContinue
if ($conn) {
    $ownerPid = @($conn | Select-Object -ExpandProperty OwningProcess -Unique)[0]
    $owner = Get-Process -Id $ownerPid -ErrorAction SilentlyContinue
    if ($owner -and $owner.ProcessName -in @('node', 'powershell', 'pwsh')) {
        Write-Log "Parando launcher na porta 7777 (PID $ownerPid, $($owner.ProcessName))..." 'WARN'
        Stop-Process -Id $ownerPid -Force -ErrorAction SilentlyContinue
    } else {
        Write-Log "Porta 7777 ocupada por processo externo ($($owner.ProcessName), PID $ownerPid) — não vou encerrá-lo." 'WARN'
    }
}

# 2) Processos node rodando v10\launcher.js (fallback por linha de comando)
Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match 'launcher\.js' } |
    ForEach-Object {
        Write-Log "Parando Node launcher PID $($_.ProcessId)..." 'WARN'
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }

# 3) Launcher PowerShell legado (MestreDoPC-Launcher.ps1)
Get-CimInstance Win32_Process -Filter "Name='powershell.exe' OR Name='pwsh.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match 'MestreDoPC-Launcher' -and $_.ProcessId -ne $PID } |
    ForEach-Object {
        Write-Log "Parando launcher PS legado PID $($_.ProcessId)..." 'WARN'
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }

Start-Sleep -Seconds 2

# =====================================================================
# 10 – Iniciar launcher elevado (Node.js, porta 7777)
# =====================================================================
Write-Log 'Iniciando Launcher (Node.js, elevado)...' 'STEP'

$launcherJs = Join-Path $ProjectRoot 'v10\launcher.js'
$launcherTask = 'MestreDoPC_Admin_Launcher'

if (Test-Path $launcherJs) {
    $task = Get-ScheduledTask -TaskName $launcherTask -ErrorAction SilentlyContinue

    if ($task) {
        # Caminho preferido: a tarefa roda com RunLevel Highest (elevação garantida).
        try {
            Start-ScheduledTask -TaskName $launcherTask -ErrorAction Stop
            Write-Log "Tarefa '$launcherTask' disparada." 'INFO'
        } catch {
            Write-Log "Falha ao disparar tarefa: $_ — iniciando direto." 'WARN'
            $nodeExe = (Get-Command node).Source
            Start-Process -FilePath $nodeExe `
                -ArgumentList "`"$launcherJs`"" `
                -WorkingDirectory (Join-Path $ProjectRoot 'v10') `
                -WindowStyle Hidden -ErrorAction Stop
        }
    } else {
        # Fallback: sem tarefa registrada, inicia direto (pode faltar elevação).
        Write-Log "Tarefa '$launcherTask' não registrada — iniciando direto (sem elevação garantida)." 'WARN'
        $nodeExe = (Get-Command node).Source
        Start-Process -FilePath $nodeExe `
            -ArgumentList "`"$launcherJs`"" `
            -WorkingDirectory (Join-Path $ProjectRoot 'v10') `
            -WindowStyle Hidden -ErrorAction Stop
    }

    $launcherReady = Wait-Http -Url 'http://127.0.0.1:7777/ping' -TimeoutSeconds 30
    if ($launcherReady) {
        Write-Log 'Launcher respondendo em http://127.0.0.1:7777' 'OK'
        try {
            $ping = Invoke-RestMethod -Uri 'http://127.0.0.1:7777/ping' -TimeoutSec 5
            Write-Log "Launcher: admin=$($ping.admin), pid=$($ping.pid)" 'OK'
        } catch {
            Write-Log 'Não foi possível obter detalhes do launcher' 'WARN'
        }
    } else {
        Write-Log 'Launcher não respondeu em 30s' 'ERROR'
        Write-Log 'Tente iniciar manualmente: node v10\launcher.js' 'WARN'
    }
} else {
    Write-Log "Launcher Node.js não encontrado: $launcherJs" 'ERROR'
}

# =====================================================================
# 11 – Registrar tarefas agendadas (Launcher + Startup)
# =====================================================================
Write-Log 'Registrando tarefas agendadas...' 'STEP'

# Tarefa do Launcher — reutiliza o script oficial (aponta para v10\launcher.js,
# RunLevel Highest, trigger AtLogon).
$registerScript = Join-Path $ProjectRoot 'Register-MestreTask.ps1'
if (Test-Path $registerScript) {
    try {
        & $registerScript -InstallDir $ProjectRoot
        if ($LASTEXITCODE -eq 0) {
            Write-Log "Tarefa '$launcherTask' registrada (RunLevel Highest)." 'OK'
        } else {
            Write-Log "Falha ao registrar '$launcherTask' (código $LASTEXITCODE)." 'ERROR'
        }
    } catch {
        Write-Log "Falha ao registrar '$launcherTask': $_" 'ERROR'
    }
} else {
    Write-Log "Register-MestreTask.ps1 não encontrado." 'ERROR'
}

# Tarefa de Startup (usuário, sem Admin) — garante Ollama + pré-aquecimento
# + re-sobe o launcher se morreu. Mesma lógica do install.ps1.
$startupScript = Join-Path $ProjectRoot 'startup\MestreDoPC-Startup.ps1'
if (Test-Path $startupScript) {
    $startupTaskName = 'MestreDoPC_Startup'
    $psExe = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $userId = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    try {
        Unregister-ScheduledTask -TaskName $startupTaskName -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
        $action2 = New-ScheduledTaskAction `
            -Execute $psExe `
            -Argument "-NoLogo -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$startupScript`""
        $trigger2 = New-ScheduledTaskTrigger -AtLogon -User $userId
        $principal2 = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited
        $settings2 = New-ScheduledTaskSettingsSet `
            -AllowStartIfOnBatteries `
            -DontStopIfGoingOnBatteries `
            -StartWhenAvailable `
            -MultipleInstances IgnoreNew `
            -ExecutionTimeLimit (New-TimeSpan -Minutes 5)
        Register-ScheduledTask `
            -TaskName $startupTaskName `
            -Action $action2 `
            -Trigger $trigger2 `
            -Principal $principal2 `
            -Settings $settings2 `
            -Force | Out-Null
        Write-Log "Tarefa '$startupTaskName' registrada (usuário, sem Admin)." 'OK'
    } catch {
        Write-Log "Falha ao registrar startup task: $_" 'WARN'
    }
} else {
    Write-Log 'startup\MestreDoPC-Startup.ps1 não encontrado — tarefa de startup pulada.' 'WARN'
}

# =====================================================================
# 12 – Sincronizar allowed-operations.json
# =====================================================================
Write-Log 'Sincronizando allowed-operations.json...' 'STEP'

$fixScript = Join-Path $ProjectRoot 'mcp-server\fix-allowed-ops.ps1'
if (Test-Path $fixScript) {
    try {
        & pwsh -NoProfile -ExecutionPolicy Bypass -File $fixScript 2>&1 |
            ForEach-Object { Write-Log $_ 'INFO' }
        Write-Log 'allowed-operations.json sincronizado.' 'OK'
    } catch {
        Write-Log "Falha na sincronização: $_" 'WARN'
    }
} else {
    Write-Log 'fix-allowed-ops.ps1 não encontrado' 'WARN'
}

# =====================================================================
# 13 – Configurar ExecutionPolicy (CurrentUser)
# =====================================================================
Write-Log 'Configurando permissões locais...' 'STEP'

try {
    Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser -Force -ErrorAction Stop
    Write-Log 'ExecutionPolicy definida como RemoteSigned (CurrentUser)' 'OK'
} catch {
    Write-Log "Falha ao definir ExecutionPolicy: $_" 'WARN'
}

# =====================================================================
# 14 – Executar testes do MCP
# =====================================================================
if (-not $SkipTests) {
    Write-Log 'Executando testes do MCP...' 'STEP'
    Push-Location $mcpDir
    try {
        $testOutput = npm test 2>&1
        $testOutput | ForEach-Object {
            if ($_ -match 'passing|passed|ok') { Write-Log $_ 'OK' }
            elseif ($_ -match 'fail|error') { Write-Log $_ 'ERROR' }
            else { Write-Log $_ 'INFO' }
        }
        Write-Log 'Testes concluídos.' 'OK'
    } catch {
        Write-Log "Falha nos testes: $_" 'ERROR'
    } finally {
        Pop-Location
    }
} else {
    Write-Log 'Testes pulados (-SkipTests)' 'WARN'
}

# =====================================================================
# 15 – Verificar status final de todos os serviços
# =====================================================================
Write-Log 'Verificação final de status...' 'STEP'

$Status = [ordered]@{
    Timestamp    = (Get-Date).ToString('u')
    ComputerName = $env:COMPUTERNAME
    User         = "$env:USERDOMAIN\$env:USERNAME"
    Admin        = $isAdmin
    ProjectPath  = $ProjectRoot
}

# Launcher (Node.js)
try {
    $ping = Invoke-RestMethod -Uri 'http://127.0.0.1:7777/ping' -TimeoutSec 5 -ErrorAction Stop
    $Status['Launcher'] = "Online (admin=$($ping.admin), pid=$($ping.pid))"
    Write-Log "Launcher: Online (admin=$($ping.admin), pid=$($ping.pid))" 'OK'
} catch {
    $Status['Launcher'] = 'Offline'
    Write-Log 'Launcher: Offline' 'ERROR'
}

# Ollama
try {
    $tags = Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/tags' -TimeoutSec 5 -ErrorAction Stop
    $modelCount = ($tags.models | Measure-Object).Count
    $Status['Ollama'] = "Online ($modelCount modelo(s))"
    Write-Log "Ollama: Online ($modelCount modelo(s))" 'OK'
} catch {
    $Status['Ollama'] = 'Offline'
    Write-Log 'Ollama: Offline' 'WARN'
}

# Tarefas agendadas
foreach ($taskName in @('MestreDoPC_Admin_Launcher', 'MestreDoPC_Startup')) {
    $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($task) {
        $taskInfo = Get-ScheduledTaskInfo -TaskName $taskName -ErrorAction SilentlyContinue
        $Status["Task_$taskName"] = "$($task.State) (última: $($taskInfo.LastRunTime))"
        Write-Log "Tarefa ${taskName}: $($task.State)" 'OK'
    } else {
        $Status["Task_$taskName"] = 'Não registrada'
        Write-Log "Tarefa ${taskName}: Não registrada" 'WARN'
    }
}

# MCP Server (sintaxe)
$mcpIndex = Join-Path $mcpDir 'index.js'
if (Test-Path $mcpIndex) {
    $checkResult = & node --check $mcpIndex 2>&1
    if ($LASTEXITCODE -eq 0) {
        $Status['MCPServer'] = 'Sintaxe OK'
        Write-Log 'MCP Server: Sintaxe OK' 'OK'
    } else {
        $Status['MCPServer'] = "Erro: $checkResult"
        Write-Log 'MCP Server: Erro de sintaxe' 'ERROR'
    }
} else {
    $Status['MCPServer'] = 'Não encontrado'
}

# Extensão
$extManifest = Join-Path $ProjectRoot 'browser-extension\manifest.json'
if (Test-Path $extManifest) {
    $manifest = Get-Content $extManifest -Raw | ConvertFrom-Json
    $Status['Extension'] = "v$($manifest.version)"
    Write-Log "Extensão: v$($manifest.version)" 'OK'
} else {
    $Status['Extension'] = 'Não encontrada'
}

# allowed-operations.json
$allowedOps = Join-Path $ProjectRoot 'v10\allowed-operations.json'
if (Test-Path $allowedOps) {
    $ops = Get-Content $allowedOps -Raw | ConvertFrom-Json
    $opsCount = if ($ops.operations) { ($ops.operations | Measure-Object).Count } else { ($ops | Measure-Object).Count }
    $Status['AllowedOps'] = "$opsCount operações"
    Write-Log "Whitelist: $opsCount operações" 'OK'
} else {
    $Status['AllowedOps'] = 'Não encontrado'
    Write-Log 'Whitelist: Não encontrada' 'ERROR'
}

# Exibir resumo
Write-Log 'RESUMO FINAL' 'STEP'
$Status.GetEnumerator() | ForEach-Object {
    Write-Host ("  {0,-28} = {1}" -f $_.Key, $_.Value) -ForegroundColor White
}

# Salvar resumo em JSON
$summaryFile = Join-Path $LogDir 'ativar-atualizar-summary.json'
$Status | ConvertTo-Json -Depth 5 | Set-Content -Path $summaryFile -Encoding UTF8
Write-Log "Resumo salvo em: $summaryFile" 'OK'

# =====================================================================
# 16 – Abrir interface web
# =====================================================================
Write-Log 'Abrindo interface web...' 'STEP'
try {
    Start-Process 'http://127.0.0.1:7777/'
    Write-Log 'Interface aberta no navegador.' 'OK'
} catch {
    Write-Log "Não foi possível abrir o navegador: $_" 'WARN'
    Write-Log 'Acesse manualmente: http://127.0.0.1:7777/' 'INFO'
}

# =====================================================================
# 17 – Exibir token da extensão e próximas etapas
# =====================================================================
Write-Log 'CONFIGURAÇÃO DA EXTENSÃO' 'STEP'
Write-Host ""
Write-Host "  ═══════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  🔑 TOKEN DA EXTENSÃO (guarde em local seguro):" -ForegroundColor Yellow
Write-Host "  $extToken" -ForegroundColor White
Write-Host "  ═══════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "  📋 PRÓXIMOS PASSOS:" -ForegroundColor Yellow
Write-Host "  1. Carregue a extensão em chrome://extensions/ (modo desenvolvedor)"
Write-Host "     Pasta: $ProjectRoot\browser-extension"
Write-Host "  2. Copie o ID da extensão (chrome-extension://<ID>)"
Write-Host "  3. Defina a origem permitida no launcher:"
Write-Host '     $env:MESTRE_EXTENSION_ORIGINS="chrome-extension://<ID>"'
Write-Host "  4. Cole o token acima nas opções da extensão"
Write-Host "  5. Reinicie o launcher para aplicar a origem"
Write-Host ""
Write-Host "  📂 Logs: $LogFile"
if (-not $SkipBackup) {
    Write-Host "  📂 Backups: $backupPath"
}
Write-Host ""

# =====================================================================
# Fim
# =====================================================================
$elapsed = (Get-Date) - $StartTime
Write-Log "Concluído em $($elapsed.ToString('mm\:ss'))" 'OK'
Write-Host ""
Write-Host "  ✅ Mestre do PC ativado e atualizado com sucesso!" -ForegroundColor Green
Write-Host ""
