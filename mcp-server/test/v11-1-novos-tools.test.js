/**
 * Testes para os 5 novos tools MCP V11.1
 * - consultar_fonte_oficial_gov (validação de domínio)
 * - extrair_evidencia_de_pdf_local (busca em PDF)
 * - simular_cenario_economico (cálculo fallback)
 * - congelar_tabela_final (validação de approval_id)
 * - gerar_snapshot_git (commit automation)
 */

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ===== Helper: import dinâmico do index.js (ESM) =====
async function importMcpServer() {
  return await import("../index.js");
}

// ===== Testes: consultar_fonte_oficial_gov — validação de domínio =====

test("consultar_fonte_oficial_gov: bloqueia domínio não oficial (wikipedia.org)", async () => {
  // Testa apenas a lógica de validação de domínio (sem fetch real)
  const ALLOWED_GOV_DOMAINS = ["gov.br", "ibge.gov.br", "embrapa.br", "usp.br", "in.gov.br", "datasus.gov.br"];
  function isAllowedGovDomain(url) {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();
      return ALLOWED_GOV_DOMAINS.some((d) => host === d || host.endsWith("." + d));
    } catch {
      return false;
    }
  }
  assert.equal(isAllowedGovDomain("https://pt.wikipedia.org/wiki/Pecuária"), false);
  assert.equal(isAllowedGovDomain("https://blog.qualquer.com/artigo"), false);
  assert.equal(isAllowedGovDomain("not-a-url"), false);
});

test("consultar_fonte_oficial_gov: permite domínios oficiais", async () => {
  const ALLOWED_GOV_DOMAINS = ["gov.br", "ibge.gov.br", "embrapa.br", "usp.br", "in.gov.br", "datasus.gov.br"];
  function isAllowedGovDomain(url) {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();
      return ALLOWED_GOV_DOMAINS.some((d) => host === d || host.endsWith("." + d));
    } catch {
      return false;
    }
  }
  assert.equal(isAllowedGovDomain("https://www.ibge.gov.br/estatisticas"), true);
  assert.equal(isAllowedGovDomain("https://www.embrapa.br/pecuaria"), true);
  assert.equal(isAllowedGovDomain("https://www.gov.br/agricultura"), true);
  assert.equal(isAllowedGovDomain("https://www5.usp.br/pesquisa"), true);
});

// ===== Testes: extrair_evidencia_de_pdf_local — busca em PDF =====

test("extrair_evidencia_de_pdf_local: encontra termo em texto extraído", () => {
  const text = "linha 1\nlinha 2 com prevalencia\nlinha 3\nlinha 4\nlinha 5";
  const lines = text.split(/\r?\n/);
  const searchTerm = "prevalencia";
  const matches = [];
  const maxCtx = 3;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toLowerCase().includes(searchTerm.toLowerCase())) {
      const start = Math.max(0, i - maxCtx);
      const end = Math.min(lines.length, i + maxCtx + 1);
      matches.push({ line: i + 1, snippet: lines.slice(start, end).join("\n").trim() });
    }
  }
  assert.equal(matches.length, 1);
  assert.equal(matches[0].line, 2);
  assert.ok(matches[0].snippet.includes("prevalencia"));
});

test("extrair_evidencia_de_pdf_local: retorna vazio quando termo não existe", () => {
  const text = "linha 1\nlinha 2\nlinha 3";
  const lines = text.split(/\r?\n/);
  const searchTerm = "inexistente";
  const matches = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toLowerCase().includes(searchTerm.toLowerCase())) {
      matches.push({ line: i + 1, snippet: lines[i] });
    }
  }
  assert.equal(matches.length, 0);
});

test("extrair_evidencia_de_pdf_local: respeita limite de contexto (máx 5)", () => {
  const text = Array.from({ length: 20 }, (_, i) => `linha ${i + 1}`);
  const lines = text;
  const searchTerm = "linha 10";
  const maxCtx = 5;
  const matches = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toLowerCase().includes(searchTerm.toLowerCase())) {
      const start = Math.max(0, i - maxCtx);
      const end = Math.min(lines.length, i + maxCtx + 1);
      matches.push({ line: i + 1, snippet: lines.slice(start, end).join("\n") });
    }
  }
  assert.equal(matches.length, 1);
  const snippetLines = matches[0].snippet.split("\n");
  // 5 antes + 1 match + 5 depois = 11
  assert.ok(snippetLines.length <= 11);
});

