import test from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac, randomBytes, scrypt as scryptCallback } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const temp = await mkdtemp(join(tmpdir(), "mestre-mobile-test-"));
const authFile = join(temp, "users.json");
const salt = randomBytes(16);
const passwordHash = await scrypt("senha-de-teste-123", salt, 64);
const secret = "JBSWY3DPEHPK3PXP";
await writeFile(authFile, JSON.stringify({ users: [{ username: "jean", passwordHash: `${salt.toString("hex")}:${passwordHash.toString("hex")}`, totpSecret: secret }] }));
process.env.MOBILE_AUTH_FILE = authFile;
process.env.MOBILE_COOKIE_SECURE = "0";
const { createMobileGateway } = await import("../server.mjs");
const server = createMobileGateway();
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;
function totp(value, counter = Math.floor(Date.now() / 30000)) { const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let bits = ""; for (const char of value) bits += alphabet.indexOf(char).toString(2).padStart(5, "0"); const bytes = []; for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2)); const input = Buffer.alloc(8); input.writeBigUInt64BE(BigInt(counter)); const digest = createHmac("sha1", Buffer.from(bytes)).update(input).digest(); const offset = digest.at(-1) & 15; return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, "0"); }

test("gateway expõe health e exige autenticação nas APIs", async () => {
  assert.equal((await fetch(`${base}/health`)).status, 200);
  assert.equal((await fetch(`${base}/api/session`)).status, 401);
});
test("login exige senha e TOTP e cria sessão", async () => {
  const login = await fetch(`${base}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "jean", password: "senha-de-teste-123" }) });
  assert.equal(login.status, 200); const { challengeId } = await login.json();
  const verified = await fetch(`${base}/auth/2fa/verify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ challengeId, code: totp(secret) }) });
  assert.equal(verified.status, 200); const cookie = verified.headers.get("set-cookie").split(";")[0];
  const session = await fetch(`${base}/api/session`, { headers: { cookie } });
  assert.deepEqual(await session.json(), { ok: true, user: "jean" });
});

test.after(async () => { await new Promise((resolve) => server.close(resolve)); await rm(temp, { recursive: true, force: true }); });
