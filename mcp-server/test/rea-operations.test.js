import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { loadOperationRegistry } from "../../v10/operation-registry.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const registry = await loadOperationRegistry();
const REA_IDS = ["eng_reversa_status", "eng_reversa_doctor", "eng_reversa_analisar_app_js"];

test("rea: operações da whitelist existem e estão saudáveis", () => {
  for (const id of REA_IDS) {
    const op = registry.getById(id);
    assert.ok(op, `operação ausente: ${id}`);
    assert.equal(op.category, "Engenharia Reversa (REA)");
    assert.equal(op.destructive, false, `${id} deve ser read-only`);
    assert.ok(String(op.description || "").length > 20, `${id} precisa descrever o uso`);
    const command = op.command || op.pattern;
    assert.match(command, /rea-cli\.mjs/, `${id} deve chamar a ponte do REA`);
  }
});

test("rea: template de análise resolve caminho absoluto e cita o CLI", () => {
  const resolved = registry.resolve({
    id: "eng_reversa_analisar_app_js",
    params: { caminho: "C:\\Users\\Jean\\Downloads\\app.asar" },
  });
  assert.equal(resolved.error, undefined);
  assert.match(resolved.cmd, /analyze-js "C:\\Users\\Jean\\Downloads\\app\.asar"/);
});

test("rea: template recusa caminho com metacaractere de shell", () => {
  for (const caminho of [
    'C:\\Users\\Jean\\a"; calc.asar',
    "C:\\Users\\Jean\\a&calc.asar",
    "C:\\Users\\Jean\\a|calc.asar",
    "C:\\Users\\Jean\\a;calc.asar",
    "C:\\Users\\Jean\\a$calc.asar",
    "C:\\Users\\Jean\\a`calc.asar",
    "..\\..\\Windows\\System32\\calc.exe",
  ]) {
    const resolved = registry.resolve({ id: "eng_reversa_analisar_app_js", params: { caminho } });
    assert.ok(resolved.error, `deveria recusar: ${caminho}`);
  }
});

test("rea: skill do chat existe com corpo e tags", async () => {
  const data = JSON.parse(await readFile(join(root, "v10", "chat-integrado", "chat-skills.json"), "utf8"));
  const skill = (data.items || []).find((item) => item.id === "engenharia-reversa");
  assert.ok(skill, "skill 'engenharia-reversa' ausente em chat-skills.json");
  assert.ok(skill.body.length > 500, "corpo da skill curto demais para operar");
  assert.ok(skill.tags.includes("rea"));
  assert.match(skill.body, /rea_analisar_app_js/);
});
