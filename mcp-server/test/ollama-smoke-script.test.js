import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, statSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const SCRIPT = join(ROOT, "scripts", "test_ollama.mjs");

test("scripts/test_ollama.mjs existe e eh executavel como modulo", () => {
  assert.ok(existsSync(SCRIPT), "scripts/test_ollama.mjs deve existir");
  const s = statSync(SCRIPT);
  assert.ok(s.isFile(), "deve ser um arquivo");
  assert.ok(s.size > 200, "arquivo nao deve estar vazio");
});

test("scripts/test_ollama.mjs passa no node --check", () => {
  const r = spawnSync(process.execPath, ["--check", SCRIPT], { encoding: "utf8" });
  assert.equal(r.status, 0, `node --check falhou: ${r.stderr}`);
});

test("scripts/test_ollama.mjs usa fetch nativo (sem deps externas) e nunca loga a API key", () => {
  const src = readFileSync(SCRIPT, "utf8");
  assert.match(src, /import process from 'node:process'/);
  assert.match(src, /await fetch\(/);
  assert.doesNotMatch(src, /from ['"]ollama['"]/, "nao deve depender do pacote 'ollama'");
  assert.doesNotMatch(src, /console\.(log|info|error)\([^)]*OLLAMA_API_KEY/, "nao deve logar OLLAMA_API_KEY");
  // Deve respeitar timeout via AbortController
  assert.match(src, /AbortController/);
  assert.match(src, /TIMEOUT_MS/);
});

test("scripts/test_ollama.mjs roda contra o Ollama local (smoke test)", { skip: !process.env.RUN_OLLAMA_SMOKE ? "set RUN_OLLAMA_SMOKE=1 para habilitar" : false }, () => {
  const r = spawnSync(
    process.execPath,
    [SCRIPT],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        OLLAMA_HOST: "http://localhost:11434",
        OLLAMA_MODEL: "qwen2.5-coder:3b-instruct",
        PROMPT: "Reply with exactly: pong",
        TIMEOUT_MS: "30000",
        // Garante que nenhum header de auth seja enviado no teste local
        OLLAMA_API_KEY: "",
      },
    }
  );
  assert.equal(r.status, 0, `script saiu com codigo ${r.status}\nstdout=${r.stdout}\nstderr=${r.stderr}`);
  assert.match(r.stdout, /pong/);
});

test("scripts/test_ollama.mjs sai com codigo != 0 quando Ollama retorna HTTP de erro", () => {
  const r = spawnSync(
    process.execPath,
    [SCRIPT],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        OLLAMA_HOST: "http://127.0.0.1:1", // porta invalida -> conexao falha
        OLLAMA_MODEL: "qualquer",
        PROMPT: "x",
        TIMEOUT_MS: "3000",
      },
    }
  );
  assert.notEqual(r.status, 0, "deve falhar com exit code != 0");
});