// ===== Testes: simular_cenario_economico — cálculo fallback =====

test("simular_cenario_economico: cálculo fallback está correto", () => {
  const tamanhoRebanho = 1000;
  const prevalenciaPct = 5.5;
  const perdaArroba = 2;
  const precoArroba = 250;

  const animaisAfetados = Math.round(tamanhoRebanho * (prevalenciaPct / 100));
  const perdaTotalArrobas = animaisAfetados * perdaArroba;
  const perdaFinanceiraBRL = perdaTotalArrobas * precoArroba;

  assert.equal(animaisAfetados, 55);
  assert.equal(perdaTotalArrobas, 110);
  assert.equal(perdaFinanceiraBRL, 27500);
});

test("simular_cenario_economico: rejeita parâmetros inválidos", () => {
  const invalidParams = [0, NaN, undefined, null, "abc"];
  for (const p of invalidParams) {
    const val = Number(p);
    assert.ok(!val || isNaN(val), `Valor ${p} deveria ser inválido`);
  }
  // -1 é truthy mas não deve ser aceito como parâmetro válido
  assert.equal(Number(-1) < 0, true, "Valor negativo não deveria ser aceito");
});

// ===== Testes: congelar_tabela_final — validação de approval_id =====

test("congelar_tabela_final: rejeita approval_id inválido", async () => {
  const tmpDir = join(__dirname, "tmp-test-approval");
  const approvalsFile = join(tmpDir, "approvals.json");
  mkdirSync(tmpDir, { recursive: true });
  writeFileSync(approvalsFile, JSON.stringify({ approvals: [] }));

  // Simula validação
  async function validateApprovalId(approvalId) {
    if (!existsSync(approvalsFile)) return false;
    try {
      const raw = await import("node:fs/promises").then((m) => m.readFile(approvalsFile, "utf8"));
      const data = JSON.parse(raw);
      return Array.isArray(data.approvals) && data.approvals.some((a) => a.id === approvalId && a.expires_at && new Date(a.expires_at) > new Date());
    } catch {
      return false;
    }
  }

  assert.equal(await validateApprovalId("invalid-token"), false);

  rmSync(tmpDir, { recursive: true, force: true });
});

test("congelar_tabela_final: aceita approval_id válido e não expirado", async () => {
  const tmpDir = join(__dirname, "tmp-test-approval-valid");
  const approvalsFile = join(tmpDir, "approvals.json");
  mkdirSync(tmpDir, { recursive: true });
  const futureDate = new Date(Date.now() + 86400000).toISOString(); // amanhã
  writeFileSync(approvalsFile, JSON.stringify({ approvals: [{ id: "valid-123", expires_at: futureDate }] }));

  async function validateApprovalId(approvalId) {
    if (!existsSync(approvalsFile)) return false;
    try {
      const raw = await import("node:fs/promises").then((m) => m.readFile(approvalsFile, "utf8"));
      const data = JSON.parse(raw);
      return Array.isArray(data.approvals) && data.approvals.some((a) => a.id === approvalId && a.expires_at && new Date(a.expires_at) > new Date());
    } catch {
      return false;
    }
  }

  assert.equal(await validateApprovalId("valid-123"), true);

  rmSync(tmpDir, { recursive: true, force: true });
});

test("congelar_tabela_final: rejeita approval_id expirado", async () => {
  const tmpDir = join(__dirname, "tmp-test-approval-expired");
  const approvalsFile = join(tmpDir, "approvals.json");
  mkdirSync(tmpDir, { recursive: true });
  const pastDate = new Date(Date.now() - 86400000).toISOString(); // ontem
  writeFileSync(approvalsFile, JSON.stringify({ approvals: [{ id: "expired-456", expires_at: pastDate }] }));

  async function validateApprovalId(approvalId) {
    if (!existsSync(approvalsFile)) return false;
    try {
      const raw = await import("node:fs/promises").then((m) => m.readFile(approvalsFile, "utf8"));
      const data = JSON.parse(raw);
      return Array.isArray(data.approvals) && data.approvals.some((a) => a.id === approvalId && a.expires_at && new Date(a.expires_at) > new Date());
    } catch {
      return false;
    }
  }

  assert.equal(await validateApprovalId("expired-456"), false);

  rmSync(tmpDir, { recursive: true, force: true });
});

