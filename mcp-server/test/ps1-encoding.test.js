// Regressao: o Windows PowerShell 5.1 le arquivos .ps1 SEM BOM como ANSI/cp1252.
// Um caractere UTF-8 comum como o travessao (— = E2 80 94) e entao decodificado
// como "â€"" — e aquele 0x94 e a aspa dupla direita no cp1252, que fecha strings
// no meio do codigo. O install.ps1 quebrava assim na linha 132 e abortava a
// instalacao inteira. O invariante que evita a classe toda do problema:
//
//   todo .ps1 com byte nao-ASCII precisa de BOM UTF-8.
//
// Checagem de bytes: rapida, deterministica e roda em qualquer SO (nao precisa
// de PowerShell instalado, ao contrario de invocar o parser 5.1).
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../../", import.meta.url));
const BOM = Buffer.from([0xef, 0xbb, 0xbf]);

function trackedPs1Files() {
  return execFileSync("git", ["ls-files", "*.ps1"], { cwd: root, encoding: "utf8" })
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

test("todo .ps1 com caractere nao-ASCII tem BOM UTF-8", () => {
  const files = trackedPs1Files();
  assert.ok(files.length > 0, "nenhum .ps1 rastreado encontrado — git ls-files falhou?");

  const semBom = [];
  for (const rel of files) {
    const buf = readFileSync(join(root, rel));
    if (buf.subarray(0, 3).equals(BOM)) continue;
    if (buf.some((b) => b > 0x7f)) semBom.push(rel);
  }

  assert.deepEqual(
    semBom,
    [],
    "estes .ps1 tem caractere nao-ASCII sem BOM UTF-8 e podem quebrar no " +
      `Windows PowerShell 5.1: ${semBom.join(", ")}`
  );
});

test("install.ps1 prefere pwsh ao se auto-elevar", () => {
  const src = readFileSync(join(root, "install.ps1"), "utf8");

  assert.match(
    src,
    /Get-Command\s+pwsh/,
    "install.ps1 deve tentar pwsh antes de cair para o powershell.exe 5.1"
  );
});

test("os .bat gerados para o cliente preferem pwsh", () => {
  const src = readFileSync(join(root, "scripts", "build-package.js"), "utf8");

  const deteccoes = src.match(/where pwsh/g) ?? [];
  assert.equal(
    deteccoes.length,
    2,
    "esperado um 'where pwsh' no .bat do instalador e outro no do desinstalador"
  );

  for (const alvo of ["instalar", "desinstalar"]) {
    assert.match(
      src,
      new RegExp(`pwsh -NoProfile[^\\n]*${alvo}\\.ps1`),
      `o .bat deve chamar ${alvo}.ps1 via pwsh quando ele existir`
    );
    assert.match(
      src,
      new RegExp(`powershell -NoProfile[^\\n]*${alvo}\\.ps1`),
      `o .bat deve manter o fallback para powershell 5.1 em ${alvo}.ps1`
    );
  }
});
