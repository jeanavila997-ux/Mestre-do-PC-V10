# Limpeza conservadora de logs antigos do Windows
# Operação: limpar_arquivos_de_log_do_windows

$ErrorActionPreference = 'Stop'
$logRoot = 'C:\Windows\Logs'
$limite = (Get-Date).AddDays(-30)
$extensoesPermitidas = @('.log', '.etl', '.cab')

Write-Host "🔵 Procurando logs do Windows com mais de 30 dias..." -ForegroundColor Cyan

if (-not (Test-Path -LiteralPath $logRoot -PathType Container)) {
    Write-Host "ℹ️ Diretório de logs não encontrado: $logRoot" -ForegroundColor Yellow
    exit 0
}

# Seleciona somente arquivos antigos de extensões conhecidas; diretórios nunca são removidos.
$arquivosAlvo = @(
    Get-ChildItem -LiteralPath $logRoot -Recurse -File -ErrorAction SilentlyContinue |
        Where-Object { $_.LastWriteTime -lt $limite -and $_.Extension -in $extensoesPermitidas }
)
$bytesAlvo = ($arquivosAlvo | Measure-Object -Property Length -Sum).Sum
if ($null -eq $bytesAlvo) { $bytesAlvo = 0 }

Write-Host "📊 Arquivos elegíveis: $($arquivosAlvo.Count) ($([math]::Round($bytesAlvo / 1GB, 2)) GB)"

$removidos = 0
$bytesLiberados = 0
$falhas = 0
foreach ($arquivo in $arquivosAlvo) {
    try {
        $tamanho = $arquivo.Length
        Remove-Item -LiteralPath $arquivo.FullName -ErrorAction Stop
        $removidos++
        $bytesLiberados += $tamanho
    } catch {
        $falhas++
    }
}

Write-Host "✅ Arquivos removidos: $removidos" -ForegroundColor Green
if ($falhas -gt 0) {
    Write-Host "⚠️ Arquivos não removidos (em uso ou sem permissão): $falhas" -ForegroundColor Yellow
}
Write-Host "📊 Total liberado: $([math]::Round($bytesLiberados / 1GB, 2)) GB" -ForegroundColor Green
Write-Host "⏱️  Conclusão: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Gray
