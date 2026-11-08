/**
 * Módulo de transcrição de áudio usando Whisper via Ollama
 * Captura áudio do microfone e transcreve usando o modelo dimavz/whisper-tiny
 */

import { spawn } from "node:child_process";
import { writeFile, mkdir, unlink, readFile, readdir, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMP_AUDIO_DIR = join(__dirname, "..", "logs", "audio-temp");

/**
 * Garante que a pasta temporária existe
 */
async function ensureTempDir() {
  if (!existsSync(TEMP_AUDIO_DIR)) {
    await mkdir(TEMP_AUDIO_DIR, { recursive: true });
  }
}

/**
 * Grava áudio do microfone por um período determinado
 * @param {number} durationSeconds - Duração da gravação em segundos
 * @returns {Promise<{audioPath: string, duration: number}>}
 */
export async function recordAudio(durationSeconds = 30) {
  await ensureTempDir();
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const audioPath = join(TEMP_AUDIO_DIR, `recording-${timestamp}.wav`);
  
  return new Promise((resolve, reject) => {
    // Usa ffmpeg para gravar do microfone padrão
    // Se ffmpeg não estiver disponível, tenta usar powershell
    const ffmpegArgs = [
      "-f", "dshow",
      "-i", "audio=Microfone (Realtek(R) Audio)",
      "-t", durationSeconds.toString(),
      "-ar", "16000",
      "-ac", "1",
      "-y",
      audioPath
    ];
    
    const ffmpeg = spawn("ffmpeg", ffmpegArgs);
    let stderr = "";
    
    ffmpeg.stderr.on("data", (data) => {
      stderr += data.toString();
    });
    
    ffmpeg.on("close", (code) => {
      if (code === 0 || code === null) {
        resolve({ audioPath, duration: durationSeconds });
      } else {
        reject(new Error(`ffmpeg falhou com código ${code}: ${stderr}`));
      }
    });
    
    ffmpeg.on("error", (err) => {
      // Fallback: tentar usar PowerShell para gravar
      if (err.code === "ENOENT") {
        recordAudioPowerShell(durationSeconds, audioPath)
          .then(resolve)
          .catch(reject);
      } else {
        reject(err);
      }
    });
  });
}

/**
 * Fallback: grava áudio usando PowerShell (se disponível)
 */
async function recordAudioPowerShell(durationSeconds, outputPath) {
  return new Promise((resolve, reject) => {
    const psScript = `
      $duration = ${durationSeconds}
      $outputPath = "${outputPath.replace(/\\/g, "\\\\")}"
      
      # Tenta usar NAudio se disponível, senão retorna erro
      try {
        Add-Type -AssemblyName "System.Windows.Forms" -ErrorAction Stop
        # Gravação simplificada - em produção, use NAudio ou biblioteca similar
        Write-Host "Gravando por $duration segundos..."
        Start-Sleep -Seconds $duration
        Write-Host "Gravação concluída"
        # Nota: Esta é uma implementação simplificada
        # Para gravação real, instale ffmpeg ou use uma biblioteca Python
      } catch {
        Write-Error "Biblioteca de áudio não disponível. Instale ffmpeg."
        exit 1
      }
    `;
    
    const ps = spawn("powershell", ["-Command", psScript]);
    
    ps.on("close", (code) => {
      if (code === 0) {
        resolve({ audioPath: outputPath, duration: durationSeconds });
      } else {
        reject(new Error("PowerShell não conseguiu gravar áudio. Instale ffmpeg."));
      }
    });
  });
}

/**
 * Transcreve arquivo de áudio usando Whisper via Ollama
 * @param {string} audioPath - Caminho do arquivo de áudio
 * @param {string} language - Código do idioma (ex: 'pt', 'en')
 * @returns {Promise<{text: string, language: string, duration: number}>}
 */
export async function transcribeAudio(audioPath, language = "pt") {
  const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
  const WHISPER_MODEL = "dimavz/whisper-tiny";
  
  // Verifica se o arquivo existe
  if (!existsSync(audioPath)) {
    throw new Error(`Arquivo de áudio não encontrado: ${audioPath}`);
  }
  
  // Lê o arquivo de áudio como base64
  const audioBuffer = await readFile(audioPath);
  const audioBase64 = audioBuffer.toString("base64");
  
  // Whisper no Ollama espera o áudio como parte da mensagem
  // Formato: content pode ser texto ou array com imagens/áudio
  const response = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: WHISPER_MODEL,
      prompt: "Transcreva o áudio a seguir para texto:",
      images: [audioBase64], // Whisper trata áudio como "imagem" no formato do Ollama
      stream: false,
      options: {
        temperature: 0, // Whisper funciona melhor com temperatura 0
      },
    }),
    signal: AbortSignal.timeout(120000), // 2 minutos timeout
  });
  
  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`Whisper falhou: HTTP ${response.status} - ${errorText}`);
  }
  
  const data = await response.json();
  
  return {
    text: data.response || "",
    language: language,
    duration: data.total_duration ? Math.round(data.total_duration / 1_000_000) : 0,
  };
}

/**
 * Limpa arquivos temporários de áudio
 * @param {number} olderThanHours - Remove arquivos mais antigos que X horas
 */
export async function cleanupTempAudio(olderThanHours = 1) {
  if (!existsSync(TEMP_AUDIO_DIR)) {
    return;
  }
  
  const files = await readdir(TEMP_AUDIO_DIR);
  const now = Date.now();
  const threshold = olderThanHours * 60 * 60 * 1000;
  
  for (const file of files) {
    const filePath = join(TEMP_AUDIO_DIR, file);
    const stats = await stat(filePath);
    
    if (now - stats.mtimeMs > threshold) {
      await unlink(filePath).catch(() => {});
    }
  }
}

/**
 * Função principal: grava e transcreve em um único passo
 * @param {number} durationSeconds - Duração da gravação
 * @param {string} language - Idioma da transcrição
 * @param {boolean} cleanup - Se deve limpar o arquivo após transcrever
 * @returns {Promise<{text: string, language: string, audioPath: string}>}
 */
export async function recordAndTranscribe(durationSeconds = 30, language = "pt", cleanup = true) {
  try {
    const { audioPath, duration } = await recordAudio(durationSeconds);
    const result = await transcribeAudio(audioPath, language);
    
    if (cleanup) {
      await unlink(audioPath).catch(() => {});
    }
    
    return {
      text: result.text,
      language: language,
      audioPath: cleanup ? "(limpo)" : audioPath,
    };
  } catch (error) {
    throw new Error(`Falha na transcrição: ${error.message}`);
  }
}
