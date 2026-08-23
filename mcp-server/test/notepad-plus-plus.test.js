import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { createServer as createHttpServer } from "node:http";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../../", import.meta.url));

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
      const response = await fetch(url + "/ping");
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Launcher Node nao iniciou no prazo.");
}

async function startMockOllama(port) {
  const server = createHttpServer((req, res) => {
    if (req.url === "/api/chat" && req.method === "POST") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: { content: "Resposta simulada do Ollama" } }));
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  return server;
}

test("endpoint /npp retorna 501 quando MESTRE_NPP_TOKEN nao esta configurado", async (t) => {
  const port = await reservePort();
  const base = `http://127.0.0.1:${port}`;
  const { MESTRE_NPP_TOKEN, ...envSemNppToken } = process.env;
  const child = spawn(process.execPath, [join(root, "v10", "launcher.js")], {
    cwd: join(root, "v10"),
    env: { ...envSemNppToken, MPC_PORT: String(port) },
    windowsHide: true,
    stdio: "ignore",
  });
  t.after(() => child.kill());

  await waitForServer(base);

  const res = await fetch(base + "/npp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Mestre-Client": "notepad-plus-plus",
      "X-Mestre-Npp-Token": "qualquer",
    },
    body: JSON.stringify({ action: "explain_code", payload: { text: "echo oi" } }),
  });
  assert.equal(res.status, 501);
  const data = await res.json();
  assert.equal(data.success, false);
  assert.match(data.error || "", /não configurada/i);
});

test("endpoint /npp retorna 403 com token invalido", async (t) => {
  const port = await reservePort();
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [join(root, "v10", "launcher.js")], {
    cwd: join(root, "v10"),
    env: {
      ...process.env,
      MPC_PORT: String(port),
      MESTRE_NPP_TOKEN: "token-valido",
    },
    windowsHide: true,
    stdio: "ignore",
  });
  t.after(() => child.kill());

  await waitForServer(base);

  const res = await fetch(base + "/npp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Mestre-Client": "notepad-plus-plus",
      "X-Mestre-Npp-Token": "token-errado",
    },
    body: JSON.stringify({ action: "explain_code", payload: { text: "echo oi" } }),
  });
  assert.equal(res.status, 403);
});

test("endpoint /npp retorna 400 para acao nao permitida", async (t) => {
  const port = await reservePort();
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [join(root, "v10", "launcher.js")], {
    cwd: join(root, "v10"),
    env: {
      ...process.env,
      MPC_PORT: String(port),
      MESTRE_NPP_TOKEN: "token-valido",
    },
    windowsHide: true,
    stdio: "ignore",
  });
  t.after(() => child.kill());

  await waitForServer(base);

  const res = await fetch(base + "/npp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Mestre-Client": "notepad-plus-plus",
      "X-Mestre-Npp-Token": "token-valido",
    },
    body: JSON.stringify({ action: "destruir_sistema", payload: {} }),
  });
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.success, false);
});

test("endpoint /npp executa explain_code com token valido e Ollama simulado", async (t) => {
  const port = await reservePort();
  const ollamaPort = await reservePort();
  const base = `http://127.0.0.1:${port}`;
  const ollamaUrl = `http://127.0.0.1:${ollamaPort}`;
  const ollamaServer = await startMockOllama(ollamaPort);

  const child = spawn(process.execPath, [join(root, "v10", "launcher.js")], {
    cwd: join(root, "v10"),
    env: {
      ...process.env,
      MPC_PORT: String(port),
      MESTRE_NPP_TOKEN: "token-valido",
      OLLAMA_URL: ollamaUrl,
      OLLAMA_MODEL: "modelo-teste",
    },
    windowsHide: true,
    stdio: "ignore",
  });

  t.after(() => {
    child.kill();
    ollamaServer.close();
  });

  await waitForServer(base);

  const res = await fetch(base + "/npp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Mestre-Client": "notepad-plus-plus",
      "X-Mestre-Npp-Token": "token-valido",
    },
    body: JSON.stringify({ action: "explain_code", payload: { text: "Get-Process" } }),
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.equal(data.output, "Resposta simulada do Ollama");
});
