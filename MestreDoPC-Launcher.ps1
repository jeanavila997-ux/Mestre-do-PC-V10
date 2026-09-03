# ================================================================
# Compatibilidade: o launcher PowerShell foi substituído por v10\launcher.js.
# Mantido apenas para instalações antigas que ainda chamam este arquivo.
# ================================================================
$nodeLauncher = Join-Path $PSScriptRoot "start-mestre-v10.ps1"
if (-not (Test-Path -LiteralPath $nodeLauncher)) {
    throw "Inicializador Node.js não encontrado: $nodeLauncher"
}
Write-Warning "MestreDoPC-Launcher.ps1 está obsoleto; iniciando o launcher Node.js."
& $nodeLauncher
exit $LASTEXITCODE

# A implementação legada (servidor HTTP em PowerShell) foi removida — ver
# docs/adr/ADR-001-launcher-unico-node.md. O código continua no histórico do git.