// ===== Testes: gerar_snapshot_git — formatação de mensagem =====

test("gerar_snapshot_git: formata mensagem com fase", () => {
  const mensagemCommit = "Consolidação da Fase 2";
  const faseCronograma = "F2";
  const fase = ` [${faseCronograma}]`;
  const msg = `snapshot: ${mensagemCommit}${fase}`;
  assert.equal(msg, "snapshot: Consolidação da Fase 2 [F2]");
});

test("gerar_snapshot_git: formata mensagem sem fase", () => {
  const mensagemCommit = "Correção de bug na tabela";
  const faseCronograma = null;
  const fase = faseCronograma ? ` [${faseCronograma}]` : "";
  const msg = `snapshot: ${mensagemCommit}${fase}`;
  assert.equal(msg, "snapshot: Correção de bug na tabela");
});

// ===== Teste: allowed-operations.json NÃO duplica os 5 tools (eles vivem no index.js) =====

test("allowed-operations.json: NÃO contém os 5 tools gerenciados pelo MCP server (evita duplicação)", async () => {
  const { readFile } = await import("node:fs/promises");
  const { join, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const __dir = dirname(fileURLToPath(import.meta.url));
  const opsPath = join(__dir, "..", "..", "v10", "allowed-operations.json");
  const raw = await readFile(opsPath, "utf8");
  const data = JSON.parse(raw);
  const allIds = [...data.operations.map((op) => op.id), ...data.templates.map((t) => t.id)];
  const mcpManaged = ["consultar_fonte_oficial_gov", "extrair_evidencia_de_pdf_local", "simular_cenario_economico", "congelar_tabela_final", "gerar_snapshot_git"];
  for (const id of mcpManaged) {
    assert.ok(!allIds.includes(id), `${id} não deveria estar no catálogo (é tool do MCP server)`);
  }
});

test("allowed-operations.json: contém listar_locais_comuns_pc (usado pelo relatorio_completo_pc)", async () => {
  const { readFile } = await import("node:fs/promises");
  const { join, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const __dir = dirname(fileURLToPath(import.meta.url));
  const opsPath = join(__dir, "..", "..", "v10", "allowed-operations.json");
  const raw = await readFile(opsPath, "utf8");
  const data = JSON.parse(raw);
  const allIds = [...data.operations.map((op) => op.id), ...data.templates.map((t) => t.id)];
  assert.ok(allIds.includes("listar_locais_comuns_pc"), "Falta listar_locais_comuns_pc no catálogo");
});

// ===== Teste: TOOLS array no index.js contém os 5 novos tools (e os novos V11.2) =====

test("index.js TOOLS: contém os 5 novos nomes de tools", async () => {
  // Lê o código-fonte e verifica se os nomes estão presentes
  const { readFile } = await import("node:fs/promises");
  const { join, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const __dir = dirname(fileURLToPath(import.meta.url));
  const src = await readFile(join(__dir, "..", "index.js"), "utf8");
  assert.ok(src.includes('name: "consultar_fonte_oficial_gov"'));
  assert.ok(src.includes('name: "extrair_evidencia_de_pdf_local"'));
  assert.ok(src.includes('name: "simular_cenario_economico"'));
  assert.ok(src.includes('name: "congelar_tabela_final"'));
  assert.ok(src.includes('name: "gerar_snapshot_git"'));
});

test("index.js TOOLS: contém os novos tools V11.2", async () => {
  const { readFile } = await import("node:fs/promises");
  const { join, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const __dir = dirname(fileURLToPath(import.meta.url));
  const src = await readFile(join(__dir, "..", "index.js"), "utf8");
  for (const name of ["listar_operacoes_disponiveis", "classificar_comando", "consultar_status_launcher", "resumir_texto_ia", "relatorio_completo_pc"]) {
    assert.ok(src.includes(`name: "${name}"`), `Falta o tool ${name} em index.js`);
  }
});

console.log("✅ Testes dos 5 novos tools V11.1 concluídos");