# ================================================================
# Mestre do PC V10 - Conceder permissoes do Chrome para o app
# ================================================================
# Concede as permissoes que o app usa (clipboard, downloads
# automaticos, notificacoes e pop-ups) para http://127.0.0.1:7777,
# gravando direto no arquivo Preferences do Chrome.
#
# IMPORTANTE: rode com o Chrome FECHADO. O Chrome sobrescreve o
# arquivo Preferences ao sair, apagando as alteracoes.
#
# Uso:
#   pwsh -NoProfile -ExecutionPolicy Bypass -File .\grant-chrome-permissions.ps1
# ================================================================

param(
    [string]$SiteUrl = "http://127.0.0.1:7777",
    [string]$ChromeUserData = "$env:LOCALAPPDATA\Google\Chrome\User Data"
)

$ErrorActionPreference = "Stop"

# Permissoes que o app realmente usa (setting 1 = permitir).
# Camera, microfone e localizacao NAO sao usados pelo Mestre do PC,
# por isso nao sao concedidos.
$Permissions = [ordered]@{
    "clipboard"            = "Area de transferencia (copiar texto)"
    "automatic_downloads" = "Downloads automaticos (exportar historico)"
    "notifications"        = "Notificacoes (alertas de jobs)"
    "popups"               = "Pop-ups e redirecionamentos"
}

function Test-ChromeRunning {
    return [bool](Get-Process -Name "chrome" -ErrorAction SilentlyContinue)
}

function Grant-SitePermissions {
    param([string]$PrefsPath)

    if (-not (Test-Path $PrefsPath)) {
        Write-Warning "  Preferences nao encontrado: $PrefsPath"
        return
    }

    $raw = Get-Content -Path $PrefsPath -Raw
    if ([string]::IsNullOrWhiteSpace($raw)) {
        Write-Warning "  Preferences vazio: $PrefsPath"
        return
    }

    $prefs = $raw | ConvertFrom-Json -AsHashtable

    # Garante a estrutura profile.content_settings.exceptions
    if (-not $prefs.ContainsKey("profile")) { $prefs["profile"] = @{} }
    if (-not $prefs["profile"].ContainsKey("content_settings")) { $prefs["profile"]["content_settings"] = @{} }
    if (-not $prefs["profile"]["content_settings"].ContainsKey("exceptions")) { $prefs["profile"]["content_settings"]["exceptions"] = @{} }

    $exceptions = $prefs["profile"]["content_settings"]["exceptions"]
    $siteKey = "$SiteUrl,*"
    # WebKit timestamp (microssegundos desde 1601-01-01 UTC)
    $now = [string][long]([DateTime]::UtcNow.ToFileTime() / 10)

    foreach ($key in $Permissions.Keys) {
        if (-not $exceptions.ContainsKey($key)) { $exceptions[$key] = @{} }
        $exceptions[$key][$siteKey] = @{
            "last_modified" = $now
            "setting"       = 1
        }
        Write-Host "  [OK] $($Permissions[$key]) -> Permitir"
    }

    $json = $prefs | ConvertTo-Json -Depth 100 -Compress
    Set-Content -Path $PrefsPath -Value $json -Encoding UTF8 -NoNewline
}

# ================================================================
# Main
# ================================================================
Write-Host "Mestre do PC V10 - Concedendo permissoes do Chrome para $SiteUrl"
Write-Host ""

if (Test-ChromeRunning) {
    Write-Warning "O Chrome esta aberto. Feche o Chrome e rode o script novamente,"
    Write-Warning "pois ele sobrescreve o arquivo Preferences ao sair."
    exit 1
}

if (-not (Test-Path $ChromeUserData)) {
    Write-Warning "Pasta do Chrome nao encontrada: $ChromeUserData"
    exit 1
}

# Processa todos os perfis (Default, Profile 1, Profile 2, ...)
$profiles = Get-ChildItem -Path $ChromeUserData -Directory | Where-Object {
    $_.Name -eq "Default" -or $_.Name -like "Profile *"
}

if (-not $profiles) {
    Write-Warning "Nenhum perfil do Chrome encontrado em $ChromeUserData"
    exit 1
}

foreach ($profile in $profiles) {
    Write-Host "Perfil: $($profile.Name)"
    Grant-SitePermissions -PrefsPath (Join-Path $profile.FullName "Preferences")
}

Write-Host ""
Write-Host "Permissoes concedidas! Abra o Chrome e confira em:"
Write-Host "  chrome://settings/content/siteDetails?site=$([uri]::EscapeDataString($SiteUrl))"
