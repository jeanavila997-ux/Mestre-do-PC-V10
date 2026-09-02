import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
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

const JSONH = { "Content-Type": "application/json", "X-Mestre-Client": "mcp" };

test("rotas /soul: lista perfis, exige autorização e rejeita IDs fora da whitelist", async (t) => {
  // Pasta temporária isolada: nada escreve nos Soul.md reais do usuário.
  const soulDir = join(root, "logs", "test-soul-" + Date.now());
  await mkdir(soulDir, { recursive: true });
  await writeFile(join(soulDir, "chat-Soul.md"), "# Soul de teste\nlinha 1", "utf8");
  await writeFile(join(soulDir, "workspace-SOUL.md"), "# SOUL de teste\nlinha A", "utf8");
  t.after(async () => { await rm(soulDir, { recursive: true, force: true }); });

  const port = await reservePort();
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [join(root, "v10", "launcher.js")], {
    cwd: join(root, "v10"),
    env: { ...process.env, MPC_PORT: String(port), MESTRE_SOUL_DIR: soulDir },
    windowsHide: true,
    stdio: "ignore",
  });
  t.after(() => child.kill());

  await waitForServer(base);

  // Sem header X-Mestre-Client → 403
  const noAuth = await fetch(base + "/soul", {
    headers: { Origin: base },
  });
  assert.equal(noAuth.status, 403);

  // GET /soul — lista os dois perfis
  const listRes = await fetch(base + "/soul", { headers: JSONH });
  assert.equal(listRes.status, 200);
  const list = await listRes.json();
  assert.equal(list.success, true);
  const ids = list.profiles.map((p) => p.id).sort();
  assert.deepEqual(ids, ["chat", "workspace"]);
  assert.ok(list.profiles.every((p) => typeof p.title === "string" && typeof p.path === "string"));

  // GET /soul/chat — conteúdo do arquivo isolado
  const chatRes = await fetch(base + "/soul/chat", { headers: JSONH });
  assert.equal(chatRes.status, 200);
  const chat = await chatRes.json();
  assert.equal(chat.success, true);
  assert.match(chat.profile.content, /Soul de teste/);

  // GET /soul/:id fora da whitelist → 404 (sem path traversal)
  // Nota: ".." cru e formas puras de dot-segment (".", "%2E%2E", ".%2e") são
  // normalizadas pelo parser de URL (spec WHATWG, no cliente e no servidor)
  // antes de chegar ao handler; formas com sufixo chegam literais e devem
  // cair na whitelist.
  for (const bad of ["..%2Fpackage.json", "%2E%2E%2Flauncher.js", "inexistente", "chat%2F..%2F..%2Fsecret"]) {
    const badRes = await fetch(base + "/soul/" + bad, { headers: JSONH });
    assert.equal(badRes.status, 404, `esperava 404 para id ${bad}`);
  }

  // PUT /soul/:id fora da whitelist → 404/400 (nunca grava fora da whitelist)
  const badPut = await fetch(base + "/soul/%2E%2E%2F..%2Fetc%2Fhosts", {
    method: "PUT", headers: JSONH, body: JSON.stringify({ content: "x" }),
  });
  assert.ok(badPut.status === 404 || badPut.status === 400, "PUT com id inválido não deve gravar");
});

test("rota /soul: PUT grava conteúdo e cria backup .bak", async (t) => {
  const soulDir = join(root, "logs", "test-soul-" + Date.now());
  await mkdir(soulDir, { recursive: true });
  const original = "# Soul original";
  await writeFile(join(soulDir, "chat-Soul.md"), original, "utf8");
  t.after(async () => { await rm(soulDir, { recursive: true, force: true }); });

  const port = await reservePort();
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [join(root, "v10", "launcher.js")], {
    cwd: join(root, "v10"),
    env: { ...process.env, MPC_PORT: String(port), MESTRE_SOUL_DIR: soulDir },
    windowsHide: true,
    stdio: "ignore",
  });
  t.after(() => child.kill());

  await waitForServer(base);

  // PUT sem content → 400
  const noContent = await fetch(base + "/soul/chat", {
    method: "PUT", headers: JSONH, body: JSON.stringify({ outro: "x" }),
  });
  assert.equal(noContent.status, 400);

  // PUT válido → grava e cria .bak com o conteúdo anterior
  const novo = "# Soul atualizado pelo teste\n- nova diretriz";
  const putRes = await fetch(base + "/soul/chat", {
    method: "PUT", headers: JSONH, body: JSON.stringify({ content: novo }),
  });
  assert.equal(putRes.status, 200);
  const put = await putRes.json();
  assert.equal(put.success, true);

  const onDisk = await readFile(join(soulDir, "chat-Soul.md"), "utf8");
  assert.equal(onDisk, novo);
  const backup = await readFile(join(soulDir, "chat-Soul.md.bak"), "utf8");
  assert.equal(backup, original);

  // PUT acima do limite → 400
  const tooBig = await fetch(base + "/soul/chat", {
    method: "PUT",
    headers: JSONH,
    body: JSON.stringify({ content: "x".repeat(300 * 1024) }),
  });
  assert.equal(tooBig.status, 400);
});