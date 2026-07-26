# ================================================================
# Mestre do PC V8 - Desinstalador
# ================================================================
# Remove tarefa agendada, entrada MCP do Claude Desktop, atalhos e
# arquivos de runtime (PID). NAO apaga o diretorio de instalacao.
# ================================================================

param(
    [string] $InstallDir = $PSScriptRoot,
    [switch] $KeepMcpConfig,
    [switch] $Quiet
)

$ErrorActionPreference = "Continue"

function Write-Step { param([string] $m) if (-not $Quiet) { Write-Host "[UNINSTALL] $m" -ForegroundColor Cyan } }
function Write-Ok   { param([string] $m) if (-not $Quiet) { Write-Host "[ OK ] $m" -ForegroundColor Green } }
function Write-Warn2{ param([string] $m) if (-not $Quiet) { Write-Host "[WARN] $m" -ForegroundColor Yellow } }

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Warn2 "Reiniciando como Administrador..."
    $psExe = Join-Path $env:WINDIR "System32\WindowsPowerShell\v1.0\powershell.exe"
    Start-Process $psExe -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    exit
}

# 1. Para o launcher em execucao
Write-Step "Encerrando launcher em execucao..."
$pidFile = Join-Path $InstallDir "MestreDoPC-Launcher.pid"
if (Test-Path $pidFile) {
    try {
        $procId = [int](Get-Content $pidFile -Raw).Trim()
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    } catch { }
    Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
}
Write-Ok "Launcher encerrado."

# 2. Tarefas agendadas
Write-Step "Removendo tarefas agendadas..."
foreach ($tn in @("MestreDoPC_Admin_Launcher", "MestreDoPC_Startup")) {
    try {
        Unregister-ScheduledTask -TaskName $tn -Confirm:$false -ErrorAction Stop
        Write-Ok "Tarefa '$tn' removida."
    } catch {
        Write-Warn2 "Tarefa '$tn' nao encontrada (ou ja removida)."
    }
}

# 3. Entrada MCP no Claude Desktop
if (-not $KeepMcpConfig) {
    # Remove do Claude Code CLI se existir
    $claudeCli = Get-Command claude -ErrorAction SilentlyContinue
    if ($claudeCli) {
        try {
            & claude mcp remove mestre_do_pc --scope user 2>$null | Out-Null
            Write-Ok "MCP removido do Claude Code."
        } catch { }
    }

    Write-Step "Removendo MCP do Claude Desktop..."
    $claudeCfgFile = Join-Path $env:APPDATA "Claude\claude_desktop_config.json"
    if (Test-Path $claudeCfgFile) {
        try {
            function ConvertTo-HashtableDeep {
                param($obj)
                if ($null -eq $obj) { return $null }
                if ($obj -is [System.Collections.IDictionary]) { return $obj }
                if ($obj -is [System.Management.Automation.PSCustomObject]) {
                    $h = [ordered]@{}
                    foreach ($p in $obj.PSObject.Properties) { $h[$p.Name] = ConvertTo-HashtableDeep $p.Value }
                    return $h
                }
                if ($obj -is [System.Collections.IEnumerable] -and -not ($obj -is [string])) {
                    return @($obj | ForEach-Object { ConvertTo-HashtableDeep $_ })
                }
                return $obj
            }

            $raw = Get-Content $claudeCfgFile -Raw
            $parsed = $raw | ConvertFrom-Json
            $cfg = ConvertTo-HashtableDeep $parsed

            if ($cfg -is [System.Collections.IDictionary] -and
                $cfg.Contains("mcpServers") -and
                $cfg["mcpServers"] -is [System.Collections.IDictionary] -and
                $cfg["mcpServers"].Contains("mestre_do_pc")) {
                $cfg["mcpServers"].Remove("mestre_do_pc") | Out-Null
                ($cfg | ConvertTo-Json -Depth 10) | Set-Content -Path $claudeCfgFile -Encoding UTF8
                Write-Ok "Entrada 'mestre_do_pc' removida."
            } else {
                Write-Warn2 "Entrada 'mestre_do_pc' nao encontrada no config."
            }
        } catch {
            Write-Warn2 "Nao foi possivel editar $claudeCfgFile : $($_.Exception.Message)"
        }
    }
}

# 4. Atalhos
Write-Step "Removendo atalhos..."
$shortcuts = @(
    (Join-Path ([Environment]::GetFolderPath("Desktop"))  "Mestre do PC.lnk"),
    (Join-Path ([Environment]::GetFolderPath("Programs")) "Mestre do PC.lnk")
)
foreach ($lnk in $shortcuts) {
    if (Test-Path $lnk) { Remove-Item $lnk -Force -ErrorAction SilentlyContinue }
}
Write-Ok "Atalhos removidos."

Write-Host ""
Write-Host "==================================================" -ForegroundColor Green
Write-Host " DESINSTALACAO CONCLUIDA" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
Write-Host " Diretorio '$InstallDir' foi mantido."             -ForegroundColor Gray
Write-Host " Apague manualmente se nao for usar mais."          -ForegroundColor Gray
Write-Host ""
