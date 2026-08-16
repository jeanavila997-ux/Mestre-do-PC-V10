#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { sanitizeToolArgument, checkPromptInjection } from "./security.js";
import { auditLog, AuditLevel, queryAuditLog } from "./audit-logger.js";
import { readFile, readdir, access, constants } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, extname } from "node:path";
import { spawn } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));

const MESTRE_BASE_URL = (process.env.MESTRE_BASE_URL || "http://127.0.0.1:7777").replace(/\/+$/, "");
const MESTRE_RUN_URL = MESTRE_BASE_URL + "/run";
const MESTRE_STATUS_URL = MESTRE_BASE_URL + "/run-status";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function stripHtml(html) {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

// ===== NOVOS TOOLS V11.1 — Helpers =====

const ALLOWED_GOV_DOMAINS = ["gov.br", "ibge.gov.br", "embrapa.br", "usp.br", "in.gov.br", "datasus.gov.br"];
const MESTRE_PROJETO_PATH = process.env.MESTRE_PROJETO_PATH || "";
const PDF_BASE_DIR = MESTRE_PROJETO_PATH ? join(MESTRE_PROJETO_PATH, "06_REFERENCIAS", "pdfs") : "";
const FINAL_TABLE_DIR = MESTRE_PROJETO_PATH ? join(MESTRE_PROJETO_PATH, "02_DADOS", "03_final") : "";
const APPROVALS_FILE = join(__dirname, "..", "logs", "audit", "approvals.json");

function isAllowedGovDomain(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return ALLOWED_GOV_DOMAINS.some((d) => host === d || host.endsWith("." + d));
  } catch {
    return false;
  }
}

async function extractTextFromPdf(pdfPath, searchTerm, contextLines = 3) {
  // Extração simples de texto de PDF usando leitura binária + regex de texto.
  // Para produção, considere instalar pdf-parse ou pdfplumber.
  const buf = await readFile(pdfPath);
  const text = buf.toString("latin1");
  const lines = text.split(/\r?\n/);
  const matches = [];
  const maxCtx = Math.min(Math.max(1, contextLines), 5);

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toLowerCase().includes(searchTerm.toLowerCase())) {
      const start = Math.max(0, i - maxCtx);
      const end = Math.min(lines.length, i + maxCtx + 1);
      const snippet = lines.slice(start, end).join("\n").trim();
      matches.push({ line: i + 1, snippet });
    }
  }
  return matches;
}

async function loadFontesMestreCsv() {
  const csvPath = join(MESTRE_PROJETO_PATH || "", "06_REFERENCIAS", "fontes_mestre.csv");
  if (!existsSync(csvPath)) return [];
  const raw = await readFile(csvPath, "utf8");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  return lines.slice(1).map((line) => {
    const cols = line.split(/[,;]/);
    return { id_fonte: cols[0]?.trim(), caminho: cols[1]?.trim(), descricao: cols[2]?.trim() };
  });
}

async function validateApprovalId(approvalId) {
  if (!existsSync(APPROVALS_FILE)) return false;
  try {
    const raw = await readFile(APPROVALS_FILE, "utf8");
    const data = JSON.parse(raw);
    return Array.isArray(data.approvals) && data.approvals.some((a) => a.id === approvalId && a.expires_at && new Date(a.expires_at) > new Date());
  } catch {
    return false;
  }
}

function runChildProcess(command, args, options = {}) {
  return new Promise((resolveObj, reject) => {
    const proc = spawn(command, args, { timeout: options.timeoutMs || 30000, ...options });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      resolveObj({ stdout, stderr, code });
    });
  });
}

// ===== FIM HELPERS V11.1 =====

