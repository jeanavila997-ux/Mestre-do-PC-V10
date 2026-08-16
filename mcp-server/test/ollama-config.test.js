import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../../", import.meta.url));

test("index.js declara configuracoes de Ollama cloud e opcoes de modelo", async () => {
  const src = await readFile(join(root, "mcp-server", "index.js"), "utf8");

  // Cloud API key support
  assert.match(src, /OLLAMA_API_KEY/);
  assert.match(src, /ollama\.com\/api/);
  assert.match(src, /Authorization.*Bearer/);

  // Configurable model options from env
  assert.match(src, /OLLAMA_TEMPERATURE/);
  assert.match(src, /OLLAMA_TOP_P/);
  assert.match(src, /OLLAMA_TOP_K/);
  assert.match(src, /OLLAMA_KEEP_ALIVE/);
  assert.match(src, /OLLAMA_SEED/);

  // Helper functions
  assert.match(src, /function buildOllamaOptions/);
  assert.match(src, /function ollamaHeaders/);
  assert.match(src, /function ollamaChat/);
  assert.match(src, /function parseOllamaError/);
  assert.match(src, /function formatOllamaMeta/);

  // keep_alive and options in requests
  assert.match(src, /keep_alive/);

  // Thinking support
  assert.match(src, /think/);
});

test("perguntar_ia aceita parametro pensar para modo thinking", async () => {
  const src = await readFile(join(root, "mcp-server", "index.js"), "utf8");
  assert.match(src, /pensar.*thinking/);
  assert.match(src, /pensar.*true/);
});

test("verificar_modelo_ollama suporta cloud com auth header", async () => {
  const src = await readFile(join(root, "mcp-server", "index.js"), "utf8");
  // Handler should use ollamaHeaders() and detect cloud mode
  const handlerIdx = src.indexOf('name === "verificar_modelo_ollama"');
  assert.ok(handlerIdx > 0, "verificar_modelo_ollama handler not found");
  const handlerBlock = src.slice(handlerIdx, handlerIdx + 1500);
  assert.match(handlerBlock, /ollamaHeaders/);
  assert.match(handlerBlock, /ollama\.com/);
});

test("analisar_logs_sistema usa ollamaChat com system prompt e meta", async () => {
  const src = await readFile(join(root, "mcp-server", "index.js"), "utf8");
  const handlerIdx = src.indexOf('name === "analisar_logs_sistema"');
  assert.ok(handlerIdx > 0, "analisar_logs_sistema handler not found");
  const handlerBlock = src.slice(handlerIdx, handlerIdx + 1500);
  assert.match(handlerBlock, /ollamaChat/);
  assert.match(handlerBlock, /OLLAMA_SYSTEM_PROMPT/);
  assert.match(handlerBlock, /result\.meta/);
});

test("API key nao esta hardcoded no codigo fonte", async () => {
  const src = await readFile(join(root, "mcp-server", "index.js"), "utf8");
  // The key should only come from env, never literal in source
  assert.doesNotMatch(src, /9ddeb02f3a5140a098d8c14340393c57/);
  assert.match(src, /process\.env\.OLLAMA_API_KEY/);
});

test("model-profiles.json existe e contem perfis de automacao local", async () => {
  const profiles = JSON.parse(await readFile(join(root, "mcp-server", "model-profiles.json"), "utf8"));
  assert.ok(profiles.defaultProfile, "defaultProfile deve estar definido");
  assert.ok(profiles.profiles, "profiles deve existir");
  const ids = Object.keys(profiles.profiles);
  assert.ok(ids.includes("balanced"), "deve haver perfil balanced");
  assert.ok(ids.includes("agent"), "deve haver perfil agent");
  for (const [id, p] of Object.entries(profiles.profiles)) {
    assert.ok(p.label, `perfil ${id} deve ter label`);
    assert.ok(p.model, `perfil ${id} deve ter model`);
    assert.ok(p.options?.num_ctx, `perfil ${id} deve ter num_ctx`);
  }
});

test("index.js carrega perfis e suporta OLLAMA_MODEL_PROFILE", async () => {
  const src = await readFile(join(root, "mcp-server", "index.js"), "utf8");
  assert.match(src, /model-profiles\.json/);
  assert.match(src, /OLLAMA_MODEL_PROFILE/);
  assert.match(src, /function getProfileModel/);
  assert.match(src, /function getProfileOptions/);
  assert.match(src, /function listProfiles/);
});

test("index.js expoe ferramentas de perfil de modelo", async () => {
  const src = await readFile(join(root, "mcp-server", "index.js"), "utf8");
  assert.match(src, /name: "listar_perfis_modelo"/);
  assert.match(src, /name: "definir_perfil_modelo"/);
  assert.match(src, /if \(name === "listar_perfis_modelo"\)/);
  assert.match(src, /if \(name === "definir_perfil_modelo"\)/);
});

test("launcher /mcp-status expoe perfil e modelo ativo", async () => {
  const src = await readFile(join(root, "v10", "launcher.js"), "utf8");
  const handlerIdx = src.indexOf('path === "/mcp-status"');
  assert.ok(handlerIdx > 0, "/mcp-status handler not found");
  const handlerBlock = src.slice(handlerIdx, handlerIdx + 500);
  assert.match(handlerBlock, /modelProfile/);
  assert.match(handlerBlock, /model:/);
});