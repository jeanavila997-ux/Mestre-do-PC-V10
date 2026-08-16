#!/usr/bin/env node

/**
 * Módulo de Logging e Auditoria - Mestre do PC V11
 * Registra todas as operações executadas para fins de auditoria e segurança.
 */

import { writeFile, appendFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Diretório de logs de auditoria
const AUDIT_LOG_DIR = process.env.MESTRE_AUDIT_LOG_DIR || join(__dirname, "..", "logs", "audit");
const MAX_LOG_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_LOG_FILES = 30; // Manter últimos 30 dias

/**
 * Níveis de log de auditoria
 */
export const AuditLevel = {
  INFO: "INFO",
  WARNING: "WARNING",
  ERROR: "ERROR",
  SECURITY: "SECURITY",
  COMMAND_EXEC: "COMMAND_EXEC",
  IA_OPERATION: "IA_OPERATION",
  WEBHOOK: "WEBHOOK",
};

/**
 * Inicializa diretório de logs de auditoria
 */
export async function initAuditLog() {
  try {
    await mkdir(AUDIT_LOG_DIR, { recursive: true });
    console.error(`[AUDIT] Logs de auditoria inicializados em: ${AUDIT_LOG_DIR}`);
  } catch (e) {
    console.error(`[AUDIT] Falha ao inicializar logs: ${e.message}`);
  }
}

/**
 * Gera entrada de log de auditoria
 * @param {string} level - Nível do log
 * @param {string} action - Ação executada
 * @param {object} details - Detalhes da operação
 * @param {string} userId - Identificador do usuário (opcional)
 */
export async function auditLog(level, action, details = {}, userId = "system") {
  const timestamp = new Date().toISOString();
  const date = new Date();
  const logFile = join(AUDIT_LOG_DIR, `audit-${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}.log`);

  const logEntry = {
    timestamp,
    level,
    action,
    userId,
    computerName: process.env.COMPUTERNAME || "unknown",
    pid: process.pid,
    details: sanitizeDetails(details),
  };

  const logLine = JSON.stringify(logEntry) + "\n";

  try {
    // Verifica tamanho do log atual
    await rotateLogIfNeeded(logFile);
    
    // Adiciona entrada
    await appendFile(logFile, logLine, "utf8");
    
    // Log de segurança também vai para console
    if (level === AuditLevel.SECURITY) {
      console.error(`[AUDIT-SECURITY] ${action}: ${JSON.stringify(details)}`);
    }
  } catch (e) {
    console.error(`[AUDIT] Falha ao escrever log: ${e.message}`);
  }
}

/**
 * Sanitiza detalhes para não expor dados sensíveis
 */
function sanitizeDetails(details) {
  const sanitized = { ...details };
  
  // Remove possíveis senhas ou tokens
  const sensitiveKeys = ["password", "senha", "token", "api_key", "apikey", "secret", "credential"];
  for (const key of sensitiveKeys) {
    if (key in sanitized) {
      sanitized[key] = "[REDACTED]";
    }
  }
  
  // Trunca strings muito longas
  for (const [key, value] of Object.entries(sanitized)) {
    if (typeof value === "string" && value.length > 500) {
      sanitized[key] = value.substring(0, 500) + "...";
    }
  }
  
  return sanitized;
}

/**
 * Rotaciona arquivo de log se exceder tamanho máximo
 */
async function rotateLogIfNeeded(logFile) {
  const { stat } = await import("node:fs/promises");
  
  try {
    const stats = await stat(logFile);
    if (stats.size < MAX_LOG_SIZE_BYTES) {
      return;
    }
    
    // Rotaciona: renomeia arquivo atual
    const rotatedFile = logFile.replace(".log", `.old.${Date.now()}.log`);
    const { rename } = await import("node:fs/promises");
    await rename(logFile, rotatedFile);
    
    // Remove logs antigos além do limite
    await cleanupOldLogs();
  } catch (e) {
    if (e.code !== "ENOENT") {
      console.error(`[AUDIT] Falha na rotação de log: ${e.message}`);
    }
  }
}

/**
 * Remove logs antigos além do limite configurado
 */
async function cleanupOldLogs() {
  const { readdir, unlink } = await import("node:fs/promises");
  
  try {
    const files = await readdir(AUDIT_LOG_DIR);
    const auditFiles = files
      .filter(f => f.endsWith(".log") || f.includes(".old."))
      .map(f => ({
        name: f,
        path: join(AUDIT_LOG_DIR, f),
        mtime: 0, // Será preenchido abaixo
      }));
    
    // Obtém data de modificação
    for (const file of auditFiles) {
      try {
        const { stat } = await import("node:fs/promises");
        const stats = await stat(file.path);
        file.mtime = stats.mtimeMs;
      } catch {
        file.mtime = 0;
      }
    }
    
    // Ordena por data (mais recente primeiro)
    auditFiles.sort((a, b) => b.mtime - a.mtime);
    
    // Remove além do limite
    for (const file of auditFiles.slice(MAX_LOG_FILES)) {
      try {
        await unlink(file.path);
        console.error(`[AUDIT] Log antigo removido: ${file.name}`);
      } catch (e) {
        console.error(`[AUDIT] Falha ao remover log antigo: ${e.message}`);
      }
    }
  } catch (e) {
    if (e.code !== "ENOENT") {
      console.error(`[AUDIT] Falha na limpeza de logs: ${e.message}`);
    }
  }
}

/**
 * Consulta logs de auditoria
 * @param {object} filters - Filtros de consulta
 * @returns {Promise<Array>} Entradas de log filtradas
 */
export async function queryAuditLog(filters = {}) {
  const { readdir, readFile } = await import("node:fs/promises");
  const results = [];
  
  try {
    const files = await readdir(AUDIT_LOG_DIR);
    const logFiles = files.filter(f => f.endsWith(".log"));
    
    for (const file of logFiles) {
      const filePath = join(AUDIT_LOG_DIR, file);
      const content = await readFile(filePath, "utf8");
      const lines = content.trim().split("\n").map(l => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      }).filter(Boolean);
      
      // Aplica filtros
      for (const entry of lines) {
        let matches = true;
        
        if (filters.level && entry.level !== filters.level) {
          matches = false;
        }
        if (filters.action && !entry.action.toLowerCase().includes(filters.action.toLowerCase())) {
          matches = false;
        }
        if (filters.userId && entry.userId !== filters.userId) {
          matches = false;
        }
        if (filters.startDate && entry.timestamp < filters.startDate) {
          matches = false;
        }
        if (filters.endDate && entry.timestamp > filters.endDate) {
          matches = false;
        }
        
        if (matches) {
          results.push(entry);
        }
      }
    }
    
    // Ordena por timestamp (mais recente primeiro)
    results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    return results.slice(0, filters.limit || 100);
  } catch (e) {
    console.error(`[AUDIT] Falha na consulta: ${e.message}`);
    return [];
  }
}

/**
 * Exporta relatório de auditoria em formato legível
 */
export async function exportAuditReport(options = {}) {
  const entries = await queryAuditLog(options);
  
  const lines = [
    "# Relatório de Auditoria - Mestre do PC V11",
    `Gerado em: ${new Date().toLocaleString("pt-BR")}`,
    `Computador: ${process.env.COMPUTERNAME || "unknown"}`,
    "",
    "## Entradas de Log",
    "",
  ];
  
  for (const entry of entries) {
    lines.push(`### [${entry.level}] ${entry.action}`);
    lines.push(`- **Data:** ${new Date(entry.timestamp).toLocaleString("pt-BR")}`);
    lines.push(`- **Usuário:** ${entry.userId}`);
    lines.push(`- **PID:** ${entry.pid}`);
    lines.push(`- **Detalhes:`);
    lines.push("```json");
    lines.push(JSON.stringify(entry.details, null, 2));
    lines.push("```");
    lines.push("");
  }
  
  return lines.join("\n");
}

// Inicializa ao carregar o módulo
await initAuditLog();
