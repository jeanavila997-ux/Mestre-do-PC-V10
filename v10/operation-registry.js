// operation-registry.js — single source of truth for launcher commands and MCP tool mapping.
// Reads v10/allowed-operations.json and exposes everything both the launcher and the
// MCP server need so operations are declared exactly once.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OPERATIONS_FILE = join(__dirname, "allowed-operations.json");

/**
 * Operation registry built from allowed-operations.json.
 * Combines exact `operations` with fixed templates (`templates` that have a literal
 * `command`) into a single lookup by id. Parameterized templates are compiled into
 * anchored regexes and kept separate for literal command matching and for {id, params}
 * substitution.
 */
export class OperationRegistry {
  constructor(rawCatalog) {
    this.operations = Array.isArray(rawCatalog) ? rawCatalog : rawCatalog.operations || [];
    this.templates = (!Array.isArray(rawCatalog) && rawCatalog.templates) ? rawCatalog.templates : [];

    // Templates that carry a literal command behave as exact operations.
    this.fixedTemplates = this.templates.filter((t) => typeof t.command === "string");
    this.parametrizedTemplates = this.templates.filter((t) => typeof t.pattern === "string");

    this.exactEntries = [...this.operations, ...this.fixedTemplates];
    this.operationsById = new Map(this.exactEntries.map((op) => [op.id, op]));
    this.exactCommands = new Set(this.exactEntries.map((op) => op.command));

        this.compiledTemplates = this.parametrizedTemplates.map((tpl) => {
      const paramNames = Object.keys(tpl.params || {});
      let regexSource = escapeRegex(tpl.pattern);
      for (const key of paramNames) {
        const reSource = (tpl.params[key] || "[a-zA-Z0-9_. -]{1,128}")
          .replace(/^\^/, "")
          .replace(/\$/, "");
        const escapedPlaceholder = escapeRegex(`{{${key.toUpperCase()}}}`);
        const parts = regexSource.split(escapedPlaceholder);
        regexSource = parts.reduce((acc, part, i) => {
          if (i === 0) return part;
          const slot = i === 1 ? `(?<${key}>${reSource})` : `\\k<${key}>`;
          return acc + slot + part;
        }, "");
      }
      return {
        id: tpl.id,
        pattern: tpl.pattern,
        params: tpl.params || {},
        destructive: !!tpl.destructive,
        regex: new RegExp(`^${regexSource}$`, "s"),
      };
    });
  }

  getById(id) {
    return this.operationsById.get(id) || this.parametrizedTemplates.find((t) => t.id === id);
  }

  /**
   * Resolve a launcher request body into a safe PowerShell command.
   * Accepts {id, params?} or {cmd}.
   */
  resolve(body, { maxCmdLength = 32768 } = {}) {
    if (!body || typeof body !== "object") return { error: "Corpo inválido." };

    if (body.id && typeof body.id === "string") {
      const op = this.operationsById.get(body.id);
      const tpl = this.parametrizedTemplates.find((t) => t.id === body.id);
      if (!op && !tpl) return { error: `Operação '${body.id}' não encontrada.` };

      if (op) {
        return { cmd: op.command, destructive: !!op.destructive, id: op.id };
      }

      let finalCmd = tpl.pattern;
      const params = body.params || {};
      for (const [key, regexSource] of Object.entries(tpl.params || {})) {
        const val = params[key];
        const sanitized = validateParam(key, val, regexSource);
        if (sanitized == null) {
          return { error: `Parâmetro inválido para '${key}'.` };
        }
        finalCmd = finalCmd.replace(new RegExp(`\\{\\{${key.toUpperCase()}\\}\\}`, "g"), sanitized);
      }
      return { cmd: finalCmd, destructive: !!tpl.destructive, id: tpl.id };
    }

    if (body.cmd && typeof body.cmd === "string") {
      const cmd = body.cmd;
      if (cmd.length > maxCmdLength) return { error: "Comando excede o limite de tamanho." };
      if (this.exactCommands.has(cmd)) {
        const op = this.exactEntries.find((o) => o.command === cmd);
        return { cmd, destructive: !!op?.destructive, id: op?.id };
      }
      for (const compiled of this.compiledTemplates) {
        if (compiled.regex.test(cmd)) {
          return { cmd, destructive: compiled.destructive, id: compiled.id };
        }
      }
      return { error: "Operação bloqueada: somente comandos cadastrados na V10 podem ser executados." };
    }

    return { error: "Comando ausente ou inválido." };
  }

  /**
   * Build the internal MCP tool registry object from the registry.
   * Result shape matches the legacy `mestreTools` object.
   */
  buildMcpToolRegistry() {
    const registry = {};
    for (const op of this.exactEntries) {
      registry[op.id] = { id: op.id, description: op.description || "", command: op.command };
    }
    for (const tpl of this.parametrizedTemplates) {
      registry[tpl.id] = { id: tpl.id, description: tpl.description || "", command: tpl.pattern };
    }
    return registry;
  }

  /**
   * Build MCP tool schemas (inputSchema per tool) from the registry.
   */
  buildMcpToolSchemas(extraTools = []) {
    const registry = this.buildMcpToolRegistry();
    const toolEntries = Object.entries(registry).map(([name, config]) => {
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
    });
    return [...toolEntries, ...extraTools];
  }

  /**
   * Validate basic registry integrity and return a report.
   */
  validate() {
    const errors = [];
    const ids = new Set();
    for (const op of this.exactEntries) {
      if (!op.id) errors.push("operation missing id");
      else if (ids.has(op.id)) errors.push(`duplicate id ${op.id}`);
      else ids.add(op.id);
      if (!op.command) errors.push(`${op.id || "?"}: operation missing command`);
      if (!op.title) errors.push(`${op.id || "?"}: operation missing title`);
      if (!op.category) errors.push(`${op.id || "?"}: operation missing category`);
    }
    for (const tpl of this.parametrizedTemplates) {
      if (!tpl.id) errors.push("template missing id");
      else if (ids.has(tpl.id)) errors.push(`duplicate id ${tpl.id}`);
      else ids.add(tpl.id);
      if (!tpl.pattern) errors.push(`${tpl.id || "?"}: template missing pattern`);
      if (!tpl.params || Object.keys(tpl.params).length === 0) {
        errors.push(`${tpl.id || "?"}: template has no params`);
      }
    }
    return { ok: errors.length === 0, errors };
  }
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function validateParam(name, value, regexSource) {
  if (typeof value !== "string") return null;
  if (value.length === 0 || value.length > 1024) return null;
  const re = new RegExp(`^(?:${regexSource})$`);
  return re.test(value) ? value : null;
}

let cachedRegistry = null;

export async function loadOperationRegistry(path = OPERATIONS_FILE) {
  if (cachedRegistry) return cachedRegistry;
  const raw = JSON.parse(await readFile(path, "utf8"));
  cachedRegistry = new OperationRegistry(raw);
  return cachedRegistry;
}

export function clearOperationRegistryCache() {
  cachedRegistry = null;
}

export { OPERATIONS_FILE };
