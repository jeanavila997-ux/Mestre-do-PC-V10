# Publica v10/mobile/ no repositório jeanavila997-ux/mestre-do-pc-mobile.
# Sem -Push, apenas lista a origem. O token fica em $env:MOBILE_REPO_TOKEN.
param(
  [switch]$Push,
  [string]$RepoUrl = $(if ($env:MOBILE_REPO_URL) { $env:MOBILE_REPO_URL } else { "https://github.com/jeanavila997-ux/mestre-do-pc-mobile.git" }),
  [string]$Branch = $(if ($env:MOBILE_REPO_BRANCH) { $env:MOBILE_REPO_BRANCH } else { "main" })
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$src = Join-Path $root "v10\mobile"
if (-not (Test-Path $src)) {
  throw "Pasta não encontrada: $src"
}

Write-Host "Origem: $src"
Get-ChildItem -Path $src -Recurse -File | ForEach-Object {
  $_.FullName.Substring($src.Length).TrimStart('\', '/')
}

if (-not $Push) {
  Write-Host "Nada foi publicado. Rode com -Push para enviar a $RepoUrl (branch $Branch)."
  exit 0
}

if (-not $env:MOBILE_REPO_TOKEN) {
  Write-Warning "MOBILE_REPO_TOKEN não está configurado. A publicação em $RepoUrl foi ignorada."
  exit 0
}

$work = Join-Path ([System.IO.Path]::GetTempPath()) ("mestre-mobile-" + [guid]::NewGuid().ToString("n"))
$askpass = Join-Path ([System.IO.Path]::GetTempPath()) ("mestre-askpass-" + [guid]::NewGuid().ToString("n") + ".cmd")
New-Item -ItemType Directory -Path $work | Out-Null
@"
@echo off
echo %~1 | findstr /I "Username" >nul
if %errorlevel%==0 (
  echo x-access-token
) else (
  echo %MOBILE_REPO_TOKEN%
)
"@ | Set-Content -Path $askpass -Encoding ASCII

$env:GIT_ASKPASS = $askpass
$env:GIT_TERMINAL_PROMPT = "0"
$repo = Join-Path $work "repo"

try {
  $cloneLog = Join-Path $work "clone.err"
  & git clone --depth 1 --branch $Branch $RepoUrl $repo 2> $cloneLog
  if ($LASTEXITCODE -ne 0) {
    $log = Get-Content -Raw $cloneLog -ErrorAction SilentlyContinue
    if ($log -match "authentication|403|not found|could not read Username") {
      throw "Falha ao autenticar ou localizar $RepoUrl."
    }
    New-Item -ItemType Directory -Path $repo | Out-Null
    & git -C $repo init -b $Branch
    if ($LASTEXITCODE -ne 0) { throw "git init falhou" }
    & git -C $repo remote add origin $RepoUrl
  }

  & robocopy $src $repo /MIR /XD .git .github /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "robocopy falhou com código $LASTEXITCODE" }

  & git -C $repo add -A
  & git -C $repo diff --cached --quiet
  if ($LASTEXITCODE -eq 0) {
    Write-Host "O repositório mobile já está igual a v10/mobile/."
    exit 0
  }

  & git -C $repo -c user.name="github-actions[bot]" -c user.email="41898282+github-actions[bot]@users.noreply.github.com" commit -m "Sync Mestre Mobile V11 a partir de Mestre-do-PC-V10"
  if ($LASTEXITCODE -ne 0) { throw "git commit falhou" }
  & git -C $repo push origin "HEAD:${Branch}"
  if ($LASTEXITCODE -ne 0) { throw "git push falhou" }
  Write-Host "Publicado em $RepoUrl ($Branch)."
}
finally {
  Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue
  Remove-Item -Force $askpass -ErrorAction SilentlyContinue
}
