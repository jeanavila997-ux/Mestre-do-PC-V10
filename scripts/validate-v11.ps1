# Mestre do PC V11 - Validação de Scripts PowerShell
# Verifica sintaxe e boas práticas em todos os scripts .ps1

param(
    [switch]$Verbose,
    [switch]$Fix
)

$ErrorActionPreference = "Continue"
$projectRoot = Split-Path -Parent $PSCommandPath

# Scripts legados/existentes que podem usar Get-WmiObject (serão migrados no futuro)
$legacyScripts = @("MestreDoPC-Launcher.ps1", "validate-v11.ps1")

$excludePatterns = @("node_modules", "validate_all.ps1")
$scripts = Get-ChildItem -Path $projectRoot -Filter "*.ps1" -Recurse | Where-Object {
    $relative = $_.FullName.Replace($projectRoot, "").TrimStart("\")
    $excludePatterns | ForEach-Object { $relative -notlike "*$_*" } | Measure-Object | Where-Object { $_.Count -eq $excludePatterns.Count }
}

Write-Host "=== Validação de Scripts PowerShell V11 ===" -ForegroundColor Cyan
Write-Host ""

$passed = 0
$failed = 0
$warnings = 0
$secretAssignmentPattern = '(?i)\b(password|senha|token|api[_-]?key|secret)\s*='

foreach ($script in $scripts) {
    $relativePath = $script.FullName.Replace($projectRoot, "").TrimStart("\")
    Write-Host "Verificando: $relativePath" -ForegroundColor Gray
    
    try {
        # Validação de sintaxe
        $errors = $null
        $tokens = $null
        $ast = [System.Management.Automation.Language.Parser]::ParseFile(
            $script.FullName,
            [ref]$tokens,
            [ref]$errors
        )
        
        if ($errors.Count -gt 0) {
            Write-Host "  ❌ ERROS DE SINTAXE:" -ForegroundColor Red
            foreach ($err in $errors) {
                Write-Host "     Linha $($err.Extent.StartLineNumber): $($err.Message)" -ForegroundColor Red
            }
            $failed++
            continue
        }
        
        # Verificação de boas práticas
        $content = Get-Content $script.FullName -Raw
        
        # Warning: Write-Host sem cor (menos legível)
        if ($content -match 'Write-Host "[^"]*"$' -and $content -notmatch 'ForegroundColor') {
            if ($Verbose) {
                Write-Host "  ⚠️  Write-Host sem cor definida" -ForegroundColor Yellow
            }
            $warnings++
        }
        
        # Warning: ErrorAction SilentlyContinue excessivo
        $silentCount = ([regex]::Matches($content, 'SilentlyContinue')).Count
        if ($silentCount -gt 5) {
            if ($Verbose) {
                Write-Host "  ⚠️  Uso excessivo de SilentlyContinue ($silentCount vezes)" -ForegroundColor Yellow
            }
            $warnings++
        }
        
        # Erro: Cmdlets descontinuados (exceto scripts legados)
        $isLegacy = $legacyScripts -contains $script.Name
        if (($content -match 'Invoke-WMIMethod|Get-WmiObject') -and -not $isLegacy) {
            Write-Host "  ❌ Cmdlet descontinuado detectado (use Get-CimInstance)" -ForegroundColor Red
            $failed++
            continue
        } elseif (($content -match 'Invoke-WMIMethod|Get-WmiObject') -and $isLegacy -and $Verbose) {
            Write-Host "  ℹ️  Script legado (Get-WmiObject será migrado no futuro)" -ForegroundColor Gray
        }
        
        # Erro: Credenciais em claro
        if ($content -match $secretAssignmentPattern) {
            Write-Host "  ❌ Senha em claro detectada!" -ForegroundColor Red
            $failed++
            continue
        }
        
        # Sucesso
        Write-Host "  ✅ OK" -ForegroundColor Green
        $passed++
        
    } catch {
        Write-Host "  ❌ EXCEÇÃO: $($_.Exception.Message)" -ForegroundColor Red
        $failed++
    }
}

Write-Host ""
Write-Host "=== Resumo ===" -ForegroundColor Cyan
Write-Host "  ✅ Passaram: $passed" -ForegroundColor Green
Write-Host "  ❌ Falharam: $failed" -ForegroundColor $(if($failed -eq 0){"Green"}else{"Red"})
Write-Host "  ⚠️  Warnings: $warnings" -ForegroundColor Yellow
Write-Host ""

if ($failed -gt 0) {
    Write-Host "VALIDAÇÃO FALHOU: Corrija os erros acima antes de commit." -ForegroundColor Red
    exit 1
} else {
    Write-Host "VALIDAÇÃO BEM-SUCEDIDA!" -ForegroundColor Green
    exit 0
}
