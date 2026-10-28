#Requires -Version 7
<#
.SYNOPSIS
  Sobe Microsoft Edge com Chrome DevTools Protocol (CDP) só em loopback.

.DESCRIPTION
  Porta padrão 9222. Perfil isolado em %TEMP%\edge-cdp-profile para não
  misturar com o Edge do dia a dia. Analogia: abre a "porta dos fundos"
  da oficina para o agente entrar com crachá.

.EXAMPLE
  pwsh -File .\scripts\start-edge-cdp.ps1
  pwsh -File .\scripts\start-edge-cdp.ps1 -Port 9222 -Url https://learn.microsoft.com
#>
param(
  [int] $Port = 9222,
  [string] $Url = 'https://learn.microsoft.com/pt-br/microsoft-edge/devtools/landing/',
  [switch] $ProbeOnly
)

$ErrorActionPreference = 'Stop'
$endpoint = "http://127.0.0.1:$Port"

function Test-Cdp {
  try {
    $r = Invoke-RestMethod -Uri "$endpoint/json/version" -TimeoutSec 2
    return $r
  } catch {
    return $null
  }
}

$existing = Test-Cdp
if ($existing) {
  Write-Host "CDP ja ativo em $endpoint"
  $existing | ConvertTo-Json -Compress
  if ($ProbeOnly) { exit 0 }
  exit 0
}

if ($ProbeOnly) {
  Write-Error "CDP nao responde em $endpoint"
}

$candidates = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge Beta\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge Beta\Application\msedge.exe"
)
$edge = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edge) {
  Write-Error "msedge.exe nao encontrado."
}

$profile = Join-Path $env:TEMP 'edge-cdp-profile'
New-Item -ItemType Directory -Force -Path $profile | Out-Null

Write-Host "Iniciando Edge CDP..."
Write-Host "  exe: $edge"
Write-Host "  port: $Port (loopback)"
Write-Host "  profile: $profile"

Start-Process -FilePath $edge -ArgumentList @(
  "--remote-debugging-port=$Port",
  "--user-data-dir=$profile",
  "--no-first-run",
  "--no-default-browser-check",
  $Url
)

$ok = $false
for ($i = 0; $i -lt 20; $i++) {
  Start-Sleep -Milliseconds 500
  $v = Test-Cdp
  if ($v) {
    Write-Host "OK CDP: $($v.Browser) · WebKit $($v.'WebKit-Version')"
    Write-Host "Endpoint: $endpoint"
    Write-Host "Defina CHROME_DEVTOOLS_CDP_URL=$endpoint ou use REA list_browser_targets."
    $ok = $true
    break
  }
}

if (-not $ok) {
  Write-Error "Edge iniciou mas CDP nao respondeu a tempo em $endpoint"
}
