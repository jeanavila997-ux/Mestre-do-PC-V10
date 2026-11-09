import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import "./helpers/launcher-test-env.js";
import { CATALOG } from "../../v10/providers/index.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const ENV_KEYS = ["OPENCODE_GO_API_KEY", "OPENCODE_GO_BASE_URL", "OPENCODE_GO_MODEL", "MPC_PROVIDERS_FILE"];
const DEFAULT_BASE = "https://opencode.ai/inference/go/openai/v1";

function snapshotEnv() {
  return Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
}

function restoreEnv(saved) {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
}

async function loadIsolated() {
  const dir = mkdtempSync(join(tmpdir(), "opencode-go-"));
  process.env.MPC_PROVIDERS_FILE = join(dir, "providers.json");
  return import(`../../v10/providers/index.js?isolated=${Date.now()}-${Math.random()}`);
}

test("catálogo do OpenCode Go usa a API v2 compatível com OpenAI", () => {
  const entry = CATALOG["opencode-go"];
  assert.ok(entry);
  assert.equal(entry.implemented, true);
  assert.equal(entry.type, "openai");
  assert.equal(entry.baseUrl, DEFAULT_BASE);
  assert.equal(entry.envKey, "OPENCODE_GO_API_KEY");
  assert.equal(entry.envBaseUrl, "OPENCODE_GO_BASE_URL");
  assert.equal(entry.envModel, "OPENCODE_GO_MODEL");
  assert.equal(entry.model, "kimi-k2.7-code");
  assert.equal(entry.sessionHeader, "x-opencode-session");
});

test("sem chave o OpenCode Go fica não configurado e não chama a rede", async () => {
  const saved = snapshotEnv();
  delete process.env.OPENCODE_GO_API_KEY;
  delete process.env.OPENCODE_GO_BASE_URL;
  delete process.env.OPENCODE_GO_MODEL;
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => { called = true; throw new Error("não deveria chamar a rede"); };
  try {
    const mod = await loadIsolated();
    const listed = mod.listProviders().providers.find((p) => p.id === "opencode-go");
    assert.equal(listed.configured, false);
    assert.equal(listed.status, "not_configured");
    assert.equal(listed.enabled, false);
    assert.equal(listed.hasKey, false);
    await assert.rejects(
      () => mod.chat([{ role: "user", content: "oi" }], { provider: "opencode-go" }),
      /OpenCode Go não configurado\. Defina OPENCODE_GO_API_KEY/,
    );
    await assert.rejects(
      () => mod.chatStream([{ role: "user", content: "oi" }], { writeHead() {}, write() {}, end() {} }, { provider: "opencode-go" }),
      /não configurado/,
    );
    const tested = await mod.testProvider("opencode-go");
    assert.equal(tested.ok, false);
    assert.match(tested.error, /não configurado/);
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(saved);
  }
});

test("env define chave, base e modelo e o chat usa Chat Completions", async () => {
  const saved = snapshotEnv();
  process.env.OPENCODE_GO_API_KEY = "oc_sk_test_placeholder";
  process.env.OPENCODE_GO_BASE_URL = "https://proxy.example/openai/v1";
  process.env.OPENCODE_GO_MODEL = "glm-5.3-flash";
  const originalFetch = globalThis.fetch;
  let seen;
  globalThis.fetch = async (url, opts) => {
    seen = { url: String(url), headers: opts.headers, body: JSON.parse(opts.body) };
    return new Response(JSON.stringify({ choices: [{ message: { content: "olá" } }] }), { status: 200 });
  };
  try {
    const mod = await loadIsolated();
    const provider = mod.getProvider("opencode-go");
    assert.equal(provider.configured, true);
    assert.equal(provider.baseUrl, "https://proxy.example/openai/v1");
    assert.equal(provider.model, "glm-5.3-flash");
    const result = await mod.chat([{ role: "user", content: "oi" }], { provider: "opencode-go", sessionId: "conv-1" });
    assert.equal(result.provider, "opencode-go");
    assert.equal(result.model, "glm-5.3-flash");
    assert.equal(result.content, "olá");
    assert.equal(seen.url, "https://proxy.example/openai/v1/chat/completions");
    assert.equal(seen.headers.Authorization, "Bearer oc_sk_test_placeholder");
    assert.equal(seen.headers["User-Agent"], "MestreDoPC/11.2.1");
    assert.equal(seen.headers["x-opencode-session"], "ses_conv-1");
    assert.equal(seen.body.stream, false);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(saved);
  }
});

test("base oficial do plano Go e URL inválida não quebram o provedor", async () => {
  const saved = snapshotEnv();
  process.env.OPENCODE_GO_API_KEY = "oc_sk_test_placeholder";
  const originalFetch = globalThis.fetch;
  let modelsUrl = "";
  globalThis.fetch = async (url) => {
    modelsUrl = String(url);
    return new Response(JSON.stringify({ data: [{ id: "kimi-k2.7-code" }] }), { status: 200 });
  };
  try {
    process.env.OPENCODE_GO_BASE_URL = "https://opencode.ai/inference/go";
    delete process.env.OPENCODE_GO_MODEL;
    let mod = await loadIsolated();
    assert.equal(mod.getProvider("opencode-go").baseUrl, DEFAULT_BASE);
    assert.equal(mod.getProvider("opencode-go").model, "kimi-k2.7-code");
    const models = await mod.listModels("opencode-go");
    assert.deepEqual(models, ["kimi-k2.7-code"]);
    assert.equal(modelsUrl, "https://opencode.ai/inference/go/v1/models");

    process.env.OPENCODE_GO_BASE_URL = "file:///tmp/chave";
    process.env.OPENCODE_GO_MODEL = "ruim\nmodelo";
    mod = await loadIsolated();
    assert.equal(mod.getProvider("opencode-go").baseUrl, DEFAULT_BASE);
    assert.equal(mod.getProvider("opencode-go").model, "kimi-k2.7-code");
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(saved);
  }
});

