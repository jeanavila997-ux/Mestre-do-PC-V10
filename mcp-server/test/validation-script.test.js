import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../../", import.meta.url));

test("validador executa npm.cmd sem shell implícito e lê PowerShell como UTF-8", async () => {
  const source = await readFile(join(root, "scripts", "validate.mjs"), "utf8");
  assert.match(source, /timeout = 120_000, shell = false/);
  assert.match(source, /\{ cwd, env, shell, windowsHide: true/);
  assert.match(source, /process\.env\.ComSpec \|\| "cmd\.exe"/);
  assert.match(source, /"npm\.cmd test"/);
  assert.match(source, /System\.Text\.UTF8Encoding/);
  assert.match(source, /Parser\]::ParseInput/);
});
