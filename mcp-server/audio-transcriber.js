/**
 * Transcrição de áudio do Mestre do PC.
 * Grava do microfone padrão e transcreve com faster-whisper (whisper_engine.py),
 * executado no venv Python em %LOCALAPPDATA%\MestreDoPC\whisper-venv
 * (ou no caminho definido em MESTRE_WHISPER_PYTHON).
 */

import { spawn } from "node:child_process";
import { mkdir, unlink, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMP_AUDIO_DIR = join(__dirname, "..", "logs", "audio-temp");
const ENGINE = join(__dirname, "whisper_engine.py");
const DEFAULT_MODEL = process.env.MESTRE_WHISPER_MODEL || "base";

function pythonBin() {
  if (process.env.MESTRE_WHISPER_PYTHON) return process.env.MESTRE_WHISPER_PYTHON;
  const local = process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local");
  return join(local, "MestreDoPC", "whisper-venv", "Scripts", "python.exe");
}

async function ensureTempDir() {
  if (!existsSync(TEMP_AUDIO_DIR)) {
    await mkdir(TEMP_AUDIO_DIR, { recursive: true });
  }
}

function runEngine(args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const python = pythonBin();
    if (!existsSync(python)) {
      reject(new Error(`Python do Whisper não encontrado em ${python}. Rode o setup-whisper.ps1.`));
      return;
    }
    const child = spawn(python, [ENGINE, ...args], { windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.stdout.on("data", (d) => { stdout += d.toString(); });
    child.stderr.on("data", (d) => { stderr += d.toString(); });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`whisper_engine falhou (código ${code}): ${stderr.trim().slice(-400)}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout.trim().split("\n").pop()));
      } catch {
        reject(new Error(`Resposta inválida do whisper_engine: ${stdout.slice(0, 200)}`));
      }
    });
  });
}

/**
 * Grava áudio do microfone padrão por N segundos (WAV 16 kHz mono).
 * @param {number} durationSeconds
 * @returns {Promise<{audioPath: string, duration: number}>}
 */
export async function recordAudio(durationSeconds = 30) {
  await ensureTempDir();
  const seconds = Math.min(Math.max(Number(durationSeconds) || 30, 1), 300);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const audioPath = join(TEMP_AUDIO_DIR, `recording-${timestamp}.wav`);
  return runEngine(["record", String(seconds), audioPath], (seconds + 60) * 1000);
}

/**
 * Transcreve um arquivo de áudio com faster-whisper.
 * @param {string} audioPath
 * @param {string} language - código do idioma (ex: 'pt', 'en')
 * @returns {Promise<{text: string, language: string, duration: number}>}
 */
export async function transcribeAudio(audioPath, language = "pt") {
  if (!existsSync(audioPath)) {
    throw new Error(`Arquivo de áudio não encontrado: ${audioPath}`);
  }
  const result = await runEngine(["transcribe", audioPath, language, DEFAULT_MODEL], 10 * 60 * 1000);
  return {
    text: result.text || "",
    language: result.language || language,
    duration: result.elapsedSeconds || 0,
  };
}

/**
 * Remove gravações temporárias mais antigas que N horas.
 * @param {number} olderThanHours
 */
export async function cleanupTempAudio(olderThanHours = 1) {
  if (!existsSync(TEMP_AUDIO_DIR)) return;
  const files = await readdir(TEMP_AUDIO_DIR);
  const threshold = olderThanHours * 60 * 60 * 1000;
  for (const file of files) {
    const filePath = join(TEMP_AUDIO_DIR, file);
    const info = await stat(filePath);
    if (Date.now() - info.mtimeMs > threshold) {
      await unlink(filePath).catch(() => {});
    }
  }
}

/**
 * Grava e transcreve em um passo só.
 * @param {number} durationSeconds
 * @param {string} language
 * @param {boolean} cleanup - remove o WAV depois de transcrever
 */
export async function recordAndTranscribe(durationSeconds = 30, language = "pt", cleanup = true) {
  try {
    const { audioPath } = await recordAudio(durationSeconds);
    const result = await transcribeAudio(audioPath, language);
    if (cleanup) await unlink(audioPath).catch(() => {});
    return {
      text: result.text,
      language,
      audioPath: cleanup ? "(limpo)" : audioPath,
    };
  } catch (error) {
    throw new Error(`Falha na transcrição: ${error.message}`);
  }
}
