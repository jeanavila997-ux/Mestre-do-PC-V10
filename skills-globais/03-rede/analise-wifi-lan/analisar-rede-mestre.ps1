<#
.SYNOPSIS
  Análise Wi-Fi + LAN + speed + usuários (Mestre do PC / Nitro).
.DESCRIPTION
  Coleta interface Wi-Fi, redes próximas, ARP, latência, speed Cloudflare,
  IP público e usuários locais. Grava dados-coletados.live.json nesta pasta
  e imprime um resumo no console.
.NOTES
  Use sempre 127.0.0.1 (não localhost) para o launcher Mestre.
  Não exige admin para a maior parte dos comandos.
#>
[CmdletBinding()]
param(
  [string]$OutJson = '',
  [int]$CfBytes = 25000000,
  [switch]$SkipSpeed
)

$ErrorActionPreference = 'Continue'
$Root = $PSScriptRoot
if (-not $OutJson) {
  $OutJson = Join-Path $Root 'dados-coletados.live.json'
}

function Write-Section([string]$Title) {
  Write-Host ""
  Write-Host ("=== {0} ===" -f $Title) -ForegroundColor Cyan
}

function Get-WifiInterface {
  $raw = netsh wlan show interfaces 2>$null | Out-String
  $map = @{}
  foreach ($line in ($raw -split "`r?`n")) {
    if ($line -match '^\s*([^:]+)\s*:\s*(.+)\s*$') {
      $map[$Matches[1].Trim()] = $Matches[2].Trim()
    }
  }
  [pscustomobject]@{
    Raw      = $raw
    SSID     = $map['SSID']
    BSSID    = $map['AP BSSID']
    Banda    = $map['Banda']
    Canal    = $map['Canal']
    Sinal    = $map['Sinal']
    RSSI     = $map['Rssi']
    RxMbps   = $map['Taxa de recepção (Mbps)']
    TxMbps   = $map['Taxa de transmissão (Mbps)']
    Perfil   = $map['Perfil']
    Estado   = $map['Estado']
    Radio    = $map['Tipo de rádio']
    Auth     = $map['Autenticação']
  }
}

function Measure-CloudflareDownload([int]$Bytes) {
  $url = "https://speed.cloudflare.com/__down?bytes=$Bytes"
  $tmp = Join-Path $env:TEMP ("mestre-speed-{0}.bin" -f [guid]::NewGuid().ToString('n'))
  $sw = [Diagnostics.Stopwatch]::StartNew()
  try {
    Invoke-WebRequest -Uri $url -OutFile $tmp -TimeoutSec 90 -Headers @{
      'Cache-Control' = 'no-cache'
      'User-Agent'    = 'MestreRede/1.0'
    } | Out-Null
    $sw.Stop()
    $size = (Get-Item $tmp).Length
    $mbps = [math]::Round(($size * 8.0) / $sw.Elapsed.TotalSeconds / 1000000.0, 1)
    $mBps = [math]::Round($size / $sw.Elapsed.TotalSeconds / 1MB, 2)
    return [pscustomobject]@{
      Ok = $true; Bytes = $size; Seconds = [math]::Round($sw.Elapsed.TotalSeconds, 2)
      Mbps = $mbps; MBps = $mBps; Url = $url
    }
  } catch {
    $sw.Stop()
    return [pscustomobject]@{
      Ok = $false; Error = $_.Exception.Message; Seconds = [math]::Round($sw.Elapsed.TotalSeconds, 2)
    }
  } finally {
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
  }
}

