import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { readFile } from "node:fs/promises";
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
  throw new Error("Launcher Node não iniciou no prazo.");
}

test("launcher rejeita requisicoes da extensao sem token", async (t) => {
  const port = await reservePort();
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [join(root, "v10", "launcher.js")], {
    cwd: join(root, "v10"),
    env: { ...process.env, MPC_PORT: String(port) },
    windowsHide: true,
    stdio: "ignore",
  });
  t.after(() => child.kill());

  await waitForServer(base);

  const res = await fetch(base + "/run", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Origin": "chrome-extension://fakeid",
      "X-Mestre-Client": "browser-extension",
      "X-Mestre-Extension-Token": "wrong",
    },
    body: JSON.stringify({ id: "ver_uso_ram" }),
  });
  assert.equal(res.status, 403);
});

test("launcher aceita requisicoes da extensao com token e origem permitida", async (t) => {
  const port = await reservePort();
  const base = `http://127.0.0.1:${port}`;
  const extensionOrigin = "chrome-extension://abcdefghijklmnopqrstuvwxyz";
  const child = spawn(process.execPath, [join(root, "v10", "launcher.js")], {
    cwd: join(root, "v10"),
    env: {
      ...process.env,
      MPC_PORT: String(port),
      MESTRE_EXTENSION_TOKEN: "test-token-123",
      MESTRE_EXTENSION_ORIGINS: extensionOrigin,
    },
    windowsHide: true,
    stdio: "ignore",
  });
  t.after(() => child.kill());

  await waitForServer(base);

  const preflight = await fetch(base + "/run", {
    method: "OPTIONS",
    headers: { Origin: extensionOrigin },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), extensionOrigin);

  const run = await fetch(base + "/run", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Origin": extensionOrigin,
      "X-Mestre-Client": "browser-extension",
      "X-Mestre-Extension-Token": "test-token-123",
    },
    body: JSON.stringify({ id: "ver_uso_ram" }),
  });
  assert.equal(run.status, 202);
  const data = await run.json();
  assert.equal(data.success, true);
  assert.ok(data.jobId);

  const ping = await fetch(base + "/ping", {
    headers: { Origin: extensionOrigin },
  });
  assert.equal(ping.status, 200);
  assert.equal(ping.headers.get("access-control-allow-origin"), extensionOrigin);
});

test("launcher rejeita origem de extensao nao allowlistada mesmo com token", async (t) => {
  const port = await reservePort();
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [join(root, "v10", "launcher.js")], {
    cwd: join(root, "v10"),
    env: {
      ...process.env,
      MPC_PORT: String(port),
      MESTRE_EXTENSION_TOKEN: "test-token-123",
      MESTRE_EXTENSION_ORIGINS: "chrome-extension://allowed",
    },
    windowsHide: true,
    stdio: "ignore",
  });
  t.after(() => child.kill());

  await waitForServer(base);

  const res = await fetch(base + "/run", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Origin": "chrome-extension://other",
      "X-Mestre-Client": "browser-extension",
      "X-Mestre-Extension-Token": "test-token-123",
    },
    body: JSON.stringify({ id: "ver_uso_ram" }),
  });
  assert.equal(res.status, 403);
});

test("manifest da extensao eh JSON valido e declara permissoes minimas", async () => {
  const manifest = JSON.parse(await readFile(join(root, "browser-extension", "manifest.json")));
  assert.equal(manifest.manifest_version, 3);
  assert.ok(manifest.permissions.includes("storage"));
  assert.ok(manifest.permissions.includes("activeTab"));
  assert.ok(manifest.host_permissions.includes("http://127.0.0.1:7777/*"));
  assert.ok(manifest.action.default_popup);
  assert.ok(manifest.background.service_worker);
});

test("manifest firefox existe e usa scripts em vez de service_worker", async () => {
  const manifest = JSON.parse(await readFile(join(root, "browser-extension", "manifest-firefox.json")));
  assert.equal(manifest.manifest_version, 3);
  assert.ok(manifest.browser_specific_settings?.gecko?.id);
  assert.ok(Array.isArray(manifest.background.scripts));
  assert.ok(manifest.background.scripts.includes("background.js"));
});

test("script de build da extensao existe e eh valido", async () => {
  const buildPath = join(root, "browser-extension", "build.js");
  const buildSrc = await readFile(buildPath, "utf8");
  assert.match(buildSrc, /Compress-Archive/);
  assert.match(buildSrc, /manifest-firefox\.json/);
});
