import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import readline from "node:readline/promises";

const scrypt = promisify(scryptCallback);
const __dirname = dirname(fileURLToPath(import.meta.url));
const file = process.env.MOBILE_AUTH_FILE || join(__dirname, "data", "users.json");
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const username = (await rl.question("Usuário Android: ")).trim().toLowerCase();
const password = await rl.question("Senha Android: ");
rl.close();
if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username) || password.length < 10) throw new Error("Usuário inválido ou senha menor que 10 caracteres.");
const salt = randomBytes(16);
const hash = await scrypt(password, salt, 64);
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const bytes = randomBytes(20); let bits = ""; for (const byte of bytes) bits += byte.toString(2).padStart(8, "0");
let secret = ""; for (let i = 0; i < bits.length; i += 5) secret += alphabet[parseInt(bits.slice(i, i + 5).padEnd(5, "0"), 2)];
let data = { users: [] }; try { data = JSON.parse(await readFile(file, "utf8")); } catch (error) { if (error.code !== "ENOENT") throw error; }
data.users = (data.users || []).filter((item) => item.username !== username);
data.users.push({ username, passwordHash: `${salt.toString("hex")}:${hash.toString("hex")}`, totpSecret: secret, createdAt: new Date().toISOString() });
await mkdir(dirname(file), { recursive: true }); await writeFile(file, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
console.log(`Usuário criado em ${file}`);
console.log(`Registre no autenticador: otpauth://totp/Mestre%20do%20PC:${encodeURIComponent(username)}?secret=${secret}&issuer=Mestre%20do%20PC`);
