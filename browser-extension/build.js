#!/usr/bin/env node
/**
 * Empacota a extensão do Mestre do PC para distribuição.
 * Gera browser-extension/dist/mestre-do-pc-extension-<target>-<version>.zip
 *
 * Uso:
 *   node browser-extension/build.js [chrome|firefox]
 *
 * O padrão é chrome. Cada pacote recebe seu manifesto, sem alterar a fonte.
 */

import { mkdirSync, mkdtempSync, existsSync, readFileSync, writeFileSync, copyFileSync, renameSync, rmSync } from "node:fs";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TARGET = process.argv[2] || "chrome";

if (!["chrome", "firefox"].includes(TARGET)) {
  console.error("Uso: node browser-extension/build.js [chrome|firefox]");
  process.exit(1);
}

const manifestPath = join(__dirname, TARGET === "firefox" ? "manifest-firefox.json" : "manifest.json");
const manifestText = readFileSync(manifestPath, "utf8");
const manifest = JSON.parse(manifestText);
const version = manifest.version;
assert.equal(manifest.manifest_version, 3, "Manifest V3 obrigatorio.");
assert.ok(typeof manifest.name === "string" && manifest.name.trim().length > 0 && manifest.name.length <= 75, "Nome invalido.");
assert.ok(typeof manifest.description === "string" && manifest.description.trim().length > 0 && manifest.description.length <= 132, "Descricao deve ter de 1 a 132 caracteres.");
assert.ok(typeof version === "string" && /^(0|[1-9]\d{0,4})(\.(0|[1-9]\d{0,4})){0,3}$/.test(version)
  && version.split(".").every((part) => Number(part) <= 65535)
  && version.split(".").some((part) => Number(part) > 0), "Versao invalida.");
const distDir = join(__dirname, "dist");
const outName = `mestre-do-pc-extension-${TARGET}-v${version}.zip`;
const outPath = join(distDir, outName);

const filesToInclude = [
  "manifest.json",
  "popup.html",
  "popup.js",
  "background.js",
  "settings.js",
  "options.html",
  "options.js",
  "icons/icon16.png",
  "icons/icon32.png",
  "icons/icon48.png",
  "icons/icon128.png",
];

if (manifest.default_locale) {
  assert.match(manifest.default_locale, /^[a-zA-Z_]+$/, "Locale invalido.");
  filesToInclude.push(`_locales/${manifest.default_locale}/messages.json`);
}
const referencedFiles = [manifest.action?.default_popup, manifest.options_page,
  ...(manifest.background?.scripts || [manifest.background?.service_worker]),
  ...Object.values(manifest.icons || {}), ...Object.values(manifest.action?.default_icon || {}),
  ...(manifest.content_scripts || []).flatMap((script) => [...(script.js || []), ...(script.css || [])])];
assert.ok(manifest.icons?.[128], "Icone de 128 pixels obrigatorio.");
for (const file of referencedFiles.filter(Boolean)) {
  assert.ok(filesToInclude.includes(file), `Recurso fora do pacote: ${file}`);
}
for (const file of filesToInclude) {
  assert.ok(existsSync(join(__dirname, file)), `Arquivo obrigatorio ausente: ${file}`);
}
mkdirSync(distDir, { recursive: true });
const stagingDir = mkdtempSync(join(distDir, ".staging-"));
const temporaryZip = `${stagingDir}.zip`;
const psQuote = (value) => "'" + value.replaceAll("'", "''") + "'";

async function zipWithPowerShell() {
  return new Promise((resolve, reject) => {
    const ps = spawn("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-Command",
      `$ErrorActionPreference = 'Stop'; $env:PSModulePath = Join-Path $PSHOME 'Modules'; Compress-Archive -Path ${psQuote(join(stagingDir, "*"))} -DestinationPath ${psQuote(temporaryZip)} -Force`,
    ], { windowsHide: true });
    let stderr = "";
    ps.stderr.on("data", (d) => { stderr += d.toString(); });
    ps.on("close", (code) => {
      if (code !== 0) reject(new Error(stderr || `PowerShell exit ${code}`));
      else resolve();
    });
    ps.on("error", reject);
  });
}

async function main() {
  try {
    for (const file of filesToInclude) {
      const dest = join(stagingDir, file);
      mkdirSync(dirname(dest), { recursive: true });
      if (file === "manifest.json") writeFileSync(dest, manifestText);
      else copyFileSync(join(__dirname, file), dest);
    }
    await zipWithPowerShell();
    if (!existsSync(temporaryZip)) throw new Error("Arquivo zip não foi criado.");
    renameSync(temporaryZip, outPath);
    console.log(`✅ Extensão ${TARGET} v${version} empacotada em: ${outPath}`);
  } catch (e) {
    console.error("❌ Erro ao empacotar extensão:", e.message);
    process.exitCode = 1;
  } finally {
    // Limpa staging.
    if (existsSync(stagingDir)) {
      rmSync(stagingDir, { recursive: true, force: true });
    }
    rmSync(temporaryZip, { force: true });
  }
}

main();
