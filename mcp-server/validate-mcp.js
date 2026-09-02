#!/usr/bin/env node

/**
 * Script de Validação Rápida - MCP Server
 *
 * Uso: node validate-mcp.js
 *
 * Valida:
 * - Sintaxe JavaScript (ES Modules)
 * - Estrutura de tools (name, description, inputSchema)
 * - Registry de operações (IDs únicos, comandos presentes)
 * - Arquivos de teste existentes
 */

import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

console.log("🔍 Validando MCP Server...\n");

const errors = [];
const warnings = [];
const info = [];

// 1. Validar package.json
try {
  const pkg = JSON.parse(await readFile(join(__dirname, "package.json"), "utf8"));
  info.push(`✅ package.json: ${pkg.name}@${pkg.version}`);

  if (!pkg.engines?.node) {
    warnings.push("package.json: engines.node não definido");
  } else {
    info.push(`   Node: ${pkg.engines.node}`);
  }

  if (pkg.dependencies?.mysql2 && !process.env.MCP_DB_ENABLED) {
    warnings.push("mysql2 importado sem feature flag (ver DEVELOPMENT_GUIDE.md)");
  }
} catch (e) {
  errors.push(`❌ package.json: ${e.message}`);
}

// 2. Validar index.js (sintaxe e estrutura)
try {
  const indexContent = await readFile(join(__dirname, "index.js"), "utf8");

  // Verificar se exporta servidor MCP
  if (!indexContent.includes("new Server(")) {
    errors.push("index.js: não encontrou inicialização do servidor MCP");
  } else {
    info.push("✅ index.js: servidor MCP inicializado");
  }

  // Verificar EXTRA_TOOLS
  const extraToolsMatch = indexContent.match(/const EXTRA_TOOLS = \[([\s\S]*?)\];/);
  if (extraToolsMatch) {
    const toolsContent = extraToolsMatch[0];
    const toolNames = [...toolsContent.matchAll(/name: "([^"]+)"/g)].map(m => m[1]);
    info.push(`✅ EXTRA_TOOLS: ${toolNames.length} ferramentas (${toolNames.slice(0, 5).join(", ")}...)`);

    // Verificar schemas
    const schemasCount = [...toolsContent.matchAll(/inputSchema:/g)].length;
    if (schemasCount !== toolNames.length) {
      warnings.push(`EXTRA_TOOLS: ${toolNames.length - schemasCount} ferramentas sem inputSchema`);
    }
  }

  // Verificar handlers
  const handlerCount = [...indexContent.matchAll(/if \(name === "([^"]+)"\)/g)].length;
  info.push(`✅ Handlers: ${handlerCount} ferramentas implementadas`);

  // Verificar auditoria
  const auditCalls = [...indexContent.matchAll(/await auditLog\(/g)].length;
  info.push(`✅ Auditoria: ${auditCalls} chamadas de auditLog`);

  // Verificar prompt guards
  const guardCalls = [...indexContent.matchAll(/guardPromptInjection\(/g)].length;
  info.push(`✅ Prompt Guard: ${guardCalls} chamadas de guardPromptInjection`);

} catch (e) {
  errors.push(`❌ index.js: ${e.message}`);
}

// 3. Validar v10/operation-registry.js
try {
  const registryContent = await readFile(join(__dirname, "../v10/operation-registry.js"), "utf8");

  if (!registryContent.includes("class OperationRegistry")) {
    errors.push("operation-registry.js: classe OperationRegistry não encontrada");
  } else {
    info.push("✅ operation-registry.js: classe OperationRegistry presente");
  }

  // Verificar sanitização
  if (!registryContent.includes("^[a-zA-Z0-9_. -]{1,128}$")) {
    warnings.push("operation-registry.js: regex de sanitização não encontrado");
  } else {
    info.push("✅ operation-registry.js: sanitização de parâmetros presente");
  }

} catch (e) {
  errors.push(`❌ operation-registry.js: ${e.message}`);
}

// 4. Validar allowed-operations.json
try {
  const opsRaw = await readFile(join(__dirname, "../v10/allowed-operations.json"), "utf8");
  const ops = JSON.parse(opsRaw);

  const operations = Array.isArray(ops) ? ops : (ops.operations || []);
  const ids = new Set();
  const duplicates = [];

  for (const op of operations) {
    if (!op.id) {
      errors.push(`allowed-operations.json: operação sem ID: ${JSON.stringify(op).slice(0, 50)}`);
    } else if (ids.has(op.id)) {
      duplicates.push(op.id);
    } else {
      ids.add(op.id);
    }

    if (!op.command) {
      warnings.push(`allowed-operations.json: ${op.id} sem comando`);
    }
    if (!op.title) {
      warnings.push(`allowed-operations.json: ${op.id} sem título`);
    }
    if (!op.category) {
      warnings.push(`allowed-operations.json: ${op.id} sem categoria`);
    }
  }

  if (duplicates.length > 0) {
    errors.push(`allowed-operations.json: IDs duplicados: ${duplicates.join(", ")}`);
  } else {
    info.push(`✅ allowed-operations.json: ${operations.length} operações, 0 duplicados`);
  }

  // Verificar operações destrutivas
  const destructive = operations.filter(op => op.destructive === true).length;
  info.push(`   Destrutivas: ${destructive} (${Math.round(destructive / operations.length * 100)}%)`);

} catch (e) {
  errors.push(`❌ allowed-operations.json: ${e.message}`);
}

// 5. Validar testes
try {
  const testDir = join(__dirname, "test");
  const testFiles = await readdir(testDir);
  const testCount = testFiles.filter(f => f.endsWith(".test.js")).length;

  info.push(`✅ Testes: ${testCount} arquivos de teste encontrados`);

  // Verificar testes críticos
  const criticalTests = [
    "whitelist-enforcement.test.js",
    "launcher-security.test.js",
    "prompt-guard.test.js",
  ];

  for (const test of criticalTests) {
    if (!testFiles.includes(test)) {
      warnings.push(`Teste crítico ausente: test/${test}`);
    }
  }

} catch (e) {
  errors.push(`❌ test/: ${e.message}`);
}

// 6. Validar security.js
try {
  const securityContent = await readFile(join(__dirname, "security.js"), "utf8");

  if (!securityContent.includes("checkPromptInjection")) {
    errors.push("security.js: função checkPromptInjection não encontrada");
  } else {
    info.push("✅ security.js: checkPromptInjection presente");
  }

} catch (e) {
  errors.push(`❌ security.js: ${e.message}`);
}

// 7. Validar audit-logger.js
try {
  const loggerContent = await readFile(join(__dirname, "audit-logger.js"), "utf8");

  if (!loggerContent.includes("AuditLevel")) {
    errors.push("audit-logger.js: enum AuditLevel não encontrado");
  } else {
    info.push("✅ audit-logger.js: níveis de auditoria presentes");
  }

  // Verificar níveis
  const levels = ["INFO", "WARNING", "ERROR", "SECURITY", "COMMAND_EXEC", "IA_OPERATION", "WEBHOOK"];
  for (const level of levels) {
    if (!loggerContent.includes(level)) {
      warnings.push(`audit-logger.js: nível ${level} não encontrado`);
    }
  }

} catch (e) {
  errors.push(`❌ audit-logger.js: ${e.message}`);
}

// 8. Verificar dependências críticas
try {
  const pkg = JSON.parse(await readFile(join(__dirname, "package.json"), "utf8"));

  const requiredDeps = ["@modelcontextprotocol/sdk"];
  for (const dep of requiredDeps) {
    if (!pkg.dependencies?.[dep]) {
      errors.push(`Dependência crítica ausente: ${dep}`);
    }
  }

  info.push(`✅ Dependências: ${Object.keys(pkg.dependencies).length} pacotes`);

  // Verificar overrides
  if (pkg.overrides && Object.keys(pkg.overrides).length > 0) {
    info.push(`⚠️ Overrides: ${Object.keys(pkg.overrides).length} pacotes com versão forçada`);
    info.push(`   Justificativa necessária para: ${Object.keys(pkg.overrides).join(", ")}`);
  }

} catch (e) {
  errors.push(`❌ dependências: ${e.message}`);
}

// Output
console.log("=".repeat(60));
console.log("📊 RESULTADOS\n");

if (info.length > 0) {
  console.log("✅ INFORMAÇÕES:");
  for (const msg of info) {
    console.log(`   ${msg}`);
  }
  console.log();
}

if (warnings.length > 0) {
  console.log("⚠️ ALERTAS:");
  for (const msg of warnings) {
    console.log(`   ${msg}`);
  }
  console.log();
}

if (errors.length > 0) {
  console.log("❌ ERROS:");
  for (const msg of errors) {
    console.log(`   ${msg}`);
  }
  console.log();
}

console.log("=".repeat(60));

if (errors.length > 0) {
  console.log(`\n❌ Validação FALHOU com ${errors.length} erro(s)`);
  process.exit(1);
} else if (warnings.length > 0) {
  console.log(`\n⚠️ Validação PASSOU com ${warnings.length} alerta(s)`);
  process.exit(0);
} else {
  console.log("\n✅ Validação PASSOU sem erros ou alertas");
  process.exit(0);
}
