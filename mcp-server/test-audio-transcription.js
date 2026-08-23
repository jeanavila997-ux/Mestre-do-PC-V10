/**
 * Script de teste para transcrição de áudio com Whisper
 * Execute: node test-audio-transcription.js
 */

import * as audioTranscriber from "./audio-transcriber.js";

console.log("🎤 Teste de Transcrição de Áudio - Mestre do PC V11\n");

async function testTranscription() {
  try {
    // Teste 1: Verificar se o modelo Whisper está disponível
    console.log("1️⃣ Verificando modelo Whisper no Ollama...");
    const ollamaUrl = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
    
    const response = await fetch(`${ollamaUrl}/api/tags`);
    if (!response.ok) {
      throw new Error("Ollama não está rodando ou inacessível");
    }
    
    const data = await response.json();
    const hasWhisper = data.models?.some(m => m.name?.includes("whisper"));
    
    if (!hasWhisper) {
      console.log("⚠️  Modelo Whisper não encontrado!");
      console.log("   Execute: ollama pull dimavz/whisper-tiny\n");
      return;
    }
    
    console.log("✅ Modelo Whisper encontrado\n");
    
    // Teste 2: Gravar e transcrever
    console.log("2️⃣ Gravando 10 segundos de áudio...");
    console.log("   🎤 Fale algo agora!\n");
    
    const { audioPath, duration } = await audioTranscriber.recordAudio(10);
    console.log(`✅ Áudio gravado: ${audioPath}`);
    console.log(`   Duração: ${duration}s\n`);
    
    // Teste 3: Transcrever
    console.log("3️⃣ Transcrevendo áudio com Whisper...");
    const result = await audioTranscriber.transcribeAudio(audioPath, "pt");
    
    console.log("✅ Transcrição concluída!\n");
    console.log("📝 Resultado:");
    console.log("   " + "=".repeat(50));
    console.log(`   ${result.text || "(Nenhum áudio detectado)"}`);
    console.log("   " + "=".repeat(50));
    console.log(`   ⏱️ Tempo de processamento: ${result.duration}ms\n`);
    
    // Teste 4: Limpar arquivo
    console.log("4️⃣ Limpando arquivo temporário...");
    await audioTranscriber.unlink(audioPath);
    console.log("✅ Arquivo removido\n");
    
    console.log("🎉 Todos os testes passaram!\n");
    
  } catch (error) {
    console.error("❌ Erro no teste:");
    console.error(`   ${error.message}\n`);
    
    if (error.message.includes("ffmpeg")) {
      console.log("💡 Dica: Instale o ffmpeg em https://ffmpeg.org/download.html\n");
    } else if (error.message.includes("microfone")) {
      console.log("💡 Dica: Verifique se o microfone está conectado e com permissões\n");
    } else if (error.message.includes("Ollama")) {
      console.log("💡 Dica: Inicie o Ollama com 'ollama serve'\n");
    }
  }
}

// Executar teste
testTranscription();
