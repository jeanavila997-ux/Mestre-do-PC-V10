#!/usr/bin/env node

/**
 * Módulo de Gestão de Memórias - Mestre do PC V10/V11
 * Armazena, recupera e exporta memórias do chat em formato Excel/CSV
 */

import { writeFile, readFile, mkdir, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Diretório de memórias
const MEMORIES_DIR = process.env.MESTRE_MEMORIES_DIR || join(__dirname, "..", "v10", "data", "memories");
const MEMORIES_FILE = join(MEMORIES_DIR, "chat-memories.json");
const MAX_MEMORIES = 1000; // Limite máximo de memórias

/**
 * Tipos de memória suportados
 */
export const MemoryType = {
  CONVERSATION: "conversation",      // Conversas com IA
  COMMAND: "command",                // Comandos executados
  CONTEXT: "context",                // Contextos importantes
  NOTE: "note",                      // Notas do usuário
  DIAGNOSTIC: "diagnostic",          // Diagnósticos de sistema
  CONFIG: "config",                  // Configurações salvas
};

/**
 * Inicializa diretório de memórias
 */
export async function initMemories() {
  try {
    await mkdir(MEMORIES_DIR, { recursive: true });
    console.error(`[MEMORIES] Memórias inicializadas em: ${MEMORIES_DIR}`);
    
    // Garante que o arquivo de memórias exista
    try {
      await access(MEMORIES_FILE);
    } catch {
      await writeFile(MEMORIES_FILE, JSON.stringify({ memories: [], version: "1.0" }, null, 2), "utf8");
      console.error("[MEMORIES] Arquivo de memórias criado.");
    }
  } catch (e) {
    console.error(`[MEMORIES] Falha ao inicializar: ${e.message}`);
  }
}

/**
 * Carrega memórias do arquivo
 */
async function loadMemoriesFile() {
  try {
    const content = await readFile(MEMORIES_FILE, "utf8");
    const data = JSON.parse(content);
    return {
      memories: Array.isArray(data.memories) ? data.memories : [],
      version: data.version || "1.0",
    };
  } catch (e) {
    console.error(`[MEMORIES] Erro ao carregar: ${e.message}`);
    return { memories: [], version: "1.0" };
  }
}

/**
 * Salva memórias no arquivo
 */
async function saveMemoriesFile(data) {
  try {
    // Limita o número de memórias
    const limitedMemories = data.memories.slice(-MAX_MEMORIES);
    await writeFile(MEMORIES_FILE, JSON.stringify({ memories: limitedMemories, version: data.version }, null, 2), "utf8");
    return true;
  } catch (e) {
    console.error(`[MEMORIES] Erro ao salvar: ${e.message}`);
    return false;
  }
}

/**
 * Gera ID único para memória
 */
function generateMemoryId() {
  return `mem_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Cria uma nova memória
 * @param {string} type - Tipo de memória (MemoryType)
 * @param {string} title - Título descritivo
 * @param {string} content - Conteúdo da memória
 * @param {object} metadata - Metadados opcionais
 * @returns {object} Memória criada
 */
export async function createMemory(type, title, content, metadata = {}) {
  const data = await loadMemoriesFile();
  
  const memory = {
    id: generateMemoryId(),
    type: type || MemoryType.NOTE,
    title: title || "Sem título",
    content: content || "",
    metadata: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      source: metadata.source || "chat",
      tags: metadata.tags || [],
      importance: metadata.importance || 1, // 1-5
      ...metadata,
    },
  };
  
  data.memories.push(memory);
  const saved = await saveMemoriesFile(data);
  
  if (saved) {
    console.error(`[MEMORIES] Memória criada: ${memory.id} (${memory.type})`);
    return memory;
  }
  return null;
}

/**
 * Recupera memória por ID
 */
export async function getMemory(id) {
  const data = await loadMemoriesFile();
  return data.memories.find(m => m.id === id) || null;
}

/**
 * Lista memórias com filtros
 * @param {object} filters - Filtros de consulta
 * @returns {Array} Lista de memórias filtradas
 */
export async function listMemories(filters = {}) {
  const data = await loadMemoriesFile();
  let results = [...data.memories];
  
  // Filtra por tipo
  if (filters.type) {
    const types = Array.isArray(filters.type) ? filters.type : [filters.type];
    results = results.filter(m => types.includes(m.type));
  }
  
  // Filtra por tags
  if (filters.tags && Array.isArray(filters.tags)) {
    results = results.filter(m => 
      m.metadata.tags && filters.tags.some(t => m.metadata.tags.includes(t))
    );
  }
  
  // Filtra por busca no título/conteúdo
  if (filters.search) {
    const search = filters.search.toLowerCase();
    results = results.filter(m => 
      m.title.toLowerCase().includes(search) || 
      m.content.toLowerCase().includes(search)
    );
  }
  
  // Filtra por data
  if (filters.startDate) {
    results = results.filter(m => new Date(m.metadata.createdAt) >= new Date(filters.startDate));
  }
  if (filters.endDate) {
    results = results.filter(m => new Date(m.metadata.createdAt) <= new Date(filters.endDate));
  }
  
  // Filtra por importância
  if (filters.minImportance) {
    results = results.filter(m => m.metadata.importance >= filters.minImportance);
  }
  
  // Ordena (mais recente primeiro)
  results.sort((a, b) => new Date(b.metadata.createdAt) - new Date(a.metadata.createdAt));
  
  // Limita resultados
  const limit = filters.limit || 100;
  return results.slice(0, limit);
}

/**
 * Atualiza memória existente
 */
export async function updateMemory(id, updates) {
  const data = await loadMemoriesFile();
  const index = data.memories.findIndex(m => m.id === id);
  
  if (index === -1) {
    return null;
  }
  
  const memory = data.memories[index];
  
  // Atualiza campos permitidos
  if (updates.title) memory.title = updates.title;
  if (updates.content) memory.content = updates.content;
  if (updates.metadata) {
    memory.metadata = {
      ...memory.metadata,
      ...updates.metadata,
      updatedAt: new Date().toISOString(),
    };
  }
  
  data.memories[index] = memory;
  const saved = await saveMemoriesFile(data);
  
  return saved ? memory : null;
}

/**
 * Exclui memória por ID
 */
export async function deleteMemory(id) {
  const data = await loadMemoriesFile();
  const index = data.memories.findIndex(m => m.id === id);
  
  if (index === -1) {
    return false;
  }
  
  data.memories.splice(index, 1);
  const saved = await saveMemoriesFile(data);
  
  if (saved) {
    console.error(`[MEMORIES] Memória excluída: ${id}`);
  }
  
  return saved;
}

/**
 * Converte memórias para formato CSV (compatível com Excel)
 * @param {Array} memories - Lista de memórias
 * @returns {string} Conteúdo CSV
 */
export function memoriesToCSV(memories) {
  // Cabeçalho CSV
  const headers = [
    "ID",
    "Tipo",
    "Título",
    "Conteúdo",
    "Data Criação",
    "Data Atualização",
    "Fonte",
    "Tags",
    "Importância",
    "Contexto Adicional",
  ];
  
  // Escape para CSV (lida com vírgulas, aspas e quebras de linha)
  function escapeCSV(value) {
    if (value === null || value === undefined) return "";
    const str = String(value);
    // Se contém vírgula, aspas ou quebra de linha, envolve em aspas
    if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }
  
  // Linhas de dados
  const rows = memories.map(m => [
    escapeCSV(m.id),
    escapeCSV(m.type),
    escapeCSV(m.title),
    escapeCSV(m.content.replace(/[\r\n]+/g, " ")), // Remove quebras de linha para CSV
    escapeCSV(new Date(m.metadata.createdAt).toLocaleString("pt-BR")),
    escapeCSV(new Date(m.metadata.updatedAt).toLocaleString("pt-BR")),
    escapeCSV(m.metadata.source),
    escapeCSV(Array.isArray(m.metadata.tags) ? m.metadata.tags.join("; ") : ""),
    escapeCSV(m.metadata.importance),
    escapeCSV(m.metadata.context || ""),
  ].join(","));
  
  return [headers.join(","), ...rows].join("\n");
}

/**
 * Converte memórias para formato Excel XML (XLSX simplificado)
 * @param {Array} memories - Lista de memórias
 * @returns {string} Conteúdo XML para Excel
 */
export function memoriesToExcelXML(memories) {
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<?mso-application progid="Excel.Sheet"?>',
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"',
    ' xmlns:o="urn:schemas-microsoft-com:office:office"',
    ' xmlns:x="urn:schemas-microsoft-com:office:excel"',
    ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">',
    ' <Styles>',
    '  <Style ss:ID="header">',
    '   <Font ss:Bold="1" ss:Color="#FFFFFF"/>',
    '   <Interior ss:Color="#4472C4" ss:Pattern="Solid"/>',
    '   <Alignment ss:Horizontal="Center"/>',
    '  </Style>',
    '  <Style ss:ID="default">',
    '   <Alignment ss:Vertical="Center"/>',
    '  </Style>',
    '  <Style ss:ID="date">',
    '   <NumberFormat ss:Format="dd/mm/yyyy hh:mm"/>',
    '  </Style>',
    ' </Styles>',
    ' <Worksheet ss:Name="Memórias do Chat">',
    '  <Table>',
    '   <Column ss:Width="80"/>',
    '   <Column ss:Width="100"/>',
    '   <Column ss:Width="200"/>',
    '   <Column ss:Width="400"/>',
    '   <Column ss:Width="120"/>',
    '   <Column ss:Width="120"/>',
    '   <Column ss:Width="80"/>',
    '   <Column ss:Width="150"/>',
    '   <Column ss:Width="60"/>',
    '   <Column ss:Width="200"/>',
  ];
  
  // Cabeçalho
  xml.push('   <Row ss:StyleID="header">');
  ["ID", "Tipo", "Título", "Conteúdo", "Criação", "Atualização", "Fonte", "Tags", "Import.", "Contexto"].forEach(h => {
    xml.push(`    <Cell><Data ss:Type="String">${h}</Data></Cell>`);
  });
  xml.push('   </Row>');
  
  // Dados
  memories.forEach(m => {
    xml.push('   <Row ss:StyleID="default">');
    xml.push(`    <Cell><Data ss:Type="String">${escapeXML(m.id)}</Data></Cell>`);
    xml.push(`    <Cell><Data ss:Type="String">${escapeXML(m.type)}</Data></Cell>`);
    xml.push(`    <Cell><Data ss:Type="String">${escapeXML(m.title)}</Data></Cell>`);
    xml.push(`    <Cell><Data ss:Type="String">${escapeXML(m.content.substring(0, 32000))}</Data></Cell>`);
    xml.push(`    <Cell ss:StyleID="date"><Data ss:Type="String">${new Date(m.metadata.createdAt).toISOString()}</Data></Cell>`);
    xml.push(`    <Cell ss:StyleID="date"><Data ss:Type="String">${new Date(m.metadata.updatedAt).toISOString()}</Data></Cell>`);
    xml.push(`    <Cell><Data ss:Type="String">${escapeXML(m.metadata.source)}</Data></Cell>`);
    xml.push(`    <Cell><Data ss:Type="String">${escapeXML(Array.isArray(m.metadata.tags) ? m.metadata.tags.join(", ") : "")}</Data></Cell>`);
    xml.push(`    <Cell><Data ss:Type="Number">${m.metadata.importance || 1}</Data></Cell>`);
    xml.push(`    <Cell><Data ss:Type="String">${escapeXML(m.metadata.context || "")}</Data></Cell>`);
    xml.push('   </Row>');
  });
  
  xml.push('  </Table>');
  xml.push(' </Worksheet>');
  xml.push('</Workbook>');
  
  return xml.join("\n");
}

/**
 * Escape para XML
 */
function escapeXML(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Exporta memórias para arquivo
 * @param {string} format - "json", "csv", ou "xlsx"
 * @param {object} filters - Filtros para seleção de memórias
 * @returns {object} { filename, content, mimeType }
 */
export async function exportMemories(format = "csv", filters = {}) {
  const memories = await listMemories(filters);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").substring(0, 19);
  
  if (format === "json") {
    return {
      filename: `mestre-memories-${timestamp}.json`,
      content: JSON.stringify({ memories, version: "1.0", exportedAt: new Date().toISOString() }, null, 2),
      mimeType: "application/json",
    };
  }
  
  if (format === "xlsx" || format === "xml") {
    return {
      filename: `mestre-memories-${timestamp}.xml`,
      content: memoriesToExcelXML(memories),
      mimeType: "application/vnd.ms-excel",
    };
  }
  
  // CSV padrão
  return {
    filename: `mestre-memories-${timestamp}.csv`,
    content: memoriesToCSV(memories),
    mimeType: "text/csv;charset=utf-8",
  };
}

/**
 * Importa memórias de arquivo
 * @param {string} content - Conteúdo do arquivo
 * @param {string} format - "json", "csv", ou "xlsx"
 * @returns {object} { success, count, errors }
 */
export async function importMemories(content, format = "json") {
  try {
    let memories = [];
    
    if (format === "json") {
      const data = JSON.parse(content);
      memories = Array.isArray(data.memories) ? data.memories : (Array.isArray(data) ? data : []);
    }
    
    if (format === "csv") {
      memories = parseCSV(content);
    }
    
    if (format === "xlsx" || format === "xml") {
      memories = parseExcelXML(content);
    }
    
    if (!Array.isArray(memories) || memories.length === 0) {
      return { success: false, count: 0, errors: ["Nenhuma memória encontrada no arquivo."] };
    }
    
    // Valida e importa cada memória
    const data = await loadMemoriesFile();
    let imported = 0;
    const errors = [];
    
    for (const mem of memories) {
      try {
        // Validação mínima
        if (!mem.type || !mem.content) {
          errors.push(`Memória inválida: ${mem.id || "sem ID"}`);
          continue;
        }
        
        // Gera novo ID para evitar conflitos
        const newMemory = {
          ...mem,
          id: generateMemoryId(),
          metadata: {
            ...mem.metadata,
            importedAt: new Date().toISOString(),
          },
        };
        
        data.memories.push(newMemory);
        imported++;
      } catch (e) {
        errors.push(`Erro ao importar ${mem.id || "memória"}: ${e.message}`);
      }
    }
    
    const saved = await saveMemoriesFile(data);
    
    return {
      success: saved && imported > 0,
      count: imported,
      errors,
    };
  } catch (e) {
    return {
      success: false,
      count: 0,
      errors: [`Erro ao processar arquivo: ${e.message}`],
    };
  }
}

/**
 * Parse de CSV para memórias
 */
function parseCSV(content) {
  const lines = content.split("\n").filter(l => l.trim());
  if (lines.length < 2) return [];
  
  // Pula cabeçalho
  const memories = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    if (cols.length >= 4) {
      memories.push({
        id: cols[0] || generateMemoryId(),
        type: cols[1] || "note",
        title: cols[2] || "Importado",
        content: cols[3] || "",
        metadata: {
          createdAt: cols[4] ? new Date(cols[4]).toISOString() : new Date().toISOString(),
          updatedAt: cols[5] ? new Date(cols[5]).toISOString() : new Date().toISOString(),
          source: cols[6] || "import",
          tags: cols[7] ? cols[7].split(";").map(t => t.trim()).filter(Boolean) : [],
          importance: parseInt(cols[8]) || 1,
          context: cols[9] || "",
        },
      });
    }
  }
  return memories;
}

/**
 * Parse de linha CSV (lida com aspas)
 */
function parseCSVLine(line) {
  const cols = [];
  let current = "";
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      cols.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cols.push(current);
  
  return cols;
}

/**
 * Parse de Excel XML para memórias
 */
function parseExcelXML(content) {
  const memories = [];
  const rowRegex = /<Row[^>]*>([\s\S]*?)<\/Row>/g;
  let match;
  let isFirstRow = true;
  
  while ((match = rowRegex.exec(content)) !== null) {
    if (isFirstRow) {
      isFirstRow = false;
      continue; // Pula cabeçalho
    }
    
    const cellData = [];
    const cellRegex = /<Cell[^>]*>([\s\S]*?)<\/Cell>/g;
    let cellMatch;
    
    while ((cellMatch = cellRegex.exec(match[1])) !== null) {
      const dataMatch = cellMatch[1].match(/<Data[^>]*>([\s\S]*?)<\/Data>/);
      cellData.push(dataMatch ? dataMatch[1] : "");
    }
    
    if (cellData.length >= 4) {
      memories.push({
        id: cellData[0] || generateMemoryId(),
        type: cellData[1] || "note",
        title: cellData[2] || "Importado",
        content: cellData[3] || "",
        metadata: {
          createdAt: cellData[4] ? new Date(cellData[4]).toISOString() : new Date().toISOString(),
          updatedAt: cellData[5] ? new Date(cellData[5]).toISOString() : new Date().toISOString(),
          source: cellData[6] || "import",
          tags: cellData[7] ? cellData[7].split(",").map(t => t.trim()).filter(Boolean) : [],
          importance: parseInt(cellData[8]) || 1,
          context: cellData[9] || "",
        },
      });
    }
  }
  
  return memories;
}

/**
 * Limpa memórias antigas
 * @param {number} days - Manter memórias dos últimos X dias
 */
export async function cleanupOldMemories(days = 90) {
  const data = await loadMemoriesFile();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  
  const originalCount = data.memories.length;
  data.memories = data.memories.filter(m => new Date(m.metadata.createdAt) >= cutoff);
  const removed = originalCount - data.memories.length;
  
  await saveMemoriesFile(data);
  
  if (removed > 0) {
    console.error(`[MEMORIES] ${removed} memórias antigas removidas (> ${days} dias)`);
  }
  
  return removed;
}

/**
 * Busca memórias relevantes para contexto atual
 * @param {string} query - Texto de busca
 * @param {number} limit - Número máximo de resultados
 * @returns {Array} Memórias relevantes
 */
export async function searchRelevantMemories(query, limit = 5) {
  if (!query || query.trim().length < 2) {
    return [];
  }
  
  const memories = await listMemories({ limit: 200 });
  const queryLower = query.toLowerCase();
  
  // Score de relevância
  const scored = memories.map(m => {
    let score = 0;
    const title = m.title.toLowerCase();
    const content = m.content.toLowerCase();
    const tags = (m.metadata.tags || []).join(" ").toLowerCase();
    
    // Match exato no título
    if (title.includes(queryLower)) score += 10;
    
    // Match no conteúdo
    const contentMatches = (content.match(new RegExp(queryLower, "g")) || []).length;
    score += contentMatches * 2;
    
    // Match nas tags
    if (tags.includes(queryLower)) score += 5;
    
    // Importância
    score += m.metadata.importance || 1;
    
    // Recência (últimos 7 dias = +3, 30 dias = +2, 90 dias = +1)
    const daysOld = (Date.now() - new Date(m.metadata.createdAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysOld < 7) score += 3;
    else if (daysOld < 30) score += 2;
    else if (daysOld < 90) score += 1;
    
    return { memory: m, score };
  });
  
  // Ordena por score e retorna top N
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(s => s.memory);
}

// Inicializa ao carregar o módulo
await initMemories();
