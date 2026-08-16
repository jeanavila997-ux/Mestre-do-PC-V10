#!/usr/bin/env node
/**
 * Empacota a extensão do Mestre do PC para distribuição.
 * Gera browser-extension/dist/mestre-do-pc-extension-<target>-<version>.zip
 *
 * Uso:
 *   node browser-extension/build.js [chrome|firefox]
 *
 * O padrão é chrome. Para Firefox, o manifest é substituído temporariamente
 * por manifest-firefox.json durante o empacotamento.
 */

import { mkdirSync, existsSync, readFileSync, writeFileSync, copyFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TARGET = process.argv[2] || "chrome";

if (!["chrome", "firefox"].includes(TARGET)) {
  console.error("Uso: node browser-extension/build.js [chrome|firefox]");
  process.exit(1);
}

const manifestPath = join(__dirname, "manifest.json");
const firefoxManifestPath = join(__dirname, "manifest-firefox.json");
const originalManifest = readFileSync(manifestPath, "utf8");

const manifest = JSON.parse(
  TARGET === "firefox" && existsSync(firefoxManifestPath)
    ? readFileSync(firefoxManifestPath, "utf8")
    : originalManifest,
);

const version = manifest.version || "1.0.0";
const distDir = join(__dirname, "dist");
const stagingDir = join(distDir, `mestre-do-pc-extension-${TARGET}-v${version}`);
const outName = `mestre-do-pc-extension-${TARGET}-v${version}.zip`;
const outPath = join(distDir, outName);

if (!existsSync(distDir)) {
  mkdirSync(distDir, { recursive: true });
}

if (existsSync(stagingDir)) {
  rmSync(stagingDir, { recursive: true, force: true });
}
mkdirSync(stagingDir, { recursive: true });

const filesToInclude = [
  "manifest.json",
  "popup.html",
  "popup.js",
  "background.js",
  "content.js",
  "options.html",
  "options.js",
  "README.md",
  "icons/icon16.png",
  "icons/icon32.png",
  "icons/icon48.png",
  "icons/icon128.png",
];

for (const file of filesToInclude) {
  const src = join(__dirname, file);
  if (!existsSync(src)) {
    console.warn(`Aviso: arquivo não encontrado: ${file}`);
    continue;
  }
  const dest = join(stagingDir, file);
  const destDir = dirname(dest);
  if (!existsSync(destDir)) {
    mkdirSync(destDir, { recursive: true });
  }
  copyFileSync(src, dest);
}

if (existsSync(outPath)) {
  rmSync(outPath, { force: true });
}

async function zipWithPowerShell() {
  return new Promise((resolve, reject) => {
    const ps = spawn("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-Command",
      `Compress-Archive -Path '${stagingDir}\*' -DestinationPath '${outPath}' -Force`,
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
    await zipWithPowerShell();
    const stats = existsSync(outPath);
    if (!stats) throw new Error("Arquivo zip não foi criado.");
    console.log(`✅ Extensão ${TARGET} v${version} empacotada em: ${outPath}`);
  } catch (e) {
    console.error("❌ Erro ao empacotar extensão:", e.message);
    process.exit(1);
  } finally {
    // Limpa staging.
    if (existsSync(stagingDir)) {
      rmSync(stagingDir, { recursive: true, force: true });
    }
  }
}

main();
