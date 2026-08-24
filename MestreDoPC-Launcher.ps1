# ================================================================
# Mestre do PC V10 - Servidor HTTP Admin (porta 7777)
# A interface V10 envia comandos autorizados via fetch() -> este PS executa como Admin
# ================================================================

# Resolve o caminho do script logo no bootstrap para reutilizar no PID, task e elevacao.
$scriptPath = $PSCommandPath
if (-not $scriptPath) { $scriptPath = $MyInvocation.MyCommand.Definition }
if (-not $scriptPath -or -not (Test-Path $scriptPath)) { $scriptPath = Join-Path $PWD "MestreDoPC-Launcher.ps1" }

# Forca execucao como Administrador
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    if (Test-Path $scriptPath) {
        $powershellExe = Join-Path $env:WINDIR "System32\WindowsPowerShell\v1.0\powershell.exe"
        Start-Process $powershellExe -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptPath`""
    }
    else {
        Write-Host "Falha ao elevar: Nao foi possivel determinar o caminho do script." -ForegroundColor Red
        Start-Sleep -Seconds 5
    }
    exit
}
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
Add-Type -AssemblyName System.Net.Http

$PORT = 7777
$BASE_URL = "http://127.0.0.1:$PORT"
$URL = "$BASE_URL/"
$PROJECT_DIR = Split-Path -Parent $scriptPath
$V10_HTML = Join-Path $PROJECT_DIR "v10\index.html"
$PID_FILE = Join-Path (Split-Path -Parent $scriptPath) "MestreDoPC-Launcher.pid"
$CommandJobs = [hashtable]::Synchronized(@{})
$JobRetentionMinutes = 30
$JobTimeoutSeconds = 900
$MaxConcurrentJobs = 3
$MaxCmdLength = 8192

# ---------------------------------------------------------------
# Modo Livre — execucao de comandos fora da whitelist (paridade com v10/launcher.js)
# Opt-in e reversivel: desligado por padrao. Quando ligado, /run-free aceita
# qualquer comando PowerShell (sem checar allowed-operations.json) e cada
# execucao e registrada no log de auditoria.
# ---------------------------------------------------------------
$MODO_LIVRE_CONFIG_FILE = Join-Path $PROJECT_DIR "logs\config\modo-livre.json"
$script:ModoLivreEnabled = $false
if (Test-Path -LiteralPath $MODO_LIVRE_CONFIG_FILE) {
    try {
        $savedState = Get-Content -LiteralPath $MODO_LIVRE_CONFIG_FILE -Raw -Encoding UTF8 | ConvertFrom-Json
        $script:ModoLivreEnabled = [bool]$savedState.enabled
    } catch { $script:ModoLivreEnabled = $false }
}

function Set-ModoLivre {
    param([bool] $Enabled)
    $script:ModoLivreEnabled = $Enabled
    try {
        $dir = Split-Path -Parent $MODO_LIVRE_CONFIG_FILE
        if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
        $payload = @{ enabled = $Enabled; updatedAt = (Get-Date).ToString("o") } | ConvertTo-Json
        Set-Content -LiteralPath $MODO_LIVRE_CONFIG_FILE -Value $payload -Encoding UTF8
    } catch {
        Write-Host "[MODO-LIVRE] Falha ao persistir estado: $($_.Exception.Message)" -ForegroundColor Yellow
    }
    return $script:ModoLivreEnabled
}

# ---------------------------------------------------------------
# Memorias do chat (paridade com v10/memory-manager.js + memory-routes.js)
# Arquivo JSON no servidor: sobrevive a "limpar dados do navegador".
# ---------------------------------------------------------------
$MEMORIES_FILE = Join-Path $PROJECT_DIR "v10\data\memories\chat-memories.json"

function Get-MestreMemories {
    if (-not (Test-Path -LiteralPath $MEMORIES_FILE)) { return @() }
    try {
        $data = Get-Content -LiteralPath $MEMORIES_FILE -Raw -Encoding UTF8 | ConvertFrom-Json
        return @($data.memories)
    } catch {
        return @()
    }
}

function Save-MestreMemories {
    param([array] $Memories)
    $dir = Split-Path -Parent $MEMORIES_FILE
    if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    $payload = @{ memories = $Memories; version = "1.0" } | ConvertTo-Json -Depth 10
    Set-Content -LiteralPath $MEMORIES_FILE -Value $payload -Encoding UTF8
}

function New-MestreMemoryId {
    return "mem_$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())_$(Get-Random -Minimum 1000 -Maximum 9999)"
}

function Write-AuditLog {
    param([string] $Level, [string] $Action, [hashtable] $Details = @{})
    try {
        $auditDir = Join-Path $PROJECT_DIR "logs\audit"
        if (-not (Test-Path -LiteralPath $auditDir)) { New-Item -ItemType Directory -Path $auditDir -Force | Out-Null }
        $logFile = Join-Path $auditDir ("audit-{0}.log" -f (Get-Date -Format "yyyy-MM-dd"))
        $entry = [ordered]@{
            timestamp = (Get-Date).ToString("o")
            level = $Level
            action = $Action
            userId = "system"
            computerName = $env:COMPUTERNAME
            pid = $PID
            details = $Details
        } | ConvertTo-Json -Compress
        Add-Content -LiteralPath $logFile -Value $entry -Encoding UTF8
    } catch {
        Write-Host "[AUDIT] Falha ao escrever log: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

# ---------------------------------------------------------------
# Whitelist de operacoes (paridade com v10/launcher.js resolveCommand)
# Somente comandos cadastrados em v10/allowed-operations.json executam.
# ---------------------------------------------------------------
$OPERATIONS_FILE = Join-Path $PROJECT_DIR "v10\allowed-operations.json"
$script:AllowedOperations = @()
$script:AllowedTemplates = @()
$script:OperationsById = @{}
$script:ExactCommands = @{}
$script:CompiledTemplates = @()

function Initialize-OperationCatalog {
    if (-not (Test-Path -LiteralPath $OPERATIONS_FILE)) {
        throw "Catalogo de operacoes nao encontrado: $OPERATIONS_FILE"
    }
    $rawCatalog = Get-Content -LiteralPath $OPERATIONS_FILE -Raw -Encoding UTF8 | ConvertFrom-Json
    $script:AllowedOperations = @($rawCatalog.operations)
    $script:AllowedTemplates = @($rawCatalog.templates)

    # Parte das entradas de 'templates' nao e parametrizada: traz 'command' fixo em vez
    # de 'pattern'. Elas contam como operacoes exatas, senao ficariam inalcancaveis.
    $fixedEntries = @($script:AllowedOperations) + @($script:AllowedTemplates | Where-Object { $_.command -is [string] })
    foreach ($op in $fixedEntries) {
        $script:OperationsById[$op.id] = $op
        $script:ExactCommands[$op.command] = $op
    }

    foreach ($tpl in $script:AllowedTemplates) {
        if (-not ($tpl.pattern -is [string])) { continue }
        $regexSource = [regex]::Escape($tpl.pattern)
        $placeholders = [regex]::Matches($tpl.pattern, '\{\{([A-Z_][A-Z0-9_]*)\}\}') | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique
        foreach ($ph in $placeholders) {
            $paramName = $ph.ToLower()
            $paramRegex = "[a-zA-Z0-9_. -]{1,128}"
            if ($tpl.params -and $tpl.params.PSObject.Properties[$paramName]) {
                $paramRegex = [string]$tpl.params.$paramName
                $paramRegex = $paramRegex.TrimStart('^').TrimEnd('$')
            }
            # O placeholder ja foi escapado junto com o resto do pattern, entao a
            # busca e feita sobre a forma escapada, como texto literal. A primeira
            # ocorrencia vira grupo nomeado; as demais viram backreference, exigindo
            # o mesmo valor em todas as posicoes do template.
            $escapedPh = [regex]::Escape("{{$ph}}")
            $parts = $regexSource.Split([string[]]@($escapedPh), [System.StringSplitOptions]::None)
            $rebuilt = $parts[0]
            for ($i = 1; $i -lt $parts.Count; $i++) {
                $slot = if ($i -eq 1) { "(?<$paramName>$paramRegex)" } else { "\k<$paramName>" }
                $rebuilt += $slot + $parts[$i]
            }
            $regexSource = $rebuilt
        }
        $script:CompiledTemplates += [pscustomobject]@{
            Id = $tpl.id
            Title = $tpl.title
            Pattern = $tpl.pattern
            Params = $tpl.params
            Destructive = [bool]$tpl.destructive
            Regex = [regex]::new("^$regexSource$", [System.Text.RegularExpressions.RegexOptions]::Singleline)
        }
    }
}

function Resolve-MestreCommand {
    param($Data)

    if (-not $Data) { return @{ error = "Corpo invalido." } }

    # Modo novo: id + params
    $opId = [string]$Data.id
    if (-not [string]::IsNullOrWhiteSpace($opId)) {
        $op = $script:OperationsById[$opId]
        $tpl = $script:AllowedTemplates | Where-Object { $_.id -eq $opId } | Select-Object -First 1
        if (-not $op -and -not $tpl) { return @{ error = "Operacao '$opId' nao encontrada." } }

        if ($op) {
            return @{ cmd = [string]$op.command; destructive = [bool]$op.destructive; id = [string]$op.id }
        }

        if (-not ($tpl.pattern -is [string])) {
            return @{ error = "Operacao '$opId' nao e executavel." }
        }

        $finalCmd = [string]$tpl.pattern
        foreach ($prop in $tpl.params.PSObject.Properties) {
            $key = $prop.Name
            $regexSource = ([string]$prop.Value).TrimStart('^').TrimEnd('$')
            $val = if ($Data.params) { [string]$Data.params.$key } else { $null }
            if ([string]::IsNullOrEmpty($val) -or $val.Length -gt 1024 -or ($val -notmatch "^(?:$regexSource)$")) {
                return @{ error = "Parametro invalido para '$key'." }
            }
            $finalCmd = $finalCmd.Replace("{{$($key.ToUpper())}}", $val)
        }
        return @{ cmd = $finalCmd; destructive = [bool]$tpl.destructive; id = [string]$tpl.id }
    }

    # Modo legado: cmd exato ou template compilado
    $cmd = [string]$Data.cmd
    if (-not [string]::IsNullOrWhiteSpace($cmd)) {
        if ($cmd.Length -gt $MaxCmdLength) { return @{ error = "Comando excede o limite de tamanho." } }
        if ($script:ExactCommands.ContainsKey($cmd)) {
            $op = $script:ExactCommands[$cmd]
            return @{ cmd = $cmd; destructive = [bool]$op.destructive; id = [string]$op.id }
        }
        foreach ($compiled in $script:CompiledTemplates) {
            if ($compiled.Regex.IsMatch($cmd)) {
                return @{ cmd = $cmd; destructive = $compiled.Destructive; id = $compiled.Id }
            }
        }
        return @{ error = "Operacao bloqueada: somente comandos cadastrados na V10 podem ser executados." }
    }

    return @{ error = "Comando ausente ou invalido." }
}

# ---------------------------------------------------------------
# Deteccao heuristica de prompt injection (paridade com
# mcp-server/security.js checkPromptInjection)
# ---------------------------------------------------------------
$script:InjectionPatterns = @(
    @{ Regex = 'ignore\s+(all\s+)?previous\s+(instructions?|commands?|prompts?)'; Weight = 0.9 },
    @{ Regex = 'forget\s+(everything|all\s+previous|your\s+instructions)'; Weight = 0.85 },
    @{ Regex = '(you\s+are\s+now|from\s+now\s+on\s+you\s+are)'; Weight = 0.8 },
    @{ Regex = '(disregard|override|bypass|circumvent)\s+(rules?|restrictions?|safety|security)'; Weight = 0.85 },
    @{ Regex = 'system\s*[:\-]?\s*prompt|developer\s*mode|admin\s*mode|DAN\s*mode'; Weight = 0.75 },
    @{ Regex = '<<<\s*sys\s*>>>|<<<\s*system\s*>>>|\[\s*system\s*\]|\[\s*inst\s*\]|<<<\s*instruction\s*>>>'; Weight = 0.7 },
    @{ Regex = 'new\s+instructions?[:\-]'; Weight = 0.6 },
    @{ Regex = '(jailbreak|prompt\s*injection|roleplay\s*as)'; Weight = 0.65 },
    @{ Regex = '(sudo|admin|root)\s+access'; Weight = 0.5 }
)

function Test-PromptInjection {
    param([string] $Text)

    if ([string]::IsNullOrWhiteSpace($Text)) {
        return @{ classification = "benigno"; score = 0.0 }
    }
    $totalScore = 0.0
    foreach ($p in $script:InjectionPatterns) {
        $hits = [regex]::Matches($Text, $p.Regex, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
        if ($hits.Count -gt 0) {
            $totalScore += $p.Weight * [Math]::Min($hits.Count, 3)
        }
    }
    $score = [Math]::Min($totalScore, 1.0)
    $classification = "benigno"
    if ($score -ge 0.7) { $classification = "malicioso" }
    elseif ($score -ge 0.35) { $classification = "suspeito" }
    return @{ classification = $classification; score = $score }
}

function Set-ResponseSecurityHeaders {
    param(
        [System.Net.HttpListenerRequest] $Request,
        [System.Net.HttpListenerResponse] $Response
    )

    $Response.Headers["X-Content-Type-Options"] = "nosniff"
    $Response.Headers["Referrer-Policy"] = "no-referrer"
    $Response.Headers["Cache-Control"] = "no-store"

    $origin = [string]$Request.Headers["Origin"]
    if ($origin -eq $BASE_URL) {
        $Response.Headers["Access-Control-Allow-Origin"] = $BASE_URL
        $Response.Headers["Vary"] = "Origin"
        $Response.Headers["Access-Control-Allow-Methods"] = "POST, GET, OPTIONS"
        $Response.Headers["Access-Control-Allow-Headers"] = "Content-Type, X-Mestre-Client"
    }
}

function Test-PrivilegedClient {
    param([System.Net.HttpListenerRequest] $Request)

    $origin = [string]$Request.Headers["Origin"]
    $client = [string]$Request.Headers["X-Mestre-Client"]

    # v10-web tem permissão total quando vem de localhost
    if ($client -eq "v10-web") {
        # Aceita origin do próprio launcher ou origin ausente/localhost
        if ($origin -eq $BASE_URL -or [string]::IsNullOrWhiteSpace($origin)) {
            return $true
        }
        # Verifica se é origin local
        if ($origin -like "*127.0.0.1*" -or $origin -like "*localhost*") {
            return $true
        }
    }
    
    # MCP sem origin é permitido
    if ([string]::IsNullOrWhiteSpace($origin) -and $client -eq "mcp") { return $true }
    
    return $false
}

function Read-LimitedRequestBody {
    param(
        [System.Net.HttpListenerRequest] $Request,
        [int] $MaxChars = 131072
    )

    if ($Request.ContentLength64 -gt $MaxChars) {
        throw "Corpo da requisicao excede o limite permitido."
    }

    $reader = [System.IO.StreamReader]::new($Request.InputStream, [System.Text.Encoding]::UTF8)
    $builder = New-Object System.Text.StringBuilder
    $buffer = New-Object char[] 4096
    try {
        while (($read = $reader.Read($buffer, 0, $buffer.Length)) -gt 0) {
            if (($builder.Length + $read) -gt $MaxChars) {
                throw "Corpo da requisicao excede o limite permitido."
            }
            [void]$builder.Append($buffer, 0, $read)
        }
        return $builder.ToString()
    }
    finally {
        $reader.Close()
    }
}

function Write-JsonResponse {
    param(
        [System.Net.HttpListenerResponse] $Response,
        $Payload,
        [int] $StatusCode = 200
    )

    $json = if ($Payload -is [string]) { $Payload } else { $Payload | ConvertTo-Json -Compress -Depth 6 }
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $Response.StatusCode = $StatusCode
    $Response.ContentType = "application/json; charset=utf-8"
    $Response.ContentLength64 = $bytes.Length
    $Response.OutputStream.Write($bytes, 0, $bytes.Length)
    $Response.Close()
}

function Write-FileResponse {
    param(
        [System.Net.HttpListenerResponse] $Response,
        [string] $Path,
        [string] $ContentType
    )

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        Write-JsonResponse -Response $Response -Payload @{ success = $false; output = "Arquivo nao encontrado." } -StatusCode 404
        return
    }

    $bytes = [System.IO.File]::ReadAllBytes($Path)
    $Response.StatusCode = 200
    $Response.ContentType = $ContentType
    $Response.ContentLength64 = $bytes.Length
    $Response.OutputStream.Write($bytes, 0, $bytes.Length)
    $Response.Close()
}

function Cleanup-CommandJobs {
    $now = Get-Date
    foreach ($jobId in @($CommandJobs.Keys)) {
        $entry = $CommandJobs[$jobId]
        if (-not $entry) { continue }

        if ($entry.State -eq "running") {
            $job = $entry.Job
            if ($job.State -eq "Running") {
                $elapsed = (Get-Date) - $entry.StartedAt
                if ($elapsed.TotalSeconds -ge $JobTimeoutSeconds) {
                    Stop-Job -Id $job.Id -ErrorAction SilentlyContinue
                    Remove-Job -Id $job.Id -Force -ErrorAction SilentlyContinue
                    $entry.State = "timed_out"
                    $entry.Success = $false
                    $entry.ExitCode = -1
                    $entry.Output = "ERRO: Timeout apos $JobTimeoutSeconds segundos."
                    $entry.CompletedAt = Get-Date
                    $entry.Job = $null
                }
            } elseif ($job.State -in @("Completed", "Failed", "Stopped")) {
                try {
                    $result = Receive-Job -Id $job.Id -Keep -ErrorAction SilentlyContinue
                    $payload = @($result)[-1]
                    if ($payload -and $payload.PSObject.Properties["success"]) {
                        $entry.Success = [bool]$payload.success
                        $entry.ExitCode = [int]$payload.exitCode
                        $entry.Output = [string]$payload.output
                    } else {
                        $entry.Success = ($job.State -eq "Completed")
                        $entry.ExitCode = if ($entry.Success) { 0 } else { 1 }
                        $entry.Output = ($result | Out-String)
                    }
                } catch {
                    $entry.Success = $false
                    $entry.ExitCode = 1
                    $entry.Output = "ERRO: $($_.Exception.Message)"
                }
                $entry.State = if ($entry.Success) { "completed" } else { "failed" }
                $entry.CompletedAt = Get-Date
                Remove-Job -Id $job.Id -Force -ErrorAction SilentlyContinue
                $entry.Job = $null
            }
        }

        if ($entry.CompletedAt -and (($now - $entry.CompletedAt).TotalMinutes -ge $JobRetentionMinutes)) {
            $CommandJobs.Remove($jobId)
        }
    }
}

function Get-ActiveJobCount {
    Cleanup-CommandJobs
    return (@($CommandJobs.Values | Where-Object { $_.State -eq "running" })).Count
}

function New-CommandJob {
    param(
        [string] $CommandText,
        [string] $ProjectPath
    )

    $job = Start-Job -ArgumentList $CommandText, $ProjectPath -ScriptBlock {
        param(
            [string] $IncomingCommand,
            [string] $IncomingProjectPath
        )
        $ErrorActionPreference = "Continue"
        $env:MESTRE_PROJETO_PATH = $IncomingProjectPath
        try {
            $output = Invoke-Expression $IncomingCommand *>&1 | Out-String
            $success = $true
            $exitCode = 0
            if ($LASTEXITCODE -is [int] -and $LASTEXITCODE -ne 0) {
                $success = $false
                $exitCode = $LASTEXITCODE
            }
            [pscustomobject]@{ success = $success; output = $output; exitCode = $exitCode }
        } catch {
            [pscustomobject]@{ success = $false; output = "ERRO: $($_.Exception.Message)"; exitCode = 1 }
        }
    }

    return @{
        Id = [guid]::NewGuid().ToString("N")
        State = "running"
        StartedAt = Get-Date
        CompletedAt = $null
        Success = $null
        ExitCode = $null
        Output = ""
        Job = $job
    }
}

function Get-CommandJobPayload {
    param([hashtable] $Entry)

    Cleanup-CommandJobs
    return [ordered]@{
        success = if ($Entry.Success -eq $null) { $true } else { [bool]$Entry.Success }
        jobId = $Entry.Id
        state = $Entry.State
        output = $Entry.Output
        exitCode = $Entry.ExitCode
        activeJobs = Get-ActiveJobCount
    }
}

function Get-TerminalExecutable {
    $pwsh = Get-Command pwsh.exe -ErrorAction SilentlyContinue
    if ($pwsh) { return $pwsh.Source }
    return (Join-Path $env:WINDIR "System32\WindowsPowerShell\v1.0\powershell.exe")
}

Clear-Host
Write-Host ""
Write-Host "  =================================================="  -ForegroundColor Cyan
Write-Host "   MESTRE DO PC V7  --  Servidor Admin Ativo"         -ForegroundColor Green
Write-Host "  =================================================="  -ForegroundColor Cyan
Write-Host ""
Write-Host "  STATUS : ADMINISTRADOR + SERVIDOR ATIVO"            -ForegroundColor Green
Write-Host "  URL    : http://localhost:$PORT"                     -ForegroundColor Cyan
Write-Host ""
Write-Host "  >> Abra o HTML no navegador e clique em [Executar]" -ForegroundColor Yellow
Write-Host "  >> Os comandos serao executados automaticamente aqui"-ForegroundColor Yellow
Write-Host ""
Write-Host "  Pressione Ctrl+C para encerrar o servidor"          -ForegroundColor Gray
Write-Host "  =================================================="  -ForegroundColor Cyan
Write-Host ""

# Usa health real para decidir se o launcher ja esta bom ou se precisa reciclar a porta
try {
    $health = Invoke-RestMethod -Uri "$BASE_URL/ping" -TimeoutSec 2 -ErrorAction Stop
    if ($health.status -eq "ok") {
        Write-Host "  [OK] Launcher saudavel ja esta ativo. Nada a fazer." -ForegroundColor Green
        exit 0
    }
} catch {
}

$portaOcupada = Get-NetTCPConnection -LocalPort $PORT -State Listen -ErrorAction SilentlyContinue
if ($portaOcupada) {
    $ownerPid = @($portaOcupada | Select-Object -ExpandProperty OwningProcess -Unique)[0]
    $owner = if ($ownerPid) { Get-Process -Id $ownerPid -ErrorAction SilentlyContinue } else { $null }
    if ($owner -and $owner.ProcessName -notin @("powershell", "pwsh")) {
        throw "A porta $PORT esta ocupada por '$($owner.ProcessName)' (PID $ownerPid). O launcher nao vai encerrar um processo externo."
    }

    if ($ownerPid) {
        Stop-Process -Id $ownerPid -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 1
        Write-Host "  [INFO] Launcher antigo detectado na porta $PORT. Reiniciando..." -ForegroundColor Yellow
    }
}

# Carrega a whitelist antes de aceitar qualquer requisicao.
# Sem catalogo o launcher nao sobe: seria um servidor elevado sem restricao.
try {
    Initialize-OperationCatalog
    Write-Host "  [OK] Whitelist carregada: $($script:AllowedOperations.Count) operacoes, $($script:CompiledTemplates.Count) templates." -ForegroundColor Green
} catch {
    Write-Host "  [FATAL] Nao foi possivel carregar a whitelist de operacoes: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Cria listener HTTP
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($URL)

try {
    $listener.Start()
    Set-Content -Path $PID_FILE -Value $PID -Encoding ascii
    Write-Host "  [OK] Aguardando comandos do HTML..." -ForegroundColor Green
    Write-Host ""

    while ($listener.IsListening) {
        Cleanup-CommandJobs
        # Aguarda requisicao (bloqueante)
        $context = $listener.GetContext()
        $req = $context.Request
        $res = $context.Response

        try {
            Set-ResponseSecurityHeaders -Request $req -Response $res
            $res.ContentType = "application/json; charset=utf-8"

        # Preflight OPTIONS
        if ($req.HttpMethod -eq "OPTIONS") {
            if ([string]$req.Headers["Origin"] -ne $BASE_URL) {
                $res.StatusCode = 403
            } else {
                $res.StatusCode = 204
            }
            $res.Close()
            continue
        }

        # GET / — interface V10 servida na mesma origem do launcher.
        if ($req.HttpMethod -eq "GET" -and $req.Url.AbsolutePath -in @("/", "/index.html")) {
            $res.Headers["Content-Security-Policy"] = "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
            Write-FileResponse -Response $res -Path $V10_HTML -ContentType "text/html; charset=utf-8"
            continue
        }

        if ($req.HttpMethod -eq "GET" -and $req.Url.AbsolutePath -eq "/novidades-v11.html") {
            $novidadesPath = Join-Path $V10_HTML "..\novidades-v11.html"
            $novidadesPath = [System.IO.Path]::GetFullPath($novidadesPath)
            if (Test-Path $novidadesPath) {
                $res.Headers["Content-Security-Policy"] = "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
                Write-FileResponse -Response $res -Path $novidadesPath -ContentType "text/html; charset=utf-8"
            } else {
                $res.StatusCode = 404
                $res.Close()
            }
            continue
        }

        # GET /rede-dashboard.js — o painel de Diagnostico de Rede. Sem esta rota o
        # backend elevado servia o index.html mas nao o script, e o painel nunca
        # aparecia quando o app rodava como Administrador.
        if ($req.HttpMethod -eq "GET" -and $req.Url.AbsolutePath -eq "/rede-dashboard.js") {
            $redePath = [System.IO.Path]::GetFullPath((Join-Path $V10_HTML "..\rede-dashboard.js"))
            if (Test-Path $redePath) {
                $res.Headers["Cache-Control"] = "no-store"
                Write-FileResponse -Response $res -Path $redePath -ContentType "application/javascript; charset=utf-8"
            } else {
                $res.StatusCode = 404
                $res.Close()
            }
            continue
        }

        if ($req.HttpMethod -eq "GET" -and $req.Url.AbsolutePath -eq "/favicon.png") {
            $res.Headers["Cache-Control"] = "public, max-age=604800, immutable"
            Write-FileResponse -Response $res -Path (Join-Path $PROJECT_DIR "favicon.png") -ContentType "image/png"
            continue
        }

        if ($req.HttpMethod -eq "GET" -and $req.Url.AbsolutePath -eq "/logo-mestre-v7-transparent.png") {
            $res.Headers["Cache-Control"] = "public, max-age=604800, immutable"
            Write-FileResponse -Response $res -Path (Join-Path $PROJECT_DIR "logo-mestre-v7-transparent.png") -ContentType "image/png"
            continue
        }

        # GET /chat/* — recursos estaticos do modulo de chat (paridade com v10/launcher.js).
        if ($req.HttpMethod -eq "GET" -and $req.Url.AbsolutePath.StartsWith("/chat/")) {
            $relative = $req.Url.AbsolutePath.Substring(6)
            if ([string]::IsNullOrEmpty($relative) -or $relative -match '\.{2,}|[\\<>|:"*?]|^/') {
                $res.StatusCode = 403
                $res.Close()
                continue
            }
            $chatRoot = [System.IO.Path]::GetFullPath((Join-Path (Split-Path $V10_HTML -Parent) "chat"))
            $filePath = [System.IO.Path]::GetFullPath((Join-Path $chatRoot $relative))
            if (-not $filePath.StartsWith($chatRoot + [System.IO.Path]::DirectorySeparatorChar)) {
                $res.StatusCode = 403
                $res.Close()
                continue
            }
            $ext = [System.IO.Path]::GetExtension($filePath).ToLowerInvariant()
            $mimeTypes = @{
                ".html" = "text/html; charset=utf-8"
                ".css"  = "text/css; charset=utf-8"
                ".js"   = "text/javascript; charset=utf-8"
                ".json" = "application/json; charset=utf-8"
                ".md"   = "text/markdown; charset=utf-8"
                ".png"  = "image/png"
                ".jpg"  = "image/jpeg"
            }
            $contentType = $mimeTypes[$ext]
            if (-not $contentType) {
                $res.StatusCode = 403
                $res.Close()
                continue
            }
            $res.Headers["X-Content-Type-Options"] = "nosniff"
            $res.Headers["Referrer-Policy"] = "no-referrer"
            if ($ext -in @(".js", ".css", ".html")) {
                $res.Headers["Cache-Control"] = "no-store"
            } else {
                $res.Headers["Cache-Control"] = "public, max-age=604800, immutable"
            }
            if ($ext -eq ".html") {
                $res.Headers["Content-Security-Policy"] = "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
            }
            Write-FileResponse -Response $res -Path $filePath -ContentType $contentType
            continue
        }

        # GET /ping — checar se o servidor esta rodando
        if ($req.HttpMethod -eq "GET" -and $req.Url.AbsolutePath -eq "/ping") {
            $payload = [ordered]@{
                status = "ok"
                admin = $true
                state = if ((Get-ActiveJobCount) -gt 0) { "busy" } else { "idle" }
                activeJobs = Get-ActiveJobCount
                pid = $PID
            }
            Write-JsonResponse -Response $res -Payload $payload
            continue
        }

        # GET /mcp-status — checar se o Node.js MCP Server do MestreDoPC esta rodando via WMI
        if ($req.HttpMethod -eq "GET" -and $req.Url.AbsolutePath -eq "/mcp-status") {
            $mcpActive = Get-WmiObject Win32_Process -Filter "name='node.exe'" | Where-Object {
                $_.CommandLine -match "mcp-server\\index\.js" -or $_.CommandLine -match "mcp-server/index\.js"
            }
            $status = if ($mcpActive) { "online" } else { "offline" }
            $body = '{"status":"'+$status+'"}'
            $bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
            $res.ContentLength64 = $bytes.Length
            $res.OutputStream.Write($bytes, 0, $bytes.Length)
            $res.Close()
            continue
        }

        # GET /ollama-status — checar se o Ollama esta rodando e listar modelos
        if ($req.HttpMethod -eq "GET" -and $req.Url.AbsolutePath -eq "/ollama-status") {
            try {
                $ollamaRes = Invoke-WebRequest -Uri "http://localhost:11434/api/tags" -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
                $ollamaData = $ollamaRes.Content | ConvertFrom-Json
                $models = ($ollamaData.models | ForEach-Object { $_.name }) -join ","
                $body = "{`"status`":`"online`",`"models`":`"$models`"}"
            } catch {
                $body = '{"status":"offline","models":""}'
            }
            $bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
            $res.ContentLength64 = $bytes.Length
            $res.OutputStream.Write($bytes, 0, $bytes.Length)
            $res.Close()
            continue
        }

        # POST /shutdown — encerra o launcher pelo botao "Parar" da interface.
        # Mesma autorizacao do /run (Test-PrivilegedClient). Responde antes de sair
        # para o cliente receber a confirmacao; o $listener.Stop() encerra o loop.
        if ($req.HttpMethod -eq "POST" -and $req.Url.AbsolutePath -eq "/shutdown") {
            if (-not (Test-PrivilegedClient -Request $req)) {
                Write-JsonResponse -Response $res -Payload @{ success = $false; output = "Cliente nao autorizado." } -StatusCode 403
                continue
            }
            Write-JsonResponse -Response $res -Payload @{ success = $true; output = "Launcher encerrando."; pid = $PID }
            Write-Host "Encerrando launcher por solicitacao da interface."
            try { $listener.Stop() } catch {}
            break
        }

        # POST /open-terminal — abre um terminal no mesmo contexto elevado do launcher
        if ($req.HttpMethod -eq "POST" -and $req.Url.AbsolutePath -eq "/open-terminal") {
            if (-not (Test-PrivilegedClient -Request $req)) {
                Write-JsonResponse -Response $res -Payload @{ success = $false; output = "Cliente nao autorizado." } -StatusCode 403
                continue
            }
            try {
                $terminalExe = Get-TerminalExecutable
                $workingDir = Split-Path -Parent $scriptPath
                $escapedWorkingDir = $workingDir.Replace("'", "''")
                Start-Process $terminalExe -ArgumentList "-NoLogo -NoExit -Command Set-Location -LiteralPath '$escapedWorkingDir'"
                Write-JsonResponse -Response $res -Payload @{ success = $true; output = "Terminal admin aberto." }
            } catch {
                Write-JsonResponse -Response $res -Payload @{ success = $false; output = "Falha ao abrir terminal: $($_.Exception.Message)" } -StatusCode 500
            }
            continue
        }

        # GET /run-status — consulta o estado de um job assíncrono
        if ($req.HttpMethod -eq "GET" -and $req.Url.AbsolutePath -eq "/run-status") {
            $jobId = $req.QueryString["id"]
            if ([string]::IsNullOrWhiteSpace($jobId)) {
                Write-JsonResponse -Response $res -Payload @{ success = $false; output = "Parametro 'id' obrigatorio."; state = "invalid" } -StatusCode 400
                continue
            }
            if (-not $CommandJobs.ContainsKey($jobId)) {
                Write-JsonResponse -Response $res -Payload @{ success = $false; output = "Job nao encontrado."; state = "not_found" } -StatusCode 404
                continue
            }
            Write-JsonResponse -Response $res -Payload (Get-CommandJobPayload -Entry $CommandJobs[$jobId])
            continue
        }

        # POST /run — recebe e agenda a execucao do comando
        if ($req.HttpMethod -eq "POST" -and $req.Url.AbsolutePath -eq "/run") {
            if (-not (Test-PrivilegedClient -Request $req)) {
                Write-JsonResponse -Response $res -Payload @{ success = $false; output = "Cliente nao autorizado."; state = "forbidden" } -StatusCode 403
                continue
            }
            try {
                if ((Get-ActiveJobCount) -ge $MaxConcurrentJobs) {
                    Write-JsonResponse -Response $res -Payload @{ success = $false; output = "Limite de comandos simultaneos atingido."; state = "busy" } -StatusCode 429
                    continue
                }

                $rawBody = Read-LimitedRequestBody -Request $req
                $data = $rawBody | ConvertFrom-Json

                $resolved = Resolve-MestreCommand -Data $data
                if ($resolved.error) {
                    Write-Host "  [BLOQUEADO] $($resolved.error)" -ForegroundColor Red
                    Write-JsonResponse -Response $res -Payload @{ success = $false; output = $resolved.error; state = "forbidden" } -StatusCode 403
                    continue
                }
                $cmd = [string]$resolved.cmd

                Write-Host "  [CMD] " -NoNewline -ForegroundColor Yellow
                Write-Host $cmd.Split("`n")[0] -ForegroundColor White
                Write-Host ""

                $entry = New-CommandJob -CommandText $cmd -ProjectPath $PROJECT_DIR
                $CommandJobs[$entry.Id] = $entry
                Write-JsonResponse -Response $res -Payload ([ordered]@{
                    success = $true
                    accepted = $true
                    jobId = $entry.Id
                    state = $entry.State
                    activeJobs = Get-ActiveJobCount
                    output = "Comando aceito para execucao."
                })
            }
            catch {
                Write-JsonResponse -Response $res -Payload @{ success = $false; output = "Erro interno: $($_.Exception.Message)"; state = "error" } -StatusCode 500
            }
            continue
        }

        # GET /memories/list — lista memorias do chat (mais recentes primeiro)
        if ($req.HttpMethod -eq "GET" -and $req.Url.AbsolutePath -eq "/memories/list") {
            if (-not (Test-PrivilegedClient -Request $req)) {
                Write-JsonResponse -Response $res -Payload @{ success = $false; error = "Nao autorizado." } -StatusCode 403
                continue
            }
            $limitRaw = $req.QueryString["limit"]
            $limit = 100
            if ($limitRaw -and [int]::TryParse($limitRaw, [ref]$limit)) { } else { $limit = 100 }
            $memories = @(Get-MestreMemories | Sort-Object { $_.metadata.createdAt } -Descending)
            if ($memories.Count -gt $limit) { $memories = $memories[0..($limit - 1)] }
            Write-JsonResponse -Response $res -Payload @{ success = $true; memories = $memories }
            continue
        }

        # POST /memories/create — cria uma memoria
        if ($req.HttpMethod -eq "POST" -and $req.Url.AbsolutePath -eq "/memories/create") {
            if (-not (Test-PrivilegedClient -Request $req)) {
                Write-JsonResponse -Response $res -Payload @{ success = $false; error = "Nao autorizado." } -StatusCode 403
                continue
            }
            try {
                $rawBody = Read-LimitedRequestBody -Request $req
                $data = $rawBody | ConvertFrom-Json
                if ([string]::IsNullOrWhiteSpace([string]$data.content)) {
                    Write-JsonResponse -Response $res -Payload @{ success = $false; error = "Conteudo e obrigatorio." } -StatusCode 400
                    continue
                }
                $now = (Get-Date).ToString("o")
                $memory = [ordered]@{
                    id = New-MestreMemoryId
                    type = if ($data.type) { [string]$data.type } else { "note" }
                    title = if ($data.title) { [string]$data.title } else { "Sem titulo" }
                    content = [string]$data.content
                    metadata = [ordered]@{
                        createdAt = $now
                        updatedAt = $now
                        source = if ($data.metadata.source) { [string]$data.metadata.source } else { "chat" }
                        tags = @()
                        importance = 1
                    }
                }
                $memories = @(Get-MestreMemories) + [pscustomobject]$memory
                Save-MestreMemories -Memories $memories
                Write-JsonResponse -Response $res -Payload @{ success = $true; memory = $memory } -StatusCode 201
            } catch {
                Write-JsonResponse -Response $res -Payload @{ success = $false; error = "Erro interno: $($_.Exception.Message)" } -StatusCode 500
            }
            continue
        }

        # PUT /memories/update/:id — atualiza titulo/conteudo de uma memoria
        if ($req.HttpMethod -eq "PUT" -and $req.Url.AbsolutePath -like "/memories/update/*") {
            if (-not (Test-PrivilegedClient -Request $req)) {
                Write-JsonResponse -Response $res -Payload @{ success = $false; error = "Nao autorizado." } -StatusCode 403
                continue
            }
            try {
                $memId = $req.Url.AbsolutePath.Substring("/memories/update/".Length)
                $rawBody = Read-LimitedRequestBody -Request $req
                $data = $rawBody | ConvertFrom-Json
                $memories = @(Get-MestreMemories)
                $idx = -1
                for ($i = 0; $i -lt $memories.Count; $i++) { if ([string]$memories[$i].id -eq $memId) { $idx = $i; break } }
                if ($idx -lt 0) {
                    Write-JsonResponse -Response $res -Payload @{ success = $false; error = "Memoria nao encontrada." } -StatusCode 404
                    continue
                }
                $mem = $memories[$idx]
                if ($data.title) { $mem.title = [string]$data.title }
                if ($data.content) { $mem.content = [string]$data.content }
                $mem.metadata.updatedAt = (Get-Date).ToString("o")
                $memories[$idx] = $mem
                Save-MestreMemories -Memories $memories
                Write-JsonResponse -Response $res -Payload @{ success = $true; memory = $mem }
            } catch {
                Write-JsonResponse -Response $res -Payload @{ success = $false; error = "Erro interno: $($_.Exception.Message)" } -StatusCode 500
            }
            continue
        }

        # DELETE /memories/delete/:id — exclui uma memoria
        if ($req.HttpMethod -eq "DELETE" -and $req.Url.AbsolutePath -like "/memories/delete/*") {
            if (-not (Test-PrivilegedClient -Request $req)) {
                Write-JsonResponse -Response $res -Payload @{ success = $false; error = "Nao autorizado." } -StatusCode 403
                continue
            }
            try {
                $memId = $req.Url.AbsolutePath.Substring("/memories/delete/".Length)
                $memories = @(Get-MestreMemories | Where-Object { [string]$_.id -ne $memId })
                Save-MestreMemories -Memories $memories
                Write-JsonResponse -Response $res -Payload @{ success = $true; id = $memId }
            } catch {
                Write-JsonResponse -Response $res -Payload @{ success = $false; error = "Erro interno: $($_.Exception.Message)" } -StatusCode 500
            }
            continue
        }

        # POST /classify — resolve o comando contra a whitelist SEM executar.
        # A UI usa isto para decidir entre auto-exec (low-risk) e confirmacao.
        if ($req.HttpMethod -eq "POST" -and $req.Url.AbsolutePath -eq "/classify") {
            if (-not (Test-PrivilegedClient -Request $req)) {
                Write-JsonResponse -Response $res -Payload @{ allowed = $false; reason = "Cliente nao autorizado." } -StatusCode 403
                continue
            }
            try {
                $rawBody = Read-LimitedRequestBody -Request $req
                $data = $rawBody | ConvertFrom-Json
                $resolved = Resolve-MestreCommand -Data $data
                if ($resolved.error) {
                    Write-JsonResponse -Response $res -Payload ([ordered]@{
                        allowed = $false
                        destructive = $false
                        reason = $resolved.error
                    })
                    continue
                }

                $meta = $null
                if ($resolved.id) {
                    $meta = $script:OperationsById[[string]$resolved.id]
                    if (-not $meta) {
                        $meta = $script:AllowedTemplates | Where-Object { $_.id -eq $resolved.id } | Select-Object -First 1
                    }
                }
                Write-JsonResponse -Response $res -Payload ([ordered]@{
                    allowed = $true
                    destructive = [bool]$resolved.destructive
                    id = [string]$resolved.id
                    title = if ($meta) { [string]$meta.title } else { "" }
                    category = if ($meta) { [string]$meta.category } else { "" }
                    cmd = [string]$resolved.cmd
                })
            }
            catch {
                Write-JsonResponse -Response $res -Payload @{ allowed = $false; reason = "Erro interno: $($_.Exception.Message)" } -StatusCode 500
            }
            continue
        }

        # GET/POST /modo-livre — consulta ou alterna o Modo Livre (execucao fora da whitelist)
        if ($req.Url.AbsolutePath -eq "/modo-livre" -and $req.HttpMethod -eq "GET") {
            if (-not (Test-PrivilegedClient -Request $req)) {
                Write-JsonResponse -Response $res -Payload @{ enabled = $false; reason = "Cliente nao autorizado." } -StatusCode 403
                continue
            }
            Write-JsonResponse -Response $res -Payload @{ enabled = $script:ModoLivreEnabled }
            continue
        }
        if ($req.Url.AbsolutePath -eq "/modo-livre" -and $req.HttpMethod -eq "POST") {
            if (-not (Test-PrivilegedClient -Request $req)) {
                Write-JsonResponse -Response $res -Payload @{ success = $false; reason = "Cliente nao autorizado." } -StatusCode 403
                continue
            }
            try {
                $rawBody = Read-LimitedRequestBody -Request $req -MaxChars 1024
                $data = $rawBody | ConvertFrom-Json
                $enabled = Set-ModoLivre -Enabled ([bool]$data.enabled)
                Write-AuditLog -Level "SECURITY" -Action "modo_livre_toggle" -Details @{ enabled = $enabled }
                Write-JsonResponse -Response $res -Payload @{ success = $true; enabled = $enabled }
            } catch {
                Write-JsonResponse -Response $res -Payload @{ success = $false; reason = "Erro interno: $($_.Exception.Message)" } -StatusCode 500
            }
            continue
        }

        # POST /run-free — executa QUALQUER comando PowerShell, sem checar a whitelist
        # de allowed-operations.json. So responde se o Modo Livre estiver ligado.
        # Toda chamada e auditada em nivel SECURITY com o comando literal, ja que a
        # whitelist deixa de ser a rede de seguranca aqui.
        if ($req.HttpMethod -eq "POST" -and $req.Url.AbsolutePath -eq "/run-free") {
            if (-not (Test-PrivilegedClient -Request $req)) {
                Write-JsonResponse -Response $res -Payload @{ success = $false; output = "Cliente nao autorizado."; state = "forbidden" } -StatusCode 403
                continue
            }
            if (-not $script:ModoLivreEnabled) {
                Write-JsonResponse -Response $res -Payload @{ success = $false; output = "Modo Livre esta desligado. Ative em /modo-livre antes de executar comandos fora da whitelist."; state = "forbidden" } -StatusCode 403
                continue
            }
            try {
                if ((Get-ActiveJobCount) -ge $MaxConcurrentJobs) {
                    Write-JsonResponse -Response $res -Payload @{ success = $false; output = "Limite de comandos simultaneos atingido."; state = "busy" } -StatusCode 429
                    continue
                }
                $rawBody = Read-LimitedRequestBody -Request $req
                $data = $rawBody | ConvertFrom-Json
                $cmd = [string]$data.cmd
                if ([string]::IsNullOrWhiteSpace($cmd) -or $cmd.Length -gt $MaxCmdLength) {
                    Write-JsonResponse -Response $res -Payload @{ success = $false; output = "Comando ausente ou excede o limite de tamanho." } -StatusCode 400
                    continue
                }

                Write-Host "  [MODO-LIVRE] " -NoNewline -ForegroundColor Red
                Write-Host $cmd.Split("`n")[0] -ForegroundColor White
                Write-AuditLog -Level "SECURITY" -Action "run_free_command" -Details @{ cmd = $cmd }

                $entry = New-CommandJob -CommandText $cmd -ProjectPath $PROJECT_DIR
                $CommandJobs[$entry.Id] = $entry
                Write-JsonResponse -Response $res -Payload ([ordered]@{
                    success = $true
                    accepted = $true
                    jobId = $entry.Id
                    state = $entry.State
                    activeJobs = Get-ActiveJobCount
                    output = "Comando (Modo Livre) aceito para execucao."
                })
            }
            catch {
                Write-JsonResponse -Response $res -Payload @{ success = $false; output = "Erro interno: $($_.Exception.Message)"; state = "error" } -StatusCode 500
            }
            continue
        }

        # GET /ollama/tags — proxy para listar modelos do Ollama (evita CORS do browser)
        if ($req.HttpMethod -eq "GET" -and $req.Url.AbsolutePath -eq "/ollama/tags") {
            try {
                $ollamaRes = Invoke-WebRequest -Uri "http://localhost:11434/api/tags" -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
                $bytes = [System.Text.Encoding]::UTF8.GetBytes($ollamaRes.Content)
                $res.StatusCode = 200
                $res.ContentType = "application/json; charset=utf-8"
                $res.ContentLength64 = $bytes.Length
                $res.OutputStream.Write($bytes, 0, $bytes.Length)
                $res.Close()
            } catch {
                $body = '{"error":"Ollama offline","models":[]}'
                $bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
                $res.StatusCode = 502
                $res.ContentLength64 = $bytes.Length
                $res.OutputStream.Write($bytes, 0, $bytes.Length)
                $res.Close()
            }
            continue
        }

        # POST /ollama/chat — proxy com streaming NDJSON para o Ollama
        if ($req.HttpMethod -eq "POST" -and $req.Url.AbsolutePath -eq "/ollama/chat") {
            if (-not (Test-PrivilegedClient -Request $req)) {
                Write-JsonResponse -Response $res -Payload @{ success = $false; output = "Cliente nao autorizado." } -StatusCode 403
                continue
            }
            $streamingStarted = $false
            try {
                $rawBody = Read-LimitedRequestBody -Request $req -MaxChars 2097152

                # Bloqueia prompt injection antes de repassar ao Ollama.
                $chatBody = $rawBody | ConvertFrom-Json
                $lastUser = @($chatBody.messages | Where-Object { $_.role -eq "user" }) | Select-Object -Last 1
                if ($lastUser) {
                    $verdict = Test-PromptInjection -Text ([string]$lastUser.content)
                    if ($verdict.classification -eq "malicioso") {
                        Write-Host "  [BLOQUEADO] Prompt injection detectado (score $($verdict.score))." -ForegroundColor Red
                        Write-JsonResponse -Response $res -Payload ([ordered]@{
                            error = "Mensagem bloqueada: padrao de prompt injection detectado."
                            classification = $verdict.classification
                            score = $verdict.score
                        }) -StatusCode 400
                        continue
                    }
                }

                $client = New-Object System.Net.Http.HttpClient
                $client.Timeout = [System.Threading.Timeout]::InfiniteTimeSpan
                $content = New-Object System.Net.Http.StringContent($rawBody, [System.Text.Encoding]::UTF8, "application/json")
                $reqMsg = New-Object System.Net.Http.HttpRequestMessage([System.Net.Http.HttpMethod]::Post, "http://localhost:11434/api/chat")
                $reqMsg.Content = $content
                $ollamaResp = $client.SendAsync($reqMsg, [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead).Result
                $res.StatusCode = [int]$ollamaResp.StatusCode
                $res.ContentType = "application/x-ndstream"
                $inStream = $ollamaResp.Content.ReadAsstreamAsync().Result
                $outStream = $res.OutputStream
                $streamingStarted = $true
                $buffer = New-Object byte[] 4096
                while ($true) {
                    $read = $inStream.Read($buffer, 0, $buffer.Length)
                    if ($read -le 0) { break }
                    $outStream.Write($buffer, 0, $read)
                    $outStream.Flush()
                }
            } catch {
                if (-not $streamingStarted) {
                    try {
                        $body = '{"error":"' + ($_.Exception.Message -replace '["\\]','\$&') + '"}'
                        $bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
                        $res.StatusCode = 502
                        $res.ContentLength64 = $bytes.Length
                        $res.OutputStream.Write($bytes, 0, $bytes.Length)
                    } catch {}
                }
            } finally {
                try { $res.Close() } catch {}
                try { if ($ollamaResp) { $ollamaResp.Dispose() } } catch {}
                try { if ($client) { $client.Dispose() } } catch {}
            }
            continue
        }

        # GET /status — métricas do sistema (CPU, RAM, disco, uptime) para dashboard V10
        if ($req.HttpMethod -eq "GET" -and $req.Url.AbsolutePath -eq "/status") {
            try {
                $os = Get-WmiObject Win32_OperatingSystem
                $ramFreeGB = [math]::Round($os.FreePhysicalMemory/1MB, 2)
                $ramTotalGB = [math]::Round($os.TotalVisibleMemorySize/1MB, 2)
                $cpuLoad = (Get-WmiObject Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
                $disk = Get-PSDrive C
                $diskFreeGB = [math]::Round($disk.Free/1GB, 2)
                $diskUsedGB = [math]::Round($disk.Used/1GB, 2)
                $boot = [Management.ManagementDateTimeConverter]::ToDateTime($os.LastBootUpTime)
                $uptimeSec = [int]((Get-Date) - $boot).TotalSeconds
                $payload = [ordered]@{
                    cpu = [math]::Round($cpuLoad, 1)
                    ramFree = $ramFreeGB
                    ramTotal = $ramTotalGB
                    diskFree = $diskFreeGB
                    diskUsed = $diskUsedGB
                    uptimeSec = $uptimeSec
                }
                Write-JsonResponse -Response $res -Payload $payload
            } catch {
                Write-JsonResponse -Response $res -Payload @{ error = $_.Exception.Message } -StatusCode 500
            }
            continue
        }

        # Rota nao encontrada
        $res.StatusCode = 404
        $notFound = '{"success":false,"output":"Rota nao encontrada."}'
        $nb = [System.Text.Encoding]::UTF8.GetBytes($notFound)
        $res.ContentLength64 = $nb.Length
        $res.OutputStream.Write($nb, 0, $nb.Length)
        $res.Close()
        }
        catch {
            # Uma aba fechada/recarregada pode encerrar o socket enquanto a
            # resposta esta sendo escrita. A falha pertence somente a esta
            # requisicao e nao deve derrubar o launcher inteiro.
            Write-Host "  [WARN] Falha ao processar $($req.HttpMethod) $($req.Url.AbsolutePath): $($_.Exception.Message)" -ForegroundColor Yellow
            try {
                if ($res.OutputStream.CanWrite) {
                    Write-JsonResponse -Response $res -Payload @{
                        success = $false
                        output = "Falha ao processar a requisicao."
                    } -StatusCode 500
                }
                else {
                    $res.Close()
                }
            }
            catch {
                try { $res.Close() } catch {}
            }
        }
    }
}
catch [System.Net.HttpListenerException] {
    if ($_.Exception.ErrorCode -ne 995) {
        Write-Host "  [ERRO] $($_.Exception.Message)" -ForegroundColor Red
    }
}
catch {
    # Falhas fora do ciclo de requisicoes sao fatais para o listener.
    Write-Host "  [ERRO INESPERADO] $($_.Exception.Message)" -ForegroundColor Red
}
finally {
    if ($listener -and $listener.IsListening) { $listener.Stop() }
    foreach ($jobId in @($CommandJobs.Keys)) {
        $entry = $CommandJobs[$jobId]
        if ($entry -and $entry.Job) {
            Stop-Job -Id $entry.Job.Id -ErrorAction SilentlyContinue
            Remove-Job -Id $entry.Job.Id -Force -ErrorAction SilentlyContinue
        }
    }
    if (Test-Path $PID_FILE) {
        Remove-Item -LiteralPath $PID_FILE -Force -ErrorAction SilentlyContinue
    }
    Write-Host ""
    Write-Host "  Servidor encerrado. Ate logo!" -ForegroundColor Cyan
}
