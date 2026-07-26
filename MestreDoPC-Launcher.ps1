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

    if ($origin -eq $BASE_URL -and $client -eq "v10-web") { return $true }
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

        if ($req.HttpMethod -eq "GET" -and $req.Url.AbsolutePath -eq "/favicon.png") {
            Write-FileResponse -Response $res -Path (Join-Path $PROJECT_DIR "favicon.png") -ContentType "image/png"
            continue
        }

        if ($req.HttpMethod -eq "GET" -and $req.Url.AbsolutePath -eq "/logo-mestre-v7-transparent.png") {
            Write-FileResponse -Response $res -Path (Join-Path $PROJECT_DIR "logo-mestre-v7-transparent.png") -ContentType "image/png"
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
                $cmd = [string]$data.cmd

                if ([string]::IsNullOrWhiteSpace($cmd)) {
                    Write-JsonResponse -Response $res -Payload @{ success = $false; output = "Comando vazio recebido."; state = "invalid" } -StatusCode 400
                    continue
                }

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
