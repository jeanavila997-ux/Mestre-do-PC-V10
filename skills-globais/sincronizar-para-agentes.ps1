#Requires -Version 7
<#
.SYNOPSIS
  Copia as skills-globais do Mestre do PC para pastas de agentes CLI.

.DESCRIPTION
  Cada skill vira DESTINO\<nome-slug>\SKILL.md
  Analogia: é o "robocopy de manuais" — um livro na estante do projeto,
  cópias nas estantes de cada agente.

.EXAMPLE
  pwsh -File .\sincronizar-para-agentes.ps1
  pwsh -File .\sincronizar-para-agentes.ps1 -WhatIf
  pwsh -File .\sincronizar-para-agentes.ps1 -Destinos claude,grok
#>
param(
  [string[]] $Destinos = @('claude', 'codex', 'grok', 'agents'),
  [switch] $WhatIf
)

$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot

$map = @{
  claude = Join-Path $env:USERPROFILE '.claude\skills'
  codex  = Join-Path $env:USERPROFILE '.codex\skills'
  grok   = Join-Path $env:USERPROFILE '.grok\skills'
  agents = Join-Path $env:USERPROFILE '.agents\skills'
}

$skills = Get-ChildItem -Path $Root -Recurse -Filter 'SKILL.md' |
  Where-Object { $_.Directory.Name -notmatch '^(relatorios)$' }

if (-not $skills) {
  Write-Error "Nenhuma SKILL.md encontrada em $Root"
}

Write-Host "Skills encontradas: $($skills.Count)"

foreach ($key in $Destinos) {
  $k = $key.ToLowerInvariant()
  if (-not $map.ContainsKey($k)) {
    Write-Warning "Destino desconhecido: $key (use claude,codex,grok,agents)"
    continue
  }
  $destRoot = $map[$k]
  if (-not (Test-Path $destRoot)) {
    if ($WhatIf) {
      Write-Host "[WhatIf] criaria $destRoot"
    } else {
      New-Item -ItemType Directory -Force -Path $destRoot | Out-Null
    }
  }

  foreach ($skillFile in $skills) {
    $slug = $skillFile.Directory.Name
    $targetDir = Join-Path $destRoot $slug
    $targetFile = Join-Path $targetDir 'SKILL.md'
    if ($WhatIf) {
      Write-Host "[WhatIf] $slug -> $targetFile"
      continue
    }
    New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
    Copy-Item -LiteralPath $skillFile.FullName -Destination $targetFile -Force
    Write-Host "OK $k/$slug"
  }
}

Write-Host "Concluido."