test("base salva só aceita https em opencode.ai; a env pode apontar outro host", async () => {
  const saved = snapshotEnv();
  delete process.env.OPENCODE_GO_BASE_URL;
  process.env.OPENCODE_GO_API_KEY = "oc_sk_test_placeholder";
  const dir = mkdtempSync(join(tmpdir(), "opencode-go-base-"));
  const file = join(dir, "providers.json");
  process.env.MPC_PROVIDERS_FILE = file;
  try {
    const mod = await import(`../../v10/providers/index.js?base=${Date.now()}-${Math.random()}`);
    assert.throws(
      () => mod.updateProvider("opencode-go", { baseUrl: "https://evil.example/v1" }),
      /opencode\.ai/,
    );
    assert.throws(
      () => mod.updateProvider("opencode-go", { baseUrl: "http://opencode.ai/inference/go/openai/v1" }),
      /https/,
    );
    assert.throws(
      () => mod.updateProvider("opencode-go", { baseUrl: "https://opencode.ai.evil.com/v1" }),
      /opencode\.ai/,
    );
    mod.updateProvider("opencode-go", { baseUrl: "https://opencode.ai/inference/go" });
    assert.equal(mod.getProvider("opencode-go").baseUrl, DEFAULT_BASE);

    writeFileSync(file, JSON.stringify({
      providers: { "opencode-go": { baseUrl: "http://evil.example/v1" } },
    }));
    assert.equal(mod.getProvider("opencode-go").baseUrl, DEFAULT_BASE);

    process.env.OPENCODE_GO_BASE_URL = "https://proxy.example/openai/v1";
    assert.equal(mod.getProvider("opencode-go").baseUrl, "https://proxy.example/openai/v1");
  } finally {
    restoreEnv(saved);
  }
});

test("provedor explícito não usa o próximo da fila quando a chamada falha", async () => {
  const saved = snapshotEnv();
  process.env.OPENCODE_GO_API_KEY = "oc_sk_test_placeholder";
  delete process.env.OPENCODE_GO_BASE_URL;
  const originalFetch = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    return new Response("falhou", { status: 502 });
  };
  try {
    const mod = await loadIsolated();
    await assert.rejects(
      () => mod.chat([{ role: "user", content: "oi" }], { provider: "opencode-go" }),
      /opencode-go: HTTP 502/,
    );
    assert.deepEqual(urls, [DEFAULT_BASE + "/chat/completions"]);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(saved);
  }
});

test("o seletor do chat e a página de chaves mostram o estado não configurado", async () => {
  const chat = await readFile(join(root, "v10", "chat-integrado", "chat-integrado.js"), "utf8");
  const page = await readFile(join(root, "v10", "chaves-api.html"), "utf8");
  assert.match(chat, /opencode-go/);
  assert.match(chat, /não configurado/);
  assert.match(chat, /\/providers\/chat/);
  assert.match(page, /não configurado/);
});

async function reservePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForServer(url) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url + "/ping")).ok) return;
    } catch { /* ainda subindo */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Launcher não iniciou");
}

test("POST /providers/chat sem chave responde 400 e o launcher continua no ar", async (t) => {
  const port = await reservePort();
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [join(root, "v10", "launcher.js")], {
    cwd: join(root, "v10"),
    env: {
      ...process.env,
      MPC_PORT: String(port),
      MPC_PROVIDERS_FILE: join(mkdtempSync(join(tmpdir(), "opencode-go-spawn-")), "providers.json"),
      OPENCODE_GO_API_KEY: "",
      OPENCODE_GO_BASE_URL: "",
      OPENCODE_GO_MODEL: "",
    },
    windowsHide: true,
    stdio: "ignore",
  });
  t.after(() => child.kill());
  await waitForServer(base);

  const anon = await fetch(base + "/providers");
  assert.equal(anon.status, 403);
  const anonChat = await fetch(base + "/providers/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider: "opencode-go", messages: [{ role: "user", content: "oi" }] }),
  });
  assert.equal(anonChat.status, 403);
  assert.match((await anonChat.json()).error, /não autorizado/);

  const spoof = await fetch(base + "/providers/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Mestre-Client": "v10-web",
      Origin: "https://evil.example",
    },
    body: JSON.stringify({ provider: "opencode-go", messages: [{ role: "user", content: "oi" }] }),
  });
  assert.equal(spoof.status, 403);

  const headers = { "Content-Type": "application/json", "X-Mestre-Client": "v10-web", Origin: base };
  const listed = await fetch(base + "/providers", { headers });
  assert.equal(listed.status, 200);
  const catalog = await listed.json();
  const go = catalog.providers.find((p) => p.id === "opencode-go");
  assert.equal(go.status, "not_configured");
  assert.equal(go.hasKey, false);

  const res = await fetch(base + "/providers/chat", {
    method: "POST",
    headers,
    body: JSON.stringify({
      provider: "opencode-go",
      stream: true,
      messages: [{ role: "user", content: "oi" }],
    }),
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /não configurado/);

  const notText = await fetch(base + "/providers/chat", {
    method: "POST",
    headers,
    body: JSON.stringify({
      provider: "opencode-go",
      messages: [{ role: "user", content: [{ type: "text", text: "oi" }] }],
    }),
  });
  assert.equal(notText.status, 400);
  assert.match((await notText.json()).error, /texto/);
  assert.equal((await fetch(base + "/ping")).ok, true);
});
