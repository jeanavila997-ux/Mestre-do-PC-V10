# Setup da Integração Whisper - Mestre do PC V11
# Executar: .\setup-whisper.ps1

Write-Host "🎤 Setup do Whisper no Mestre do PC V11" -ForegroundColor Cyan
Write-Host "=" * 50
Write-Host ""

# 1. Verificar se Ollama está rodando
Write-Host "1️⃣ Verificando Ollama..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -TimeoutSec 5 -ErrorAction Stop
    Write-Host "   ✅ Ollama está rodando" -ForegroundColor Green
} catch {
    Write-Host "   ❌ Ollama não está rodando!" -ForegroundColor Red
    Write-Host ""
    Write-Host "   Inicie o Ollama com: ollama serve" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

# 2. Verificar modelo Whisper
Write-Host ""
Write-Host "2️⃣ Verificando modelo Whisper..." -ForegroundColor Yellow
$whisperModel = "dimavz/whisper-tiny"
$models = $response.models | Where-Object { $_.name -eq $whisperModel }

if ($models) {
    Write-Host "   ✅ Modelo $whisperModel já instalado" -ForegroundColor Green
} else {
    Write-Host "   🟡 Modelo não encontrado. Baixando..." -ForegroundColor Yellow
    Write-Host "   Isso pode levar alguns minutos..."
    Write-Host ""
    
    try {
        & ollama pull $whisperModel
        Write-Host ""
        Write-Host "   ✅ Modelo instalado com sucesso!" -ForegroundColor Green
    } catch {
        Write-Host ""
        Write-Host "   ❌ Erro ao baixar modelo: $_" -ForegroundColor Red
        exit 1
    }
}

# 3. Verificar ffmpeg
Write-Host ""
Write-Host "3️⃣ Verificando ffmpeg..." -ForegroundColor Yellow
try {
    $ffmpeg = Get-Command ffmpeg -ErrorAction Stop
    Write-Host "   ✅ ffmpeg encontrado: $($ffmpeg.Source)" -ForegroundColor Green
} catch {
    Write-Host "   ⚠️  ffmpeg não encontrado" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "   O ffmpeg melhora a qualidade da gravação de áudio." -ForegroundColor Gray
    Write-Host "   Para instalar:" -ForegroundColor Gray
    Write-Host "   1. Baixe em: https://ffmpeg.org/download.html" -ForegroundColor Gray
    Write-Host "   2. Extraia para C:\ffmpeg" -ForegroundColor Gray
    Write-Host "   3. Adicione C:\ffmpeg\bin ao PATH" -ForegroundColor Gray
    Write-Host ""
    Write-Host "   Pressione Enter para continuar sem ffmpeg..." -ForegroundColor Gray
    $null = $Host.UI.ReadLine()
}

# 4. Criar pasta de áudio temporário
Write-Host ""
Write-Host "4️⃣ Criando pasta de áudio temporário..." -ForegroundColor Yellow
$audioTempDir = Join-Path $PSScriptRoot "logs\audio-temp"
if (!(Test-Path $audioTempDir)) {
    New-Item -ItemType Directory -Force -Path $audioTempDir | Out-Null
    Write-Host "   ✅ Pasta criada: $audioTempDir" -ForegroundColor Green
} else {
    Write-Host "   ✅ Pasta já existe: $audioTempDir" -ForegroundColor Green
}

# 5. Testar microfone
Write-Host ""
Write-Host "5️⃣ Testando microfone..." -ForegroundColor Yellow
try {
    # Verifica se há dispositivos de áudio
    $audioDevices = Get-WmiObject Win32_SoundDevice | Where-Object { $_.Status -eq "OK" }
    if ($audioDevices) {
        Write-Host "   ✅ $($audioDevices.Count) dispositivo(s) de áudio encontrado(s)" -ForegroundColor Green
        foreach ($device in $audioDevices) {
            Write-Host "      - $($device.Name)" -ForegroundColor Gray
        }
    } else {
        Write-Host "   ⚠️  Nenhum dispositivo de áudio encontrado" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ⚠️  Não foi possível verificar dispositivos de áudio" -ForegroundColor Yellow
}

# 6. Resumo
Write-Host ""
Write-Host "=" * 50
Write-Host "✅ Setup concluído!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Resumo:" -ForegroundColor Cyan
Write-Host "   - Modelo: $whisperModel"
Write-Host "   - Pasta temp: $audioTempDir"
Write-Host ""
Write-Host "🧪 Para testar:" -ForegroundColor Cyan
Write-Host "   cd mcp-server"
Write-Host "   node test-audio-transcription.js"
Write-Host ""
Write-Host "📖 Documentação:" -ForegroundColor Cyan
Write-Host "   docs\transcricao-audio-whisper.md"
Write-Host ""
Write-Host "🎤 Uso via MCP:" -ForegroundColor Cyan
Write-Host '   await mcp.callTool("transcrever_audio", {'
Write-Host '     duracao_segundos: 30,'
Write-Host '     idioma: "pt",'
Write-Host '     limpar_arquivo: true'
Write-Host '   });'
Write-Host ""