async function searchWeb(query, maxResults = 5) {
  const limit = Math.min(Math.max(1, Math.floor(Number(maxResults) || 5)), 10);
  const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=br-pt`;

  const res = await fetch(searchUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept-Language": "pt-BR,pt;q=0.9",
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    throw new Error(`DuckDuckGo retornou HTTP ${res.status}`);
  }

  const html = await res.text();

  // Se DuckDuckGo devolver a pagina de desafio (por rate-limit/bot detection), avisa.
  if (html.includes("anomaly.js") || html.includes("challenge-form")) {
    throw new Error("DuckDuckGo bloqueou a requisicao (anti-bot). Tente novamente em alguns segundos.");
  }

  const results = [];

  // DuckDuckGo HTML: resultados em <div class="result"> ...
  const resultBlocks = html.split(/<div class="result[^"]*">/i).slice(1);

  for (const block of resultBlocks.slice(0, limit)) {
    const titleMatch = block.match(/<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    const snippetMatch = block.match(/<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i);

    if (titleMatch) {
      const rawUrl = titleMatch[1];
      let url = rawUrl;
      // DuckDuckGo redirect: //duckduckgo.com/l/?uddg=...
      const uddgMatch = rawUrl.match(/[?&]uddg=([^&]+)/i);
      if (uddgMatch) {
        try {
          url = decodeURIComponent(uddgMatch[1]);
        } catch {}
      }
      results.push({
        title: stripHtml(titleMatch[2]).trim(),
        url: url.trim(),
        snippet: snippetMatch ? stripHtml(snippetMatch[1]).trim() : "",
      });
    }
  }

  if (results.length === 0) {
    // Fallback: tenta extrair links genericos
    const linkMatches = [...html.matchAll(/<a[^>]*href="([^"]+)"[^>]*class="result[^"]*"[^>]*>([\s\S]*?)<\/a>/gi)];
    for (const m of linkMatches.slice(0, limit)) {
      results.push({
        title: stripHtml(m[2]).trim(),
        url: m[1].trim(),
        snippet: "",
      });
    }
  }

  return results;
}

async function executeLauncherCommand(commandOrPayload, options = {}) {
  const payload = typeof commandOrPayload === "string" ? { cmd: commandOrPayload } : commandOrPayload;

  // Auditoria: log do comando enviado
  const commandId = typeof payload === "object" && payload.id ? payload.id : "unknown";
  await auditLog(AuditLevel.COMMAND_EXEC, "execute_launcher_command", {
    commandId,
    payload: typeof payload === "string" ? { cmd: "[REDACTED]" } : { id: payload.id },
    options: { timeoutMs: options.timeoutMs },
  });

  const submitRes = await fetch(MESTRE_RUN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Mestre-Client": "mcp",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(options.submitTimeoutMs || 10000),
  });

  const submitData = await submitRes.json();
  if (
    submitRes.ok === false ||
    submitData.success !== true ||
    submitData.accepted !== true ||
    submitData.jobId == null
  ) {
    await auditLog(AuditLevel.ERROR, "execute_launcher_command_failed", {
      commandId,
      error: submitData.output,
    });
    throw new Error(submitData.output || "Falha ao enviar comando para o Launcher.");
  }

  const timeoutMs = options.timeoutMs || 900000;
  const pollIntervalMs = options.pollIntervalMs || 1200;
  const statusTimeoutMs = options.statusTimeoutMs || 5000;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const statusRes = await fetch(
      MESTRE_STATUS_URL + "?id=" + encodeURIComponent(submitData.jobId),
      { signal: AbortSignal.timeout(statusTimeoutMs) },
    );
    const statusData = await statusRes.json();

    if (statusRes.ok === false) {
      await auditLog(AuditLevel.ERROR, "execute_launcher_command_status_failed", {
        commandId,
        jobId: submitData.jobId,
        error: statusData.output,
      });
      throw new Error(statusData.output || "Falha ao consultar status do Launcher.");
    }

    if (statusData.state === "running") {
      await sleep(pollIntervalMs);
      continue;
    }

    // Auditoria: comando concluído
    await auditLog(AuditLevel.COMMAND_EXEC, "execute_launcher_command_completed", {
      commandId,
      jobId: submitData.jobId,
      success: statusData.success,
      exitCode: statusData.exitCode,
    });

    return statusData;
  }

  await auditLog(AuditLevel.ERROR, "execute_launcher_command_timeout", {
    commandId,
    jobId: submitData.jobId,
  });
  throw new Error("Timeout aguardando conclusão do comando no Launcher.");
}

const server = new Server(
  {
    name: "mestre-do-pc-mcp",
    version: "1.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// Mapeamento das ferramentas MCP para comandos/IDs do Mestre do PC V10.
// Comandos sem parâmetros podem usar apenas {id} (o launcher resolve em allowed-operations.json).
// Comandos com {{TOKEN}} enviam {id, params} e o launcher valida+substitui de forma segura.
const mestreTools = {
  limpeza_rapida_completa: {
    id: "limpeza_rapida_completa",
    description: "Executa uma limpeza rápida completa no sistema: esvazia a lixeira e limpa pastas temporárias.",
    command: 'Remove-Item "$env:TEMP\\*" -Recurse -Force -EA 0; Remove-Item "C:\\Windows\\Temp\\*" -Recurse -Force -EA 0; Clear-RecycleBin -Force -EA 0; Write-Host "✅ Limpeza concluida!" -ForegroundColor Green',
  },
  esvaziar_lixeira: {
    id: "esvaziar_lixeira",
    description: "Esvazia silenciosamente a lixeira do Windows.",
    command: 'Clear-RecycleBin -Force -ErrorAction SilentlyContinue; Write-Host "✅ Lixeira esvaziada!" -ForegroundColor Green',
  },
  limpar_cache_windows_update: {
    id: "limpar_cache_windows_update",
    description: "Limpa o cache do Windows Update paralisando e reiniciando o serviço.",
    command: 'Stop-Service wuauserv -Force; Remove-Item "C:\\Windows\\SoftwareDistribution\\Download\\*" -Recurse -Force -EA 0; Start-Service wuauserv; Write-Host "✅ Cache WU limpo!" -ForegroundColor Green',
  },
  limpar_logs_event_viewer: {
    id: "limpar_logs_event_viewer",
    description: "Limpa todos os logs do Event Viewer do Windows.",
    command: 'Get-EventLog -List | ForEach-Object { Clear-EventLog -LogName $_.Log -EA 0 }; Write-Host "✅ Logs de eventos limpos!" -ForegroundColor Green',
  },
  limpar_cache_thumbnail: {
    id: "limpar_cache_thumbnail",
    description: "Limpa o cache de miniaturas (thumbnails) do Windows.",
    command: 'ie4uinit.exe -show; Remove-Item "$env:LOCALAPPDATA\\Microsoft\\Windows\\Explorer\\thumbcache_*" -Force -EA 0; Write-Host "✅ Thumbnail cache limpo!" -ForegroundColor Green',
  },
  liberar_memoria_ram: {
    id: "liberar_memoria_ram",
    description: "Tenta liberar a memória RAM imediatamente usando o Garbage Collector do .NET.",
    command: '[System.GC]::Collect(); [System.GC]::WaitForPendingFinalizers(); Write-Host "✅ RAM liberada!" -ForegroundColor Green',
  },
  ver_uso_ram: {
    id: "ver_uso_ram",
    description: "Retorna o status atual mostrando a quantidade de memória RAM livre e o total instalado.",
    command: '$ram = Get-WmiObject Win32_OperatingSystem; $livre = [math]::Round($ram.FreePhysicalMemory/1MB,2); $total = [math]::Round($ram.TotalVisibleMemorySize/1MB,2); Write-Host "RAM Livre: $livre GB de $total GB"',
  },
  listar_processos_alto_consumo_ram: {
    id: "listar_processos_alto_consumo_ram",
    description: "Lista os 15 processos que mais estão consumindo memória RAM no momento.",
    command: 'Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 15 Name,@{N="RAM(MB)";E={[math]::Round($_.WorkingSet64/1MB,2)}} | Format-Table -AutoSize',
  },
  reiniciar_explorer: {
    id: "reiniciar_explorer",
    description: "Reinicia o Windows Explorer (explorer.exe).",
    command: 'Stop-Process -Name explorer -Force; Start-Process explorer; Write-Host "✅ Explorer reiniciado!" -ForegroundColor Green',
  },
  encerrar_processo: {
    id: "encerrar_processo",
    description: "Encerra um processo pelo nome. Informe o parâmetro 'nome' com o nome do processo (ex: chrome, notepad).",
    command: 'Stop-Process -Name "{{NOME}}" -Force -EA 0; if ($?) { Write-Host "✅ Processo {{NOME}} encerrado com sucesso!" -ForegroundColor Green } else { Write-Host "⚠️ Processo {{NOME}} não encontrado ou já encerrado." -ForegroundColor Yellow }',
  },
  desativar_servico: {
    id: "desativar_servico",
    description: "Desativa e para um serviço do Windows pelo nome. Informe 'nome_servico' (ex: wuauserv, SysMain, Spooler).",
    command: 'Set-Service -Name "{{NOME_SERVICO}}" -StartupType Disabled -EA 0; Stop-Service -Name "{{NOME_SERVICO}}" -Force -EA 0; if ($?) { Write-Host "✅ Serviço {{NOME_SERVICO}} desativado!" -ForegroundColor Green } else { Write-Host "⚠️ Serviço {{NOME_SERVICO}} não encontrado." -ForegroundColor Yellow }',
  },
  verificar_espaco_disco: {
    id: "verificar_espaco_disco",
    description: "Verifica e retorna o espaço usado, livre e total de todos os discos.",
    command: 'Get-PSDrive -PSProvider FileSystem | Select-Object Name,@{N="Usado(GB)";E={[math]::Round(($_.Used/1GB),2)}},@{N="Livre(GB)";E={[math]::Round(($_.Free/1GB),2)}},@{N="Total(GB)";E={[math]::Round((($_.Used+$_.Free)/1GB),2)}} | Format-Table -AutoSize',
  },
  verificar_saude_disco: {
    id: "verificar_saude_disco",
    description: "Verifica a saúde do disco (S.M.A.R.T.).",
    command: "Get-WmiObject -Namespace root/wmi -Class MSStorageDriver_FailurePredictStatus | Select-Object PredictFailure,Reason | Format-Table -AutoSize",
  },
  diagnostico_rede: {
    id: "diagnostico_rede",
    description: "Faz um diagnóstico mostrando informações completas da rede (ipconfig /all).",
    command: "ipconfig /all",
  },
  renovar_ip: {
    id: "renovar_ip",
    description: "Faz o flush do DNS e renova o endereço IP da máquina.",
    command: 'ipconfig /flushdns; ipconfig /release; ipconfig /renew; Write-Host "✅ IP renovado!" -ForegroundColor Green',
  },
  reparar_arquivos_sfc: {
    id: "reparar_arquivos_sfc",
    description: "Executa o sfc /scannow para reparar arquivos corrompidos do sistema.",
    command: "sfc /scannow",
  },
  reparar_imagem_dism: {
    id: "reparar_imagem_dism",
    description: "Executa a restauração da imagem do Windows (DISM /RestoreHealth).",
    command: "DISM /Online /Cleanup-Image /RestoreHealth",
  },
  verificar_informacoes_sistema: {
    id: "verificar_informacoes_sistema",
    description: "Lista o nome do produto Windows, arquitetura, nome do PC, Processador e Memória total.",
    command: "Get-ComputerInfo | Select-Object WindowsProductName,WindowsVersion,OsArchitecture,CsName,CsProcessors,CsTotalPhysicalMemory | Format-List",
  },
  verificar_temperatura_cpu: {
    id: "verificar_temperatura_cpu",
    description: "Tenta obter a temperatura da CPU via WMI.",
    command: 'Get-WmiObject MSAcpi_ThermalZoneTemperature -Namespace "root/wmi" | ForEach-Object { Write-Host "Zona: $($_.InstanceName) -> $(($_.CurrentTemperature - 2732)/10)°C" }',
  },
  diagnostico_completo: {
    id: "diagnostico_completo",
    description: "Executa um diagnóstico completo do PC: RAM, disco, rede, processos pesados e informações do sistema.",
    command: 'Write-Host "===== DIAGNÓSTICO COMPLETO =====" -ForegroundColor Cyan; Write-Host ""; Write-Host "--- RAM ---" -ForegroundColor Yellow; $ram = Get-WmiObject Win32_OperatingSystem; $livre = [math]::Round($ram.FreePhysicalMemory/1MB,2); $total = [math]::Round($ram.TotalVisibleMemorySize/1MB,2); Write-Host "RAM Livre: $livre GB de $total GB"; Write-Host ""; Write-Host "--- DISCO ---" -ForegroundColor Yellow; Get-PSDrive -PSProvider FileSystem | Select-Object Name,@{N="Usado(GB)";E={[math]::Round(($_.Used/1GB),2)}},@{N="Livre(GB)";E={[math]::Round(($_.Free/1GB),2)}} | Format-Table -AutoSize; Write-Host "--- TOP 10 PROCESSOS (RAM) ---" -ForegroundColor Yellow; Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 10 Name,@{N="RAM(MB)";E={[math]::Round($_.WorkingSet64/1MB,2)}} | Format-Table -AutoSize; Write-Host "--- REDE ---" -ForegroundColor Yellow; Test-Connection 8.8.8.8 -Count 1 -Quiet | ForEach-Object { if($_){Write-Host "Internet: OK" -ForegroundColor Green}else{Write-Host "Internet: SEM CONEXÃO" -ForegroundColor Red} }',
  },
  relatorio_rapido_pc: {
    id: "relatorio_rapido_pc",
    description: "Gera um relatório rápido do PC com Windows, uptime, RAM, disco C, top 10 processos e internet.",
    command: `Write-Host "===== RELATORIO RAPIDO DO PC =====" -ForegroundColor Cyan; $os=Get-WmiObject Win32_OperatingSystem; $cpu=Get-WmiObject Win32_Processor | Select-Object -First 1; $disk=Get-PSDrive C; $ramLivre=[math]::Round($os.FreePhysicalMemory/1MB,2); $ramTotal=[math]::Round($os.TotalVisibleMemorySize/1MB,2); $diskLivre=[math]::Round($disk.Free/1GB,2); $diskTotal=[math]::Round(($disk.Used+$disk.Free)/1GB,2); $boot=[Management.ManagementDateTimeConverter]::ToDateTime($os.LastBootUpTime); $uptime=New-TimeSpan -Start $boot -End (Get-Date); Write-Host "Computador: $env:COMPUTERNAME"; Write-Host "Windows: $($os.Caption) Build $($os.BuildNumber)"; Write-Host "CPU: $($cpu.Name)"; Write-Host "RAM: $ramLivre GB livre de $ramTotal GB"; Write-Host "Disco C: $diskLivre GB livre de $diskTotal GB"; Write-Host "Uptime: $($uptime.Days)d $($uptime.Hours)h"; Write-Host ""; Write-Host "Top 10 processos por RAM:" -ForegroundColor Yellow; Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 10 Name,@{N="RAM(MB)";E={[math]::Round($_.WorkingSet64/1MB,2)}} | Format-Table -AutoSize; Write-Host ""; if(Test-Connection 8.8.8.8 -Count 1 -Quiet){Write-Host "Internet: OK" -ForegroundColor Green}else{Write-Host "Internet: SEM CONEXAO" -ForegroundColor Red}`,
  },
  exportar_diagnostico: {
    id: "exportar_diagnostico",
    description: "Exporta um diagnóstico rápido para a pasta logs com nome diagnostico-YYYYMMDD-HHMMSS.txt.",
    command: `$project=$env:MESTRE_PROJETO_PATH; $logDir=Join-Path $project "logs"; New-Item -ItemType Directory -Force -Path $logDir | Out-Null; $file=Join-Path $logDir ("diagnostico-"+(Get-Date -Format "yyyyMMdd-HHmmss")+".txt"); $os=Get-WmiObject Win32_OperatingSystem; $disk=Get-PSDrive C; $top=Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 10 Name,@{N="RAM(MB)";E={[math]::Round($_.WorkingSet64/1MB,2)}} | Out-String; @("===== DIAGNOSTICO MESTRE DO PC =====","Data: $(Get-Date)","Computador: $env:COMPUTERNAME","Windows: $($os.Caption) Build $($os.BuildNumber)","RAM livre GB: $([math]::Round($os.FreePhysicalMemory/1MB,2))","Disco C livre GB: $([math]::Round($disk.Free/1GB,2))","",$top) | Set-Content -Path $file -Encoding UTF8; Write-Host "Diagnostico salvo em: $file" -ForegroundColor Green`,
  },
  listar_modelos_ollama: {
    id: "listar_modelos_ollama",
    description: "Lista modelos disponíveis no Ollama local e destaca modelos cloud no texto.",
    command: `try { $data=(Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -TimeoutSec 5); Write-Host "Modelos Ollama instalados:" -ForegroundColor Cyan; if(-not $data.models){ Write-Host "Nenhum modelo retornado pelo Ollama." -ForegroundColor Yellow } else { $data.models | ForEach-Object { $cloud=if($_.name -match "cloud"){ " [cloud]" } else { "" }; Write-Host ("- " + $_.name + $cloud) } } } catch { Write-Host "Ollama offline ou inacessivel em localhost:11434" -ForegroundColor Yellow; Write-Host $_.Exception.Message }`,
  },
  abrir_pasta_logs: {
    id: "abrir_pasta_logs",
    description: "Abre a pasta logs do MestreDoPC no Windows Explorer.",
    command: `$project=$env:MESTRE_PROJETO_PATH; $logDir=Join-Path $project "logs"; New-Item -ItemType Directory -Force -Path $logDir | Out-Null; Start-Process $logDir; Write-Host "Pasta de logs aberta: $logDir" -ForegroundColor Green`,
  },
  ver_tarefas_mestre: {
    id: "ver_tarefas_mestre",
    description: "Lista as tarefas agendadas MestreDoPC_Admin_Launcher e MestreDoPC_Startup, quando existirem.",
    command: `$names=@("MestreDoPC_Admin_Launcher","MestreDoPC_Startup"); $rows=foreach($name in $names){ $task=Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue; if($task){ $info=Get-ScheduledTaskInfo -TaskName $name -ErrorAction SilentlyContinue; [pscustomobject]@{Task=$name;State=$task.State;LastRun=$info.LastRunTime;LastResult=$info.LastTaskResult;NextRun=$info.NextRunTime} } else { [pscustomobject]@{Task=$name;State="Nao encontrada";LastRun="";LastResult="";NextRun=""} } }; $rows | Format-Table -AutoSize`,
  },
  git_status: {
    id: "git_status",
    description: "Executa 'git status' na pasta do projeto.",
    command: `Set-Location -LiteralPath $env:MESTRE_PROJETO_PATH; git status`,
  },
  git_pull: {
    id: "git_pull",
    description: "Executa 'git pull' na pasta do projeto.",
    command: `Set-Location -LiteralPath $env:MESTRE_PROJETO_PATH; git pull; Write-Host "\u2705 Repositório atualizado!" -ForegroundColor Green`,
  },
  verificar_defender: {
    id: "verificar_defender",
    description: "Verifica o status do Windows Defender.",
    command: "Get-MpComputerStatus | Select-Object AMRunningMode,AntivirusEnabled,RealTimeProtectionEnabled,AntivirusSignatureLastUpdated | Format-List",
  },
  scan_defender_rapido: {
    id: "scan_defender_rapido",
    description: "Executa um scan rápido no Defender.",
    command: 'Start-MpScan -ScanType QuickScan; Write-Host "✅ Scan rápido iniciado!" -ForegroundColor Green',
  },
};

// --- Model profiles (local automation desktop models) ---
let modelProfiles = { defaultProfile: "balanced", profiles: {} };
try {
  const profilesRaw = await readFile(join(__dirname, "model-profiles.json"), "utf8");
  modelProfiles = JSON.parse(profilesRaw);
} catch (e) {
  console.error("Aviso: nao foi possivel carregar model-profiles.json:", e.message);
}

const activeProfileName = process.env.OLLAMA_MODEL_PROFILE || modelProfiles.defaultProfile || "balanced";
const activeProfile = modelProfiles.profiles?.[activeProfileName] || modelProfiles.profiles?.[modelProfiles.defaultProfile] || {};

function getProfileModel(profile = activeProfile) {
  return process.env.OLLAMA_MODEL || profile.model || "qwen2.5-coder:3b-instruct";
}

function getProfileOptions(profile = activeProfile) {
  const envOptions = {
    num_ctx: OLLAMA_NUM_CTX,
    temperature: OLLAMA_TEMPERATURE,
    top_p: OLLAMA_TOP_P,
    top_k: OLLAMA_TOP_K,
    num_predict: OLLAMA_NUM_PREDICT,
    seed: OLLAMA_SEED,
  };
  const profileOptions = profile.options || {};
  const merged = { ...profileOptions, ...envOptions };
  // Remove valores que ainda sao defaults nao configurados (0 para seed/num_predict).
  if (merged.seed === 0) delete merged.seed;
  if (merged.num_predict === 0) delete merged.num_predict;
  return merged;
}

function listProfiles() {
  const entries = Object.entries(modelProfiles.profiles || {});
  return entries.map(([key, p]) => ({
    id: key,
    label: p.label || key,
    description: p.description || "",
    model: p.model || "",
    fallbackModel: p.fallbackModel || "",
    recommended: p.recommended || {},
    active: key === activeProfileName,
  }));
}

// --- Ollama configuration (local + cloud) ---
// Local:  http://127.0.0.1:11434  (no auth)
// Cloud:  https://ollama.com/api  (requires OLLAMA_API_KEY)
const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY || "";
const OLLAMA_URL = (process.env.OLLAMA_URL || (OLLAMA_API_KEY ? "https://ollama.com/api" : "http://127.0.0.1:11434")).replace(/\/+$/, "");
const OLLAMA_MODEL = getProfileModel();
const OLLAMA_NUM_CTX = parseInt(process.env.OLLAMA_NUM_CTX || (activeProfile.options?.num_ctx ?? "8192"), 10);
const OLLAMA_TEMPERATURE = parseFloat(process.env.OLLAMA_TEMPERATURE || (activeProfile.options?.temperature ?? "0.7"));
const OLLAMA_TOP_P = parseFloat(process.env.OLLAMA_TOP_P || (activeProfile.options?.top_p ?? "0.9"));
const OLLAMA_TOP_K = parseInt(process.env.OLLAMA_TOP_K || (activeProfile.options?.top_k ?? "40"), 10);
const OLLAMA_NUM_PREDICT = parseInt(process.env.OLLAMA_NUM_PREDICT || (activeProfile.options?.num_predict ?? "0"), 10);
const OLLAMA_SEED = parseInt(process.env.OLLAMA_SEED || "0", 10);
const OLLAMA_KEEP_ALIVE = process.env.OLLAMA_KEEP_ALIVE || "5m";
const OLLAMA_SYSTEM_PROMPT = `Você é o Mestre do PC, um assistente especializado em automação e manutenção de computadores Windows no desktop do usuário.
Responda SEMPRE em português brasileiro.
Priorize comandos PowerShell nativos do Windows e ferramentas já disponíveis no sistema (Get-Process, Get-Service, sfc, dism, ipconfig, netsh, wmic/CIM, etc).
Quando sugerir uma ação, inclua o comando PowerShell exato, comentado e seguro.
NUNCA invente comandos, caminhos de arquivo ou nomes de serviço. Use APENAS comandos PowerShell reais do Windows.
Para automação local, prefira comandos não destrutivos primeiro; só sugira ações destrutivas (limpar, parar serviços, encerrar processos) quando necessário e com confirmação.
Se o usuário pedir para analisar logs, identifique os 3 erros mais críticos, explique o impacto e sugira comandos sfc, dism ou Get-EventLog filtrados se necessário.
Seja direto, objetivo e organize a resposta em passos numerados quando for um procedimento.
Se não souber algo, diga claramente e sugira uma busca ou verificação manual.`;

/**
 * Build the default options object for Ollama requests from env-configured params.
 * Only includes non-default values to avoid overriding model defaults unnecessarily.
 */
function buildOllamaOptions() {
  const options = getProfileOptions();
  // Env vars têm precedência sobre o perfil.
  options.num_ctx = OLLAMA_NUM_CTX;
  if (OLLAMA_TEMPERATURE !== (activeProfile.options?.temperature ?? 0.7)) options.temperature = OLLAMA_TEMPERATURE;
  if (OLLAMA_TOP_P !== (activeProfile.options?.top_p ?? 0.9)) options.top_p = OLLAMA_TOP_P;
  if (OLLAMA_TOP_K !== (activeProfile.options?.top_k ?? 40)) options.top_k = OLLAMA_TOP_K;
  if (OLLAMA_NUM_PREDICT > 0) options.num_predict = OLLAMA_NUM_PREDICT;
  if (OLLAMA_SEED > 0) options.seed = OLLAMA_SEED;
  return options;
}

/**
 * Build headers for Ollama API requests, including auth when using cloud.
 */
function ollamaHeaders(extra = {}) {
  const headers = { "Content-Type": "application/json", ...extra };
  if (OLLAMA_API_KEY) {
    headers["Authorization"] = `Bearer ${OLLAMA_API_KEY}`;
  }
  return headers;
}

/**
 * Format Ollama response metadata (token counts, durations) for display.
 */
function formatOllamaMeta(data) {
  const parts = [];
  if (data.prompt_eval_count != null) parts.push(`prompt: ${data.prompt_eval_count} tokens`);
  if (data.eval_count != null) parts.push(`resposta: ${data.eval_count} tokens`);
  if (data.total_duration != null) {
    const ms = Math.round(data.total_duration / 1_000_000);
    if (ms > 0) parts.push(`${ms}ms`);
  }
  return parts.length > 0 ? `\n\n📊 ${parts.join(" | ")}` : "";
}

/**
 * Parse an Ollama API error response into a human-readable message.
 */
function parseOllamaError(res, fallback) {
  const status = res.status;
  const statusMessages = {
    400: "Requisição inválida (model ou prompt incorreto)",
    404: "Modelo não encontrado no Ollama",
    429: "Limite de requisições excedido (rate limit)",
    500: "Erro interno do Ollama",
    502: "Modelo cloud inacessível (bad gateway)",
  };
  let msg = statusMessages[status] || `HTTP ${status}`;
  try {
    const body = JSON.parse(fallback);
    if (body.error) msg = body.error;
  } catch { /* not JSON, use status-based message */ }
  return msg;
}

/**
 * Centralized Ollama chat call with error handling, options, and keep_alive.
 * @param {object} opts - { messages, system, timeoutMs, think }
 * @returns {Promise<{content: string, thinking: string, meta: string, raw: object}>}
 */
async function ollamaChat({ messages, system, timeoutMs = 60000, think }) {
  const body = {
    model: OLLAMA_MODEL,
    options: buildOllamaOptions(),
    keep_alive: OLLAMA_KEEP_ALIVE,
    messages: system
      ? [{ role: "system", content: system }, ...messages]
      : messages,
    stream: false,
  };
  if (think) body.think = think;

  const res = await fetch(OLLAMA_URL + "/api/chat", {
    method: "POST",
    headers: ollamaHeaders(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(parseOllamaError(res, text));
  }

  const data = await res.json();
  return {
    content: data.message?.content || "Sem resposta.",
    thinking: data.message?.thinking || "",
    meta: formatOllamaMeta(data),
    raw: data,
  };
}

/**
 * RAG (Retrieval-Augmented Generation) - Busca contexto em documentos locais.
 * @param {string} query - Consulta do usuário
 * @param {string[]} contextDocs - Array de documentos/contexto
 * @returns {Promise<string>} Resposta enriquecida com contexto
 */
async function ragQuery(query, contextDocs = []) {
  if (contextDocs.length === 0) {
    // Sem contexto, usa apenas o conhecimento do modelo
    return await ollamaChat({
      messages: [{ role: "user", content: query }],
      system: OLLAMA_SYSTEM_PROMPT,
      timeoutMs: 90000,
    });
  }

  // Constrói prompt com contexto
  const context = contextDocs
    .map((doc, i) => `[Contexto ${i + 1}]\n${doc}`)
    .join("\n\n");

  const enhancedPrompt = `Com base nestes documentos de contexto, responda à pergunta.
Se o contexto não for suficiente, use seu conhecimento geral mas mencione isso.

${context}

---
PERGUNTA: ${query}`;

  return await ollamaChat({
    messages: [{ role: "user", content: enhancedPrompt }],
    system: OLLAMA_SYSTEM_PROMPT,
    timeoutMs: 120000,
  });
}

/**
 * Chain-of-Thought - Divide problema complexo em passos
 * @param {string} problem - Problema a ser resolvido
 * @returns {Promise<{steps: string[], finalAnswer: string}>}
 */
async function chainOfThought(problem) {
  const step1 = await ollamaChat({
    messages: [{ role: "user", content: `Analise este problema e divida em passos lógicos: ${problem}` }],
    system: "Você é um especialista em resolução de problemas. Sempre responda em português do Brasil.",
    timeoutMs: 60000,
  });

  const step2 = await ollamaChat({
    messages: [
      { role: "user", content: `Com base nesta análise:\n${step1.content}\n\nExecute cada passo e forneça a solução final:` }
    ],
    system: OLLAMA_SYSTEM_PROMPT,
    timeoutMs: 90000,
  });

  return {
    steps: step1.content.split("\n").filter(s => s.trim()),
    finalAnswer: step2.content,
    thinking: step2.thinking || "",
  };
}

/**
 * Multi-model comparison - Compara respostas de diferentes modelos
 * @param {string} query - Pergunta
 * @param {string[]} models - Lista de modelos para comparar
 * @returns {Promise<object>} Respostas comparativas
 */
async function compareModels(query, models = [OLLAMA_MODEL, "llama3.1:8b", "mistral:7b"]) {
  const results = {};

  for (const model of models) {
    try {
      const res = await fetch(OLLAMA_URL + "/api/chat", {
        method: "POST",
        headers: ollamaHeaders(),
        body: JSON.stringify({
          model: model,
          messages: [{ role: "user", content: query }],
          stream: false,
        }),
        signal: AbortSignal.timeout(90000),
      });

      if (res.ok) {
        const data = await res.json();
        results[model] = {
          content: data.message?.content || "Sem resposta",
          success: true,
        };
      } else {
        results[model] = { success: false, error: parseOllamaError(res, "") };
      }
    } catch (e) {
      results[model] = { success: false, error: e.message };
    }
  }

  return results;
}

/**
 * Análise de código PowerShell com sugestões de melhoria
 * @param {string} code - Código PowerShell
 * @returns {Promise<{analysis: string, improvements: string[], securityNotes: string[]}>}
 */
async function analyzePowerShellCode(code) {
  const result = await ollamaChat({
    messages: [{
      role: "user",
      content: `Analise este código PowerShell e forneça:
1. Explicação do que o código faz
2. Sugestões de melhoria (performance, legibilidade)
3. Notas de segurança (riscos potenciais)

Código:
${code}`,
    }],
    system: "Você é um especialista em PowerShell e segurança Windows. Responda em português do Brasil.",
    timeoutMs: 90000,
  });

  return {
    analysis: result.content,
    thinking: result.thinking,
  };
}

/**
 * Enviar mensagem formatada para Discord webhook
 */
async function sendDiscordWebhook(webhookUrl, title, message, color = "00ff00") {
  // Auditoria
  await auditLog(AuditLevel.WEBHOOK, "discord_webhook_send", {
    title: title || "Mestre do PC - Notificação",
    messagePreview: message.substring(0, 100),
    color,
  });

  const embed = {
    title: title || "Mestre do PC - Notificação",
    description: message,
    color: parseInt(color, 16) || 0x00ff00,
    timestamp: new Date().toISOString(),
    footer: {
      text: "Mestre do PC V11",
      icon_url: "https://avatars.githubusercontent.com/u/123456789",
    },
  };

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ embeds: [embed] }),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    await auditLog(AuditLevel.ERROR, "discord_webhook_failed", {
      statusCode: res.status,
    });
    throw new Error(`Discord retornou HTTP ${res.status}`);
  }

  return { success: true, message: "Notificação enviada ao Discord" };
}

/**
 * Enviar mensagem formatada para Teams webhook
 */
async function sendTeamsWebhook(webhookUrl, title, message, theme = "Information") {
  const themeColors = {
    Information: "#0078D4",
    Warning: "#FFA500",
    Danger: "#DC3545",
    Success: "#28A745",
  };

  const body = {
    "@type": "MessageCard",
    "@context": "http://schema.org/extensions",
    themeColor: themeColors[theme] || themeColors.Information,
    summary: title || "Mestre do PC - Notificação",
    sections: [{
      activityTitle: title || "Mestre do PC",
      activitySubtitle: new Date().toLocaleString("pt-BR"),
      activityText: message.replace(/\n/g, "<br/>"),
    }],
  };

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    throw new Error(`Teams retornou HTTP ${res.status}`);
  }

  return { success: true, message: "Notificação enviada ao Teams" };
}

/**
 * Enviar mensagem formatada para Slack webhook
 */
async function sendSlackWebhook(webhookUrl, message, channel, emoji = ":robot_face:") {
  const body = {
    text: message,
    username: "Mestre do PC",
    icon_emoji: emoji,
  };

  if (channel && channel.startsWith("#")) {
    body.channel = channel;
  }

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    throw new Error(`Slack retornou HTTP ${res.status}`);
  }

  return { success: true, message: "Notificação enviada ao Slack" };
}

/**
 * Monitorar recursos e enviar alerta se ultrapassar limites
 */
async function monitorAndAlert(webhookUrl, cpuLimite = 80, ramLimite = 80, discoLimite = 90, plataforma = "discord") {
  const os = await fetch("http://127.0.0.1:7777/status", {
    signal: AbortSignal.timeout(5000),
  }).then(r => r.json()).catch(() => null);

  if (!os) {
    throw new Error("Não foi possível obter status do sistema. Launcher offline?");
  }

  const alerts = [];

  if (os.cpu > cpuLimite) {
    alerts.push(`⚠️ CPU: ${os.cpu}% (limite: ${cpuLimite}%)`);
  }
  if (os.ramFree !== undefined && os.ramTotal !== undefined) {
    const ramUsed = Math.round(((os.ramTotal - os.ramFree) / os.ramTotal) * 100);
    if (ramUsed > ramLimite) {
      alerts.push(`⚠️ RAM: ${ramUsed}% usada (limite: ${ramLimite}%)`);
    }
  }
  if (os.diskFree !== undefined && os.diskUsed !== undefined) {
    const diskTotal = os.diskFree + os.diskUsed;
    const diskUsed = Math.round((os.diskUsed / diskTotal) * 100);
    if (diskUsed > discoLimite) {
      alerts.push(`⚠️ Disco: ${diskUsed}% usado (limite: ${discoLimite}%)`);
    }
  }

  if (alerts.length === 0) {
    return { success: true, message: "Sistema dentro dos limites normais. Nenhum alerta necessário." };
  }

  const message = `**ALERTA - Mestre do PC**\nPC: ${process.env.COMPUTERNAME || "Desconhecido"}\n\n${alerts.join("\n")}\n\nData: ${new Date().toLocaleString("pt-BR")}`;

  switch (plataforma.toLowerCase()) {
    case "discord":
      return await sendDiscordWebhook(webhookUrl, "🚨 Alerta de Sistema", message, "ff0000");
    case "teams":
      return await sendTeamsWebhook(webhookUrl, "🚨 Alerta de Sistema", message, "Danger");
    case "slack":
      return await sendSlackWebhook(webhookUrl, `🚨 *Alerta de Sistema*\n${message}`, null, ":warning:");
    default:
      return await sendDiscordWebhook(webhookUrl, "🚨 Alerta de Sistema", message, "ff0000");
  }
}

const TOOLS = [
  ...Object.entries(mestreTools).map(([name, config]) => {
    const cmdStr = typeof config.command === "string" ? config.command : "";
    const matches = [...cmdStr.matchAll(/\{\{([A-Z_]+)\}\}/g)];
    const uniqueTokens = [...new Set(matches.map((m) => m[1]))];
    const properties = {};
    for (const token of uniqueTokens) {
      const key = token.toLowerCase();
      properties[key] = { type: "string", description: `Valor para ${token}` };
    }
    return {
      name,
      description: config.description,
      inputSchema: {
        type: "object",
        properties,
        required: uniqueTokens.map((t) => t.toLowerCase()),
      },
    };
  }),
  {
    name: "perguntar_ia",
    description: "Envia uma pergunta ao modelo de IA (Ollama local ou cloud) para obter sugestões de manutenção. Use para análise inteligente.",
    inputSchema: {
      type: "object",
      properties: {
        pergunta: { type: "string", description: "A pergunta ou problema do usuário sobre o PC." },
        usar_web: { type: "boolean", description: "Se true, faz uma busca na web antes e envia os resultados como contexto para a IA." },
        pensar: { type: "boolean", description: "Se true, ativa modo de raciocínio (thinking) para modelos compatíveis (ex: gpt-oss, deepseek-r1)." },
      },
      required: ["pergunta"],
    },
  },
  {
    name: "analisar_logs_sistema",
    description: "Coleta os últimos 20 erros do Event Viewer e os envia para a IA local resumir os problemas mais graves.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "verificar_modelo_ollama",
    description: "Verifica se o modelo Ollama configurado está disponível (local ou cloud) e tenta baixá-lo se necessário (apenas local).",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "listar_perfis_modelo",
    description: "Lista os perfis de modelos locais recomendados para automação do desktop (rápido, equilibrado, agente, código, raciocínio).",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "definir_perfil_modelo",
    description: "Define o perfil de modelo ativo para as próximas chamadas da IA. Requer reiniciar o MCP server para aplicar totalmente; retorna as variáveis de ambiente sugeridas.",
    inputSchema: {
      type: "object",
      properties: {
        perfil: { type: "string", description: "ID do perfil (fast, balanced, agent, coding, reasoning)." },
      },
      required: ["perfil"],
    },
  },
  {
    name: "verificar_prompt",
    description: "Analisa um prompt em busca de tentativas de prompt injection, jailbreak ou conteúdo malicioso. Retorna classificação e score.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "O texto do prompt a ser analisado." },
      },
      required: ["prompt"],
    },
  },
  {
    name: "buscar_na_web",
    description: "Busca na web usando DuckDuckGo e retorna titulo, URL e trecho dos resultados. Use para obter informacoes atualizadas.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Termo de busca." },
        max_results: { type: "number", description: "Quantidade maxima de resultados (padrao 5, maximo 10)." },
      },
      required: ["query"],
    },
  },
  {
    name: "perguntar_ia_com_contexto",
    description: "Envia uma pergunta à IA com contexto adicional (RAG). Útil para analisar documentos, logs ou códigos junto com a pergunta.",
    inputSchema: {
      type: "object",
      properties: {
        pergunta: { type: "string", description: "A pergunta principal." },
        contexto: { type: "string", description: "Texto de contexto (logs, código, documento) para enriquecer a resposta." },
      },
      required: ["pergunta"],
    },
  },
  {
    name: "resolver_problema_passo_a_passo",
    description: "Usa chain-of-thought para dividir um problema complexo em passos lógicos e fornecer solução detalhada.",
    inputSchema: {
      type: "object",
      properties: {
        problema: { type: "string", description: "Descrição do problema a ser resolvido." },
      },
      required: ["problema"],
    },
  },
  {
    name: "comparar_modelos_ia",
    description: "Compara respostas de múltiplos modelos de IA para a mesma pergunta. Útil para validar consistência.",
    inputSchema: {
      type: "object",
      properties: {
        pergunta: { type: "string", description: "Pergunta para comparar entre modelos." },
        modelos: { type: "string", description: "Lista de modelos separados por vírgula (ex: qwen2.5-coder:3b,llama3.1:8b,mistral:7b)." },
      },
      required: ["pergunta"],
    },
  },
  {
    name: "analisar_codigo_powershell",
    description: "Analisa um script PowerShell e fornece explicação, sugestões de melhoria e notas de segurança.",
    inputSchema: {
      type: "object",
      properties: {
        codigo: { type: "string", description: "Código PowerShell para análise." },
      },
      required: ["codigo"],
    },
  },
  {
    name: "ia_comando_sugerir",
    description: "Descreva uma tarefa e a IA sugere o comando PowerShell exato para executá-la.",
    inputSchema: {
      type: "object",
      properties: {
        tarefa: { type: "string", description: "Descrição da tarefa (ex: 'listar processos usando mais de 1GB de RAM')." },
        confirmar: { type: "boolean", description: "Se true, pede confirmação antes de executar." },
      },
      required: ["tarefa"],
    },
  },
  {
    name: "enviar_webhook_discord",
    description: "Envia uma mensagem formatada para um webhook do Discord. Útil para notificações e alertas.",
    inputSchema: {
      type: "object",
      properties: {
        webhook_url: { type: "string", description: "URL do webhook do Discord." },
        titulo: { type: "string", description: "Título da mensagem." },
        mensagem: { type: "string", description: "Conteúdo da mensagem." },
        cor: { type: "string", description: "Cor do embed em hexadecimal (ex: 00ff00 para verde)." },
      },
      required: ["webhook_url", "mensagem"],
    },
  },
  {
    name: "enviar_webhook_teams",
    description: "Envia uma mensagem formatada para um webhook do Microsoft Teams.",
    inputSchema: {
      type: "object",
      properties: {
        webhook_url: { type: "string", description: "URL do webhook do Teams." },
        titulo: { type: "string", description: "Título da mensagem." },
        mensagem: { type: "string", description: "Conteúdo da mensagem." },
        tema: { type: "string", description: "Tema de cor (Information, Warning, Danger)." },
      },
      required: ["webhook_url", "mensagem"],
    },
  },
  {
    name: "enviar_webhook_slack",
    description: "Envia uma mensagem formatada para um webhook do Slack.",
    inputSchema: {
      type: "object",
      properties: {
        webhook_url: { type: "string", description: "URL do webhook do Slack (https://hooks.slack.com/...)." },
        canal: { type: "string", description: "Canal para enviar (ex: #geral)." },
        mensagem: { type: "string", description: "Conteúdo da mensagem." },
        emoji: { type: "string", description: "Emoji do bot (ex: :robot_face:)." },
      },
      required: ["webhook_url", "mensagem"],
    },
  },
  {
    name: "monitorar_e_notificar",
    description: "Monitora CPU, RAM e disco e envia alerta via webhook se ultrapassar limites.",
    inputSchema: {
      type: "object",
      properties: {
        webhook_url: { type: "string", description: "URL do webhook para alertas." },
        cpu_limite: { type: "number", description: "Limite de CPU em porcentagem (padrão: 80)." },
        ram_limite: { type: "number", description: "Limite de RAM em porcentagem (padrão: 80)." },
        disco_limite: { type: "number", description: "Limite de disco em porcentagem (padrão: 90)." },
        plataforma: { type: "string", description: "Plataforma do webhook (discord, teams, slack)." },
      },
      required: ["webhook_url"],
    },
  },
  {
    name: "consultar_logs_auditoria",
    description: "Consulta logs de auditoria do MCP server. Útil para investigar operações recentes.",
    inputSchema: {
      type: "object",
      properties: {
        level: { type: "string", description: "Filtrar por nível (INFO, WARNING, ERROR, SECURITY, COMMAND_EXEC, IA_OPERATION, WEBHOOK)." },
        action: { type: "string", description: "Filtrar por ação (termo de busca)." },
        limit: { type: "number", description: "Máximo de entradas (padrão: 50)." },
      },
      required: [],
    },
  },
  {
    name: "exportar_relatorio_auditoria",
    description: "Exporta relatório completo de auditoria em formato Markdown.",
    inputSchema: {
      type: "object",
      properties: {
        start_date: { type: "string", description: "Data inicial (ISO format)." },
        end_date: { type: "string", description: "Data final (ISO format)." },
        limit: { type: "number", description: "Máximo de entradas (padrão: 100)." },
      },
      required: [],
    },
  },
  {
    name: "consultar_fonte_oficial_gov",
    description: "Extrai tabelas ou textos de uma URL, mas a requisição falhará se o domínio não for gov.br, usp.br ou embrapa.br.",
    inputSchema: {
      type: "object",
      properties: {
        url_alvo: { type: "string", description: "A URL exata do órgão oficial contendo os dados." },
        seletor_css: { type: "string", description: "(Opcional) Tabela ou div específica para extrair." },
      },
      required: ["url_alvo"],
    },
  },
  {
    name: "extrair_evidencia_de_pdf_local",
    description: "Busca menções a um termo específico dentro de um PDF já validado e listado no fontes_mestre.csv.",
    inputSchema: {
      type: "object",
      properties: {
        id_fonte: { type: "string", description: "ID da fonte, ex: FON-0012." },
        termo_de_busca: { type: "string", description: "Palavra-chave ou conceito a procurar no PDF." },
        contexto_linhas: { type: "integer", description: "Linhas antes/depois do termo (máx 5)." },
      },
      required: ["id_fonte", "termo_de_busca"],
    },
  },
  {
    name: "simular_cenario_economico",
    description: "Injeta premissas no modelo matemático oficial do projeto para calcular impacto econômico.",
    inputSchema: {
      type: "object",
      properties: {
        tamanho_rebanho: { type: "number", description: "Tamanho total do rebanho." },
        prevalencia_pct: { type: "number", description: "% do rebanho afetado (ex: 5.5)" },
        perda_arroba_por_animal: { type: "number", description: "Perda de arrobas por animal afetado." },
        preco_arroba_brl: { type: "number", description: "Preço da arroba em BRL." },
      },
      required: ["tamanho_rebanho", "prevalencia_pct", "perda_arroba_por_animal", "preco_arroba_brl"],
    },
  },
  {
    name: "congelar_tabela_final",
    description: "Altera permissões do SO para 'Somente Leitura' de um CSV já aprovado, impedindo edições acidentais.",
    inputSchema: {
      type: "object",
      properties: {
        nome_tabela: { type: "string", description: "Nome do CSV em 02_DADOS/03_final/" },
        approval_id: { type: "string", description: "Token de aprovação humano." },
      },
      required: ["nome_tabela", "approval_id"],
    },
  },
  {
    name: "gerar_snapshot_git",
    description: "Executa git commit automatizado para registrar um marco do projeto.",
    inputSchema: {
      type: "object",
      properties: {
        mensagem_commit: { type: "string", description: "Mensagem clara do que foi concluído." },
        fase_cronograma: { type: "string", description: "Fase atingida (ex: F2, F3)." },
      },
      required: ["mensagem_commit"],
    },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "verificar_modelo_ollama") {
    try {
      const res = await fetch(OLLAMA_URL + "/api/tags", {
        headers: ollamaHeaders(),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return { isError: true, content: [{ type: "text", text: `Erro ao listar modelos: ${parseOllamaError(res, text)}` }] };
      }
      const data = await res.json();
      const hasModel = data.models?.some((m) => (m.name || m.model) === OLLAMA_MODEL);
      const isCloud = OLLAMA_URL.includes("ollama.com");
      if (hasModel) {
        const detail = data.models.find((m) => (m.name || m.model) === OLLAMA_MODEL);
        const sizeInfo = detail?.size ? ` (${Math.round(detail.size / 1_000_000)}MB)` : "";
        return { content: [{ type: "text", text: `✅ Modelo ${OLLAMA_MODEL} encontrado${sizeInfo}${isCloud ? " [cloud]" : ""} e pronto para uso.` }] };
      }
      if (isCloud) {
        return { content: [{ type: "text", text: `ℹ️ Modelo ${OLLAMA_MODEL} não listado localmente (modo cloud). Modelos cloud são acessados sob demanda.` }] };
      }
      void fetch(OLLAMA_URL + "/api/pull", {
        method: "POST",
        headers: ollamaHeaders(),
        body: JSON.stringify({ name: OLLAMA_MODEL, stream: false }),
      });
      return { content: [{ type: "text", text: `🟡 Modelo ${OLLAMA_MODEL} não encontrado. Solicitação de download enviada ao Ollama. Isso pode demorar.` }] };
    } catch (e) {
      const isCloud = OLLAMA_URL.includes("ollama.com");
      const hint = isCloud
        ? "Verifique se OLLAMA_API_KEY está configurada corretamente."
        : "Verifique se 'ollama serve' está rodando.";
      return { isError: true, content: [{ type: "text", text: `Erro ao conectar ao Ollama em ${OLLAMA_URL}. ${hint} Detalhe: ${e.message}` }] };
    }
  }

  if (name === "listar_perfis_modelo") {
    const profiles = listProfiles();
    const lines = [
      `🤖 Perfis de modelo locais (ativo: ${activeProfileName} -> ${OLLAMA_MODEL})`,
      "",
      ...profiles.map((p) => {
        const indicator = p.active ? "▶ " : "  ";
        const fallback = p.fallbackModel ? ` (fallback: ${p.fallbackModel})` : "";
        const ram = p.recommended?.minRamGB ? ` | RAM mínima: ${p.recommended.minRamGB}GB` : "";
        return `${indicator}${p.label} [${p.id}]\n   Modelo: ${p.model}${fallback}${ram}\n   ${p.description}`;
      }),
      "",
      "Para trocar de perfil, defina a variável de ambiente OLLAMA_MODEL_PROFILE e reinicie o MCP server.",
      "Exemplo: $env:OLLAMA_MODEL_PROFILE=\"agent\"",
    ];
    return { content: [{ type: "text", text: lines.join("\n") }] };
  }

  if (name === "definir_perfil_modelo") {
    const perfil = args?.perfil;
    if (!perfil || typeof perfil !== "string") {
      throw new McpError(ErrorCode.InvalidParams, "Parâmetro 'perfil' obrigatório.");
    }
    const profile = modelProfiles.profiles?.[perfil];
    if (!profile) {
      const available = Object.keys(modelProfiles.profiles || {}).join(", ");
      return { isError: true, content: [{ type: "text", text: `Perfil '${perfil}' não encontrado. Disponíveis: ${available}` }] };
    }
    const lines = [
      `✅ Perfil '${perfil}' (${profile.label}) selecionado.`,
      "",
      "Aplique as variáveis de ambiente abaixo e reinicie o MCP server para usar este perfil:",
      `  $env:OLLAMA_MODEL_PROFILE="${perfil}"`,
      `  $env:OLLAMA_MODEL="${profile.model}"`,
    ];
    if (profile.fallbackModel) {
      lines.push(`  # Fallback caso ${profile.model} não esteja instalado:`);
      lines.push(`  # $env:OLLAMA_MODEL="${profile.fallbackModel}"`);
    }
    return { content: [{ type: "text", text: lines.join("\n") }] };
  }

  if (name === "verificar_prompt") {
    const promptText = args?.prompt;
    if (!promptText) throw new McpError(ErrorCode.InvalidParams, "Parametro 'prompt' obrigatorio.");
    const result = checkPromptInjection(promptText);
    let icon = "✅";
    if (result.classification === "suspeito") icon = "🟡";
    if (result.classification === "malicioso") icon = "🔴";
    const lines = [
      `${icon} Classificacao: ${result.classification.toUpperCase()}`,
      ...result.details,
    ];
    return { content: [{ type: "text", text: lines.join("\n") }] };
  }

  if (name === "buscar_na_web") {
    const query = args?.query;
    if (!query || typeof query !== "string") {
      throw new McpError(ErrorCode.InvalidParams, "Parametro 'query' obrigatorio.");
    }
    const maxResults = Math.min(Math.max(1, Math.floor(Number(args?.max_results) || 5)), 10);
    try {
      const results = await searchWeb(query, maxResults);
      if (results.length === 0) {
        return { content: [{ type: "text", text: "Nenhum resultado encontrado para a busca." }] };
      }
      const lines = [`🔎 Resultados para: ${query}`, ""];
      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        lines.push(`${i + 1}. ${r.title}`);
        lines.push(`   URL: ${r.url}`);
        if (r.snippet) lines.push(`   ${r.snippet}`);
        lines.push("");
      }
      return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (e) {
      return { isError: true, content: [{ type: "text", text: `Falha na busca: ${e.message}` }] };
    }
  }

  if (name === "analisar_logs_sistema") {
    try {
      const logCmd = "Get-EventLog -LogName System -EntryType Error -Newest 20 | Select-Object TimeGenerated,Source,Message | ConvertTo-Json";
      const dataLogs = await executeLauncherCommand(logCmd, { timeoutMs: 300000 });
      if (!dataLogs.success) throw new Error(dataLogs.output);
      const prompt = `Aqui estão os últimos 20 erros do Windows (JSON). Resuma os 3 problemas mais críticos e sugira comandos para resolvê-los:\n\n${dataLogs.output}`;
      const result = await ollamaChat({
        messages: [{ role: "user", content: prompt }],
        system: OLLAMA_SYSTEM_PROMPT,
        timeoutMs: 60000,
      });
      let text = result.content;
      if (result.thinking) text = `💭 Raciocínio:\n${result.thinking}\n\n---\n\n${text}`;
      return { content: [{ type: "text", text: text + result.meta }] };
    } catch (e) {
      if (e.name === "AbortError" || e.name === "TimeoutError") {
        return { isError: true, content: [{ type: "text", text: "⏱️ Timeout ao analisar logs (60s). Ollama pode estar sobrecarregado." }] };
      }
      return { isError: true, content: [{ type: "text", text: "Falha na análise: " + e.message }] };
    }
  }

  if (name === "perguntar_ia") {
    const pergunta = args?.pergunta;
    if (!pergunta) throw new McpError(ErrorCode.InvalidParams, "Parâmetro 'pergunta' obrigatório.");
    try {
      let context = "";
      if (args?.usar_web === true) {
        try {
          const webResults = await searchWeb(pergunta, 3);
          if (webResults.length > 0) {
            context = "Aqui estão resultados da web para contextualizar:\n\n" +
              webResults.map((r, i) => `${i + 1}. ${r.title}\nURL: ${r.url}\n${r.snippet}`).join("\n\n") +
              "\n\nCom base nisso e em seu conhecimento, responda:\n";
          }
        } catch (e) {
          context = `A busca na web falhou: ${e.message}. Responda com base no conhecimento local.\n\n`;
        }
      }
      const result = await ollamaChat({
        messages: [{ role: "user", content: context + pergunta }],
        system: OLLAMA_SYSTEM_PROMPT,
        timeoutMs: 60000,
        think: args?.pensar === true ? true : undefined,
      });
      let text = result.content;
      if (result.thinking) text = `💭 Raciocínio:\n${result.thinking}\n\n---\n\n${text}`;
      return { content: [{ type: "text", text: text + result.meta }] };
    } catch (error) {
      if (error.name === "AbortError" || error.name === "TimeoutError") {
        return { isError: true, content: [{ type: "text", text: "⏱️ Timeout: Ollama demorou mais de 60s para responder. Tente novamente." }] };
      }
      return { isError: true, content: [{ type: "text", text: `Falha no Ollama: ${error.message}` }] };
    }
  }

  // ===== NOVAS FERRAMENTAS IA V11 =====

  if (name === "perguntar_ia_com_contexto") {
    const pergunta = args?.pergunta;
    const contexto = args?.contexto;
    if (!pergunta) throw new McpError(ErrorCode.InvalidParams, "Parâmetro 'pergunta' obrigatório.");
    
    try {
      const contextDocs = contexto ? [contexto] : [];
      const result = await ragQuery(pergunta, contextDocs);
      let text = result.content;
      if (result.thinking) text = `💭 Raciocínio:\n${result.thinking}\n\n---\n\n${text}`;
      return { content: [{ type: "text", text: text + result.meta }] };
    } catch (error) {
      if (error.name === "AbortError" || error.name === "TimeoutError") {
        return { isError: true, content: [{ type: "text", text: "⏱️ Timeout: IA demorou mais de 90s. Tente novamente." }] };
      }
      return { isError: true, content: [{ type: "text", text: `Falha: ${error.message}` }] };
    }
  }

  if (name === "resolver_problema_passo_a_passo") {
    const problema = args?.problema;
    if (!problema) throw new McpError(ErrorCode.InvalidParams, "Parâmetro 'problema' obrigatório.");
    
    try {
      const result = await chainOfThought(problema);
      const lines = [
        "🔍 **Análise do Problema**",
        "",
        ...result.steps.map((s, i) => `${i + 1}. ${s}`),
        "",
        "✅ **Solução Final**",
        result.finalAnswer,
      ];
      if (result.thinking) {
        lines.unshift("💭 **Raciocínio**", result.thinking, "");
      }
      return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (error) {
      return { isError: true, content: [{ type: "text", text: `Falha: ${error.message}` }] };
    }
  }

  if (name === "comparar_modelos_ia") {
    const pergunta = args?.pergunta;
    if (!pergunta) throw new McpError(ErrorCode.InvalidParams, "Parâmetro 'pergunta' obrigatório.");
    
    const modelosStr = args?.modelos || "qwen2.5-coder:3b-instruct,llama3.1:8b,mistral:7b";
    const modelos = modelosStr.split(",").map(m => m.trim()).filter(m => m);
    
    try {
      const results = await compareModels(pergunta, modelos);
      const lines = [`📊 **Comparação de Modelos**`, ``, `*Pergunta:* ${pergunta}`, ``];
      
      for (const [model, result] of Object.entries(results)) {
        lines.push(`---`);
        lines.push(`🤖 **${model}**`);
        if (result.success) {
          lines.push(result.content.substring(0, 500) + (result.content.length > 500 ? "..." : ""));
        } else {
          lines.push(`❌ Erro: ${result.error}`);
        }
        lines.push(``);
      }
      
      return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (error) {
      return { isError: true, content: [{ type: "text", text: `Falha: ${error.message}` }] };
    }
  }

  if (name === "analisar_codigo_powershell") {
    const codigo = args?.codigo;
    if (!codigo) throw new McpError(ErrorCode.InvalidParams, "Parâmetro 'codigo' obrigatório.");
    
    try {
      const result = await analyzePowerShellCode(codigo);
      const lines = ["🔍 **Análise de Código PowerShell**", "", result.analysis];
      if (result.thinking) {
        lines.unshift("💭 **Raciocínio**", result.thinking, "");
      }
      return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (error) {
      return { isError: true, content: [{ type: "text", text: `Falha: ${error.message}` }] };
    }
  }

  if (name === "ia_comando_sugerir") {
    const tarefa = args?.tarefa;
    if (!tarefa) throw new McpError(ErrorCode.InvalidParams, "Parâmetro 'tarefa' obrigatório.");
    
    try {
      const result = await ollamaChat({
        messages: [{
          role: "user",
          content: `Descreva APENAS o comando PowerShell exato para esta tarefa (sem explicações, apenas o comando):
          
Tarefa: ${tarefa}

Responda apenas com o comando PowerShell, nada mais.`,
        }],
        system: "Você é um especialista em PowerShell. Responda APENAS com o comando, sem explicações.",
        timeoutMs: 60000,
      });
      
      const comando = result.content.trim();
      const lines = [
        "💡 **Comando Sugerido**",
        "",
        "```powershell",
        comando,
        "```",
        "",
        "⚠️ **Importante:** Revise o comando antes de executar. Use 'executar_comando' para rodar este script.",
      ];
      
      return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (error) {
      return { isError: true, content: [{ type: "text", text: `Falha: ${error.message}` }] };
    }
  }

  // ===== NOVAS FERRAMENTAS WEBHOOK V11 =====

  if (name === "enviar_webhook_discord") {
    const webhook_url = args?.webhook_url;
    const mensagem = args?.mensagem;
    if (!webhook_url || !mensagem) {
      throw new McpError(ErrorCode.InvalidParams, "Parâmetros 'webhook_url' e 'mensagem' obrigatórios.");
    }
    
    try {
      const result = await sendDiscordWebhook(webhook_url, args?.titulo, mensagem, args?.cor);
      return { content: [{ type: "text", text: `✅ ${result.message}` }] };
    } catch (error) {
      return { isError: true, content: [{ type: "text", text: `Falha ao enviar: ${error.message}` }] };
    }
  }

  if (name === "enviar_webhook_teams") {
    const webhook_url = args?.webhook_url;
    const mensagem = args?.mensagem;
    if (!webhook_url || !mensagem) {
      throw new McpError(ErrorCode.InvalidParams, "Parâmetros 'webhook_url' e 'mensagem' obrigatórios.");
    }
    
    try {
      const result = await sendTeamsWebhook(webhook_url, args?.titulo, mensagem, args?.tema);
      return { content: [{ type: "text", text: `✅ ${result.message}` }] };
    } catch (error) {
      return { isError: true, content: [{ type: "text", text: `Falha ao enviar: ${error.message}` }] };
    }
  }

  if (name === "enviar_webhook_slack") {
    const webhook_url = args?.webhook_url;
    const mensagem = args?.mensagem;
    if (!webhook_url || !mensagem) {
      throw new McpError(ErrorCode.InvalidParams, "Parâmetros 'webhook_url' e 'mensagem' obrigatórios.");
    }
    
    try {
      const result = await sendSlackWebhook(webhook_url, mensagem, args?.canal, args?.emoji);
      return { content: [{ type: "text", text: `✅ ${result.message}` }] };
    } catch (error) {
      return { isError: true, content: [{ type: "text", text: `Falha ao enviar: ${error.message}` }] };
    }
  }

  if (name === "monitorar_e_notificar") {
    const webhook_url = args?.webhook_url;
    if (!webhook_url) {
      throw new McpError(ErrorCode.InvalidParams, "Parâmetro 'webhook_url' obrigatório.");
    }
    
    try {
      const result = await monitorAndAlert(
        webhook_url,
        args?.cpu_limite || 80,
        args?.ram_limite || 80,
        args?.disco_limite || 90,
        args?.plataforma || "discord"
      );
      return { content: [{ type: "text", text: `✅ ${result.message}` }] };
    } catch (error) {
      return { isError: true, content: [{ type: "text", text: `Falha: ${error.message}` }] };
    }
  }

  // ===== FIM NOVAS FERRAMENTAS WEBHOOK V11 =====

  if (name === "consultar_logs_auditoria") {
    try {
      const entries = await queryAuditLog({
        level: args?.level,
        action: args?.action,
        limit: args?.limit || 50,
      });
      
      if (entries.length === 0) {
        return { content: [{ type: "text", text: "📝 Nenhum log de auditoria encontrado." }] };
      }
      
      const lines = [`📋 **Logs de Auditoria** (${entries.length} entradas)`, ""];
      for (const entry of entries) {
        const icon = entry.level === AuditLevel.ERROR ? "🔴" :
                     entry.level === AuditLevel.WARNING ? "🟡" :
                     entry.level === AuditLevel.SECURITY ? "🔴" : "🟢";
        lines.push(`${icon} [${entry.level}] ${entry.action}`);
        lines.push(`   🕐 ${new Date(entry.timestamp).toLocaleString("pt-BR")}`);
        lines.push(`   👤 Usuário: ${entry.userId}`);
        lines.push("");
      }
      
      return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (error) {
      return { isError: true, content: [{ type: "text", text: `Falha: ${error.message}` }] };
    }
  }

  if (name === "exportar_relatorio_auditoria") {
    try {
      const { exportAuditReport } = await import("./audit-logger.js");
      const report = await exportAuditReport({
        startDate: args?.start_date,
        endDate: args?.end_date,
        limit: args?.limit || 100,
      });
      
      return { content: [{ type: "text", text: report }] };
    } catch (error) {
      return { isError: true, content: [{ type: "text", text: `Falha: ${error.message}` }] };
    }
  }

  // ===== FIM NOVAS FERRAMENTAS AUDITORIA V11 =====

  // ===== NOVOS TOOLS V11.1 =====

  if (name === "consultar_fonte_oficial_gov") {
    const urlAlvo = args?.url_alvo;
    if (!urlAlvo || typeof urlAlvo !== "string") {
      throw new McpError(ErrorCode.InvalidParams, "Parâmetro 'url_alvo' obrigatório.");
    }
    if (!isAllowedGovDomain(urlAlvo)) {
      await auditLog(AuditLevel.SECURITY, "consultar_fonte_oficial_gov_blocked", { url: urlAlvo });
      return {
        isError: true,
        content: [{ type: "text", text: `🚫 Domínio não permitido. Apenas fontes oficiais são aceitas: ${ALLOWED_GOV_DOMAINS.join(", ")}` }],
      };
    }
    try {
      const res = await fetch(urlAlvo, {
        headers: { "User-Agent": "MestreDoPC-V11/1.0", "Accept-Language": "pt-BR,pt;q=0.9" },
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) {
        return { isError: true, content: [{ type: "text", text: `Erro HTTP ${res.status} ao acessar ${urlAlvo}` }] };
      }
      const html = await res.text();
      const text = stripHtml(html);
      const maxChars = 5000;
      const truncated = text.length > maxChars ? text.slice(0, maxChars) + "\n\n[... truncado ...]" : text;
      await auditLog(AuditLevel.INFO, "consultar_fonte_oficial_gov_success", { url: urlAlvo, chars: text.length });
      return {
        content: [{ type: "text", text: `📄 Conteúdo extraído de ${urlAlvo}:\n\n${truncated}` }],
      };
    } catch (e) {
      return { isError: true, content: [{ type: "text", text: `Falha ao acessar fonte oficial: ${e.message}` }] };
    }
  }

  if (name === "extrair_evidencia_de_pdf_local") {
    const idFonte = args?.id_fonte;
    const termoBusca = args?.termo_de_busca;
    if (!idFonte || !termoBusca) {
      throw new McpError(ErrorCode.InvalidParams, "Parâmetros 'id_fonte' e 'termo_de_busca' são obrigatórios.");
    }
    try {
      const fontes = await loadFontesMestreCsv();
      const fonte = fontes.find((f) => f.id_fonte === idFonte);
      if (!fonte) {
        return { isError: true, content: [{ type: "text", text: `❌ Fonte '${idFonte}' não encontrada no fontes_mestre.csv. Fontes cadastradas: ${fontes.map((f) => f.id_fonte).join(", ") || "nenhuma"}` }] };
      }
      const pdfPath = fonte.caminho ? resolve(MESTRE_PROJETO_PATH, fonte.caminho) : join(PDF_BASE_DIR, `${idFonte}.pdf`);
      if (!existsSync(pdfPath)) {
        return { isError: true, content: [{ type: "text", text: `❌ PDF não encontrado em: ${pdfPath}` }] };
      }
      const contextoLinhas = args?.contexto_linhas || 3;
      const matches = await extractTextFromPdf(pdfPath, termoBusca, contextoLinhas);
      await auditLog(AuditLevel.INFO, "extrair_evidencia_de_pdf_local", { idFonte, termo: termoBusca, matches: matches.length });
      if (matches.length === 0) {
        return { content: [{ type: "text", text: `ℹ️ Termo '${termoBusca}' não encontrado no PDF ${idFonte}.` }] };
      }
      const lines = [`📖 ${matches.length} ocorrência(s) de '${termoBusca}' em ${idFonte}:\n`];
      for (let i = 0; i < matches.length; i++) {
        lines.push(`--- Ocorrência ${i + 1} (linha ${matches[i].line}) ---`);
        lines.push(matches[i].snippet);
        lines.push("");
      }
      return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (e) {
      return { isError: true, content: [{ type: "text", text: `Falha ao extrair evidência do PDF: ${e.message}` }] };
    }
  }

  if (name === "simular_cenario_economico") {
    const tamanhoRebanho = Number(args?.tamanho_rebanho);
    const prevalenciaPct = Number(args?.prevalencia_pct);
    const perdaArroba = Number(args?.perda_arroba_por_animal);
    const precoArroba = Number(args?.preco_arroba_brl);
    if (!tamanhoRebanho || !prevalenciaPct || !perdaArroba || !precoArroba) {
      throw new McpError(ErrorCode.InvalidParams, "Todos os parâmetros numéricos são obrigatórios.");
    }
    try {
      const scriptPath = join(MESTRE_PROJETO_PATH, "03_ANALISE", "scripts", "03_modelo_perdas.py");
      if (existsSync(scriptPath)) {
        const result = await runChildProcess("python", [
          scriptPath,
          String(tamanhoRebanho),
          String(prevalenciaPct),
          String(perdaArroba),
          String(precoArroba),
        ], { timeoutMs: 30000 });
        if (result.code !== 0) {
          return { isError: true, content: [{ type: "text", text: `Erro no script Python: ${result.stderr || result.stdout}` }] };
        }
        await auditLog(AuditLevel.INFO, "simular_cenario_economico_script", { exitCode: result.code });
        return { content: [{ type: "text", text: `📊 Resultado da simulação (script oficial):\n\n${result.stdout}` }] };
      }
      const animaisAfetados = Math.round(tamanhoRebanho * (prevalenciaPct / 100));
      const perdaTotalArrobas = animaisAfetados * perdaArroba;
      const perdaFinanceiraBRL = perdaTotalArrobas * precoArroba;
      const resumo = [
        "📊 SIMULAÇÃO DE CENÁRIO ECONÔMICO",
        "=====================================",
        `Tamanho do rebanho: ${tamanhoRebanho.toLocaleString("pt-BR")} animais`,
        `Prevalência: ${prevalenciaPct}% (${animaisAfetados.toLocaleString("pt-BR")} animais afetados)`,
        `Perda por animal: ${perdaArroba} arrobas`,
        `Perda total: ${perdaTotalArrobas.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} arrobas`,
        `Preço da arroba: R$ ${precoArroba.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
        `IMPACTO FINANCEIRO TOTAL: R$ ${perdaFinanceiraBRL.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        "",
        "⚠️ Cálculo feito em modo fallback (script Python oficial não encontrado).",
        `   Esperado em: ${scriptPath}`,
      ];
      await auditLog(AuditLevel.INFO, "simular_cenario_economico_fallback", { tamanhoRebanho, prevalenciaPct, perdaFinanceiraBRL });
      return { content: [{ type: "text", text: resumo.join("\n") }] };
    } catch (e) {
      return { isError: true, content: [{ type: "text", text: `Falha na simulação: ${e.message}` }] };
    }
  }

  if (name === "congelar_tabela_final") {
    const nomeTabela = args?.nome_tabela;
    const approvalId = args?.approval_id;
    if (!nomeTabela || !approvalId) {
      throw new McpError(ErrorCode.InvalidParams, "Parâmetros 'nome_tabela' e 'approval_id' são obrigatórios.");
    }
    try {
      const valid = await validateApprovalId(approvalId);
      if (!valid) {
        await auditLog(AuditLevel.SECURITY, "congelar_tabela_final_unauthorized", { nomeTabela, approvalId });
        return { isError: true, content: [{ type: "text", text: "🚫 Token de aprovação inválido ou expirado. Operação bloqueada." }] };
      }
      const filePath = join(FINAL_TABLE_DIR, nomeTabela.endsWith(".csv") ? nomeTabela : `${nomeTabela}.csv`);
      if (!existsSync(filePath)) {
        return { isError: true, content: [{ type: "text", text: `❌ Tabela não encontrada: ${filePath}` }] };
      }
      const result = await runChildProcess("attrib", ["+R", filePath], { timeoutMs: 10000 });
      if (result.code !== 0) {
        return { isError: true, content: [{ type: "text", text: `Erro ao congelar tabela: ${result.stderr || result.stdout}` }] };
      }
      await auditLog(AuditLevel.SECURITY, "congelar_tabela_final_success", { nomeTabela, filePath });
      return { content: [{ type: "text", text: `🔒 Tabela '${nomeTabela}' congelada (Somente Leitura).\n   Caminho: ${filePath}` }] };
    } catch (e) {
      return { isError: true, content: [{ type: "text", text: `Falha ao congelar tabela: ${e.message}` }] };
    }
  }

  if (name === "gerar_snapshot_git") {
    const mensagemCommit = args?.mensagem_commit;
    if (!mensagemCommit || typeof mensagemCommit !== "string") {
      throw new McpError(ErrorCode.InvalidParams, "Parâmetro 'mensagem_commit' obrigatório.");
    }
    try {
      if (!MESTRE_PROJETO_PATH) {
        return { isError: true, content: [{ type: "text", text: "❌ MESTRE_PROJETO_PATH não definido." }] };
      }
      const fase = args?.fase_cronograma ? ` [${args.fase_cronograma}]` : "";
      const msg = `snapshot: ${mensagemCommit}${fase}`;
      const addResult = await runChildProcess("git", ["add", "-A"], { cwd: MESTRE_PROJETO_PATH, timeoutMs: 15000 });
      if (addResult.code !== 0) {
        return { isError: true, content: [{ type: "text", text: `Erro no git add: ${addResult.stderr || addResult.stdout}` }] };
      }
      const commitResult = await runChildProcess("git", ["commit", "-m", msg], { cwd: MESTRE_PROJETO_PATH, timeoutMs: 15000 });
      if (commitResult.code !== 0 && !commitResult.stdout.includes("nothing to commit")) {
        return { isError: true, content: [{ type: "text", text: `Erro no git commit: ${commitResult.stderr || commitResult.stdout}` }] };
      }
      await auditLog(AuditLevel.INFO, "gerar_snapshot_git", { mensagem: msg });
      const cleanMsg = commitResult.stdout.includes("nothing to commit")
        ? "ℹ️ Nenhuma alteração para commit (working tree limpa)."
        : `✅ Snapshot criado: ${msg}`;
      return { content: [{ type: "text", text: cleanMsg }] };
    } catch (e) {
      return { isError: true, content: [{ type: "text", text: `Falha ao gerar snapshot: ${e.message}` }] };
    }
  }

  // ===== FIM NOVOS TOOLS V11.1 =====

  const toolConfig = mestreTools[name];
  if (!toolConfig) throw new McpError(ErrorCode.MethodNotFound, `Tool not found: ${name}`);

  try {
    // Substitui placeholders no comando localmente para fallback compatível.
    let finalCmd = toolConfig.command;
    const params = {};
    if (args && typeof args === "object") {
      for (const [key, value] of Object.entries(args)) {
        const sanitizedValue = sanitizeToolArgument(value);
        if (sanitizedValue == null) {
          return {
            isError: true,
            content: [{ type: "text", text: `Argumento inválido para o parâmetro: ${key}` }],
          };
        }
        params[key] = sanitizedValue;
        const placeholder = new RegExp(`\\{\\{${key.toUpperCase()}\\}\\}`, "g");
        finalCmd = finalCmd.replace(placeholder, sanitizedValue);
      }
    }

    const unfilledMatch = finalCmd.match(/\{\{[A-Z_]+\}\}/);
    if (unfilledMatch) {
      return {
        isError: true,
        content: [{ type: "text", text: `Parâmetro obrigatório ausente: ${unfilledMatch[0]}. Por favor, forneça o argumento necessário.` }],
      };
    }

    // Envia {id, params} quando possível; fallback para cmd exato se não houver params.
    const hasParams = Object.keys(params).length > 0;
    const payload = hasParams ? { id: toolConfig.id, params } : { id: toolConfig.id };
    const data = await executeLauncherCommand(payload, { timeoutMs: 900000 });
    return {
      isError: !data.success,
      content: [{ type: "text", text: data.output || (data.success ? "✅ Ok." : "❌ Erro.") }],
    };
  } catch (error) {
    if (error.name === "AbortError" || error.name === "TimeoutError") {
      return { isError: true, content: [{ type: "text", text: "⏱️ Timeout: O comando demorou mais de 10s. Verifique se o Launcher está rodando na porta 7777." }] };
    }
    return { isError: true, content: [{ type: "text", text: `Falha no Mestre Server: ${error.message}` }] };
  }
});

async function startServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Mestre do PC V10 MCP Server iniciado em stdio.");
}

startServer().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