function Measure-CloudflareUpload([int]$SizeBytes = 1048576) {
  $payload = New-Object byte[] $SizeBytes
  (New-Object Random).NextBytes($payload)
  $sw = [Diagnostics.Stopwatch]::StartNew()
  try {
    $resp = Invoke-WebRequest -Uri 'https://speed.cloudflare.com/__up' -Method Post -Body $payload `
      -TimeoutSec 60 -ContentType 'application/octet-stream'
    $sw.Stop()
    $mbps = [math]::Round(($SizeBytes * 8.0) / $sw.Elapsed.TotalSeconds / 1000000.0, 1)
    return [pscustomobject]@{
      Ok = $true; Mbps = $mbps; Seconds = [math]::Round($sw.Elapsed.TotalSeconds, 2)
      Status = [int]$resp.StatusCode
    }
  } catch {
    $sw.Stop()
    return [pscustomobject]@{ Ok = $false; Error = $_.Exception.Message }
  }
}

function Get-AvgLatency([string]$HostName, [int]$Count = 4) {
  $r = Test-Connection -TargetName $HostName -Count $Count -ErrorAction SilentlyContinue
  if (-not $r) { return $null }
  $times = @(
    $r | ForEach-Object {
      if ($null -ne $_.Latency) { $_.Latency }
      elseif ($null -ne $_.ResponseTime) { $_.ResponseTime }
    }
  )
  if (-not $times.Count) { return $null }
  [math]::Round(($times | Measure-Object -Average).Average, 1)
}

# --- Coleta ---
Write-Section 'WIFI'
$wifi = Get-WifiInterface
$wifi | Format-List SSID, Banda, Canal, Sinal, RSSI, RxMbps, TxMbps, Perfil, BSSID | Out-Host

Write-Section 'IP / DNS'
$ipCfg = Get-NetIPConfiguration -InterfaceAlias 'Wi-Fi' -ErrorAction SilentlyContinue
$dns = (Get-DnsClientServerAddress -InterfaceAlias 'Wi-Fi' -AddressFamily IPv4 -ErrorAction SilentlyContinue).ServerAddresses
$ipv4 = @($ipCfg.IPv4Address | ForEach-Object { $_.IPAddress })
$gw = @($ipCfg.IPv4DefaultGateway | ForEach-Object { $_.NextHop })
"IPv4: $($ipv4 -join ', ')  Gateway: $($gw -join ', ')  DNS: $($dns -join ', ')"

Write-Section 'LATENCIA'
$lat = @(
  @{ host = '192.168.1.1'; avgMs = (Get-AvgLatency '192.168.1.1') },
  @{ host = '1.1.1.1'; avgMs = (Get-AvgLatency '1.1.1.1') },
  @{ host = '8.8.8.8'; avgMs = (Get-AvgLatency '8.8.8.8') }
)
$lat | ForEach-Object { "  $($_.host) -> $($_.avgMs) ms" }

Write-Section 'ARP (LAN)'
$arp = (arp -a | Out-String)

Write-Section 'PERFIS WIFI'
$profiles = (netsh wlan show profiles | Out-String)

Write-Section 'REDES PROXIMAS (amostra)'
$nearby = (netsh wlan show networks mode=bssid | Out-String)

Write-Section 'USUARIOS'
$cs = Get-CimInstance Win32_ComputerSystem
$localUsers = @(Get-LocalUser | Select-Object Name, Enabled, LastLogon)
"Sessão: $($cs.UserName)  Host: $($cs.Name)  Domain: $($cs.Domain)"

$speed = $null
if (-not $SkipSpeed) {
  Write-Section "SPEED Cloudflare ($CfBytes bytes)"
  $dl = Measure-CloudflareDownload -Bytes $CfBytes
  if ($dl.Ok) { "Download: $($dl.Mbps) Mbps ($($dl.MBps) MB/s) em $($dl.Seconds)s" }
  else { "Download FALHOU: $($dl.Error)" }
  $ul = Measure-CloudflareUpload -SizeBytes 1048576
  if ($ul.Ok) { "Upload: $($ul.Mbps) Mbps em $($ul.Seconds)s" }
  else { "Upload FALHOU: $($ul.Error)" }
  $speed = @{ download = $dl; upload = $ul }
}

Write-Section 'ISP'
$isp = $null
try { $isp = Invoke-RestMethod 'https://ipinfo.io/json' -TimeoutSec 12 } catch { "ipinfo: $($_.Exception.Message)" }
if ($isp) { $isp | Select-Object ip, city, region, country, org, timezone | Format-List | Out-Host }

$mestre = $null
try { $mestre = Invoke-RestMethod 'http://127.0.0.1:7777/ping' -TimeoutSec 3 } catch { }

$payload = [ordered]@{
  meta = @{
    geradoEm = (Get-Date).ToString('s')
    host     = $env:COMPUTERNAME
    script   = $PSCommandPath
  }
  wifi      = $wifi
  ipv4      = $ipv4
  gateway   = $gw
  dns       = @($dns)
  latencia  = $lat
  speed     = $speed
  isp       = $isp
  usuarios  = @{
    sessao = $cs.UserName
    host   = $cs.Name
    domain = $cs.Domain
    locais = $localUsers
  }
  mestrePing = $mestre
  arpRaw     = $arp
  profilesRaw = $profiles
  nearbyRaw  = $nearby
}

$payload | ConvertTo-Json -Depth 8 | Set-Content -Path $OutJson -Encoding UTF8
Write-Section 'SAIDA'
Write-Host "JSON: $OutJson" -ForegroundColor Green
Write-Host "Dashboard: $(Join-Path $Root 'dashboard-rede.html')" -ForegroundColor Green
Write-Host "Vite app:  $(Join-Path $Root 'web')  →  npm install && npm run dev" -ForegroundColor Green
