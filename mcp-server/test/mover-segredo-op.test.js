/**
 * Contrato da operação mover_segredo_para_chaves (whitelist do Mestre do PC).
 * Regra: segredo fora de C:\Users\Jean\chaves é movido para chaves, sem abrir conteúdo.
 * O parâmetro aceita apenas nome de arquivo — nunca caminho.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { clearOperationRegistryCache, loadOperationRegistry } from "../../v10/operation-registry.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const OPS = join(root, "v10", "allowed-operations.json");
const ID = "mover_segredo_para_chaves";

async function rawEntry() {
  const data = JSON.parse(await readFile(OPS, "utf8"));
  return (data.templates || []).find((t) => t.id === ID);
}

test("catálogo: operação existe, é destrutiva e está na categoria Segurança", async () => {
  const entry = await rawEntry();
  assert.ok(entry, `${ID} ausente do catálogo`);
  assert.equal(entry.title, "Mover Segredo para Chaves");
  assert.equal(entry.category, "Segurança");
  assert.equal(entry.destructive, true);
  assert.equal(entry.enabled, true);
  assert.ok(entry.params?.arquivo, "parametro 'arquivo' ausente");
});

test("catálogo: parâmetro não aceita caminho nem travessia", async () => {
  const entry = await rawEntry();
  const re = new RegExp(`^(?:${entry.params.arquivo})$`);
  assert.equal(re.test("API MISTRAL.txt"), true);
  assert.equal(re.test("obsidian-recovery-codes.txt"), true);
  assert.equal(re.test("..\\Windows\\System32\\x"), false);
  assert.equal(re.test("C:\\Windows\\x.txt"), false);
  assert.equal(re.test("a/b.txt"), false);
  assert.equal(re.test(""), false);
  assert.equal(re.test("a".repeat(129)), false);
});

test("registry: resolve com nome simples e sem placeholder pendente", async () => {
  clearOperationRegistryCache();
  const reg = await loadOperationRegistry(OPS);
  const out = reg.resolve({ id: ID, params: { arquivo: "API MISTRAL.txt" } });
  assert.equal(out.error, undefined, out.error);
  assert.equal(out.destructive, true);
  assert.ok(out.cmd.includes("API MISTRAL.txt"));
  assert.ok(!out.cmd.includes("{{ARQUIVO}}"));
  assert.ok(out.cmd.includes("C:\\Users\\Jean\\chaves"), "destino fixo ausente");
  assert.ok(out.cmd.includes("OneDrive") && out.cmd.includes("Desktop") && out.cmd.includes("Downloads"));
  assert.ok(out.cmd.includes("ReparsePoint"), "guarda de somente-nuvem ausente");
});

test("registry: rejeita caminho, travessia e nome vazio", async () => {
  clearOperationRegistryCache();
  const reg = await loadOperationRegistry(OPS);
  for (const bad of ["..\\x.txt", "C:\\Windows\\x.txt", "sub/dir.txt", "", ".."]) {
    const out = reg.resolve({ id: ID, params: { arquivo: bad } });
    assert.ok(out.error, `deveria rejeitar: ${JSON.stringify(bad)}`);
  }
});

test("registry: id desconhecido continua bloqueado", async () => {
  clearOperationRegistryCache();
  const reg = await loadOperationRegistry(OPS);
  assert.ok(reg.resolve({ id: "mover_qualquer_coisa" }).error);
  assert.ok(reg.resolve({ cmd: "Remove-Item C:\\ -Recurse -Force" }).error);
});
