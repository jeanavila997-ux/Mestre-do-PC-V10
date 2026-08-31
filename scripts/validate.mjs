#!/usr/bin/env node
// project-validation-recipe — unified validation skill for the Mestre do PC repo.
//
// Usage:
//   node scripts/validate.mjs [--depth=quick|full|ci] [--json] [--fix]
//   node scripts/validate.mjs --depth=ci --json   # CI-friendly JSON output
//
// Depths:
//   quick  — fast static checks (JSON parse, registry consistency, node --check)
//   full   — quick + npm test + PowerShell syntax/style + HTML smoke checks
//   ci     — full with JSON output and no interactive styling

import { spawn } from "node:child_process";
import { readFile, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, relative, extname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");

const ENTRY_POINTS = [
  "v10/launcher.js",
  "v10/operation-registry.js",
  "mcp-server/index.js",
  "mcp-server/security.js",
  "mcp-server/audit-logger.js",
  "scripts/validate.mjs",
];

const LEGACY_SCRIPTS = new Set([
  "MestreDoPC-Launcher.ps1",
  "validate-v11.ps1",
  "audit-wmi.ps1",
  "fix-all-issues.ps1",
  "fix-driver-op.ps1",
]);
const PS_EXCLUDE_PATTERNS = ["node_modules", ".git", ".claude", "validate_all.ps1"];

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

const COLORS = {
  reset: "\x1b[0m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
};

function color(name, text) {
  return useColors() ? `${COLORS[name] || ""}${text}${COLORS.reset}` : text;
}

let _useColors = null;
function useColors() {
  if (_useColors != null) return _useColors;
  _useColors = !args.json && process.stdout.isTTY;
  return _useColors;
}

function parseArgs(argv) {
  const result = { depth: "full", json: false, fix: false };
  for (const arg of argv.slice(2)) {
    if (arg === "--json") result.json = true;
    else if (arg === "--fix") result.fix = true;
    else if (arg.startsWith("--depth=")) result.depth = arg.slice("--depth=".length);
    else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: node scripts/validate.mjs [--depth=quick|full|ci] [--json] [--fix]`);
      process.exit(0);
    }
  }
  return result;
}

const args = parseArgs(process.argv);

function log(level, message) {
  if (args.json) return;
  const prefix = { info: "", ok: "✅ ", error: "❌ ", warn: "⚠️  " };
  const colorName = { info: "cyan", ok: "green", error: "red", warn: "yellow" };
  console.log(color(colorName[level], `${prefix[level] || ""}${message}`));
}

async function runCommand(label, command, options = {}) {
<<<<<<< HEAD
  const { cwd = PROJECT_ROOT, env = process.env, timeout = 120_000, shell = false } = options;
  const [exe, ...exeArgs] = command;
  return new Promise((resolve) => {
    const child = spawn(exe, exeArgs, { cwd, env, shell, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
=======
  const { cwd = PROJECT_ROOT, env = process.env, timeout = 120_000 } = options;
  const [exe, ...exeArgs] = command;
  return new Promise((resolve) => {
    const child = spawn(exe, exeArgs, { cwd, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
>>>>>>> origin/main
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), timeout);
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, code, stdout, stderr });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ ok: false, code: -1, stdout, stderr: err.message });
    });
  });
}

async function findPowerShellScripts() {
  const entries = [];
  async function walk(dir) {
    const items = await readdir(dir, { withFileTypes: true });
    for (const item of items) {
      const path = join(dir, item.name);
      const rel = relative(PROJECT_ROOT, path).replace(/\\/g, "/");
      if (item.isDirectory()) {
        if (item.name === "node_modules" || item.name === ".git") continue;
        await walk(path);
      } else if (item.isFile() && extname(item.name) === ".ps1") {
        if (PS_EXCLUDE_PATTERNS.some((p) => rel.includes(p))) continue;
        entries.push({ path, relative: rel, name: item.name });
      }
    }
  }
  await walk(PROJECT_ROOT);
  return entries;
}

async function checkNodeSyntax(path) {
  const rel = relative(PROJECT_ROOT, path);
  const result = await runCommand("node --check", ["node", "--check", path]);
  return { file: rel, ok: result.ok, error: result.stderr || result.stdout };
}

async function checkJsonFile(path) {
  const rel = relative(PROJECT_ROOT, path);
  try {
    const raw = await readFile(path, "utf8");
    JSON.parse(raw);
    return { file: rel, ok: true };
  } catch (e) {
    return { file: rel, ok: false, error: e.message };
  }
}

async function checkOperationRegistry() {
  const registryPath = pathToFileURL(join(PROJECT_ROOT, "v10/operation-registry.js")).href;
  const { loadOperationRegistry } = await import(registryPath + "?t=" + Date.now());
  const registry = await loadOperationRegistry(join(PROJECT_ROOT, "v10/allowed-operations.json"));
  const report = registry.validate();
  return { ok: report.ok, errors: report.errors };
}

async function checkPowerShellScript(script) {
  const issues = [];
  const content = await readFile(script.path, "utf8");
  const isLegacy = LEGACY_SCRIPTS.has(script.name);

  // Parse AST via PowerShell 5.1 parser.
  const psCommand = `
    $errors = $null
    $tokens = $null
<<<<<<< HEAD
    $scriptPath = '${script.path.replace(/'/g, "''")}'
    $content = [System.IO.File]::ReadAllText($scriptPath, [System.Text.UTF8Encoding]::new($false))
    $ast = [System.Management.Automation.Language.Parser]::ParseInput(
      $content,
      $scriptPath,
=======
    $ast = [System.Management.Automation.Language.Parser]::ParseFile(
      '${script.path.replace(/'/g, "''")}',
>>>>>>> origin/main
      [ref]$tokens,
      [ref]$errors
    )
    if ($errors.Count -gt 0) {
      $errors | ForEach-Object { "$($_.Extent.StartLineNumber): $($_.Message)" }
    }
`;
  const result = await runCommand("PS AST parse", ["powershell.exe", "-NoProfile", "-Command", psCommand], { timeout: 30_000 });
  if (!result.ok || result.stdout.trim()) {
    issues.push({ type: "syntax", message: result.stdout || result.stderr });
    return { file: script.relative, ok: false, issues };
  }

  // Best-practice checks (warnings do not fail the build by default).
  const warnings = [];
  if (content.match(/Write-Host "[^"]*"$/) && !content.includes("ForegroundColor")) {
    warnings.push("Write-Host sem cor definida");
  }
  const silentCount = (content.match(/SilentlyContinue/g) || []).length;
  if (silentCount > 5) warnings.push(`uso excessivo de SilentlyContinue (${silentCount} vezes)`);
  if ((content.includes("Invoke-WMIMethod") || content.includes("Get-WmiObject")) && !isLegacy) {
    issues.push({ type: "deprecated", message: "Cmdlet descontinuado (use Get-CimInstance)" });
  }
  if (content.match(/password\s*=\s*"[^"]+"/i)) {
    issues.push({ type: "secret", message: "Senha em claro detectada" });
  }

  const hasError = issues.some((i) => i.type !== "warning");
  return { file: script.relative, ok: !hasError, issues, warnings };
}

async function checkHtmlSmoke(path) {
  const rel = relative(PROJECT_ROOT, path);
  try {
    const content = await readFile(path, "utf8");
    const checks = [];
    checks.push({ name: "html exists", ok: content.length > 0 });
    checks.push({ name: "has CATS array", ok: content.includes("const CATS") });
    checks.push({ name: "has renderCards function", ok: content.includes("function renderCards") });
    checks.push({ name: "no window.confirm", ok: !content.includes("window.confirm(") });
    const failed = checks.filter((c) => !c.ok);
    return { file: rel, ok: failed.length === 0, failed };
  } catch (e) {
    return { file: rel, ok: false, error: e.message };
  }
}

async function runNpmTest() {
  const isWin = process.platform === "win32";
  const result = await runCommand(
    "npm test",
<<<<<<< HEAD
    isWin
      ? [process.env.ComSpec || "cmd.exe", "/d", "/s", "/c", "npm.cmd test"]
      : ["npm", "test"],
    { cwd: join(PROJECT_ROOT, "mcp-server"), timeout: 180_000 },
=======
    isWin ? [npmCommand(), "test"] : ["npm", "test"],
    { cwd: join(PROJECT_ROOT, "mcp-server"), timeout: 180_000, shell: isWin },
>>>>>>> origin/main
  );
  return { ok: result.ok, output: result.stdout + result.stderr };
}

async function runQuickChecks() {
  const results = [];
  log("info", "=== Validação rápida (quick) ===");

  for (const entry of ENTRY_POINTS) {
    const path = join(PROJECT_ROOT, entry);
    if (!existsSync(path)) {
      results.push({ check: `node --check ${entry}`, ok: false, error: "arquivo não encontrado" });
      continue;
    }
    const r = await checkNodeSyntax(path);
    results.push({ check: `node --check ${entry}`, ok: r.ok, error: r.ok ? undefined : r.error });
  }

  const jsonFiles = ["v10/allowed-operations.json", "mcp-server/model-profiles.json", "mcp-server/package.json", "v10/package.json"];
  for (const f of jsonFiles) {
    const r = await checkJsonFile(join(PROJECT_ROOT, f));
    results.push({ check: `JSON parse ${f}`, ok: r.ok, error: r.error });
  }

  const registry = await checkOperationRegistry();
  results.push({ check: "operation-registry validate", ok: registry.ok, error: registry.errors.join("; ") });

  return results;
}

async function runFullChecks() {
  const results = await runQuickChecks();

  log("info", "=== Testes do MCP server ===");
  const npmTest = await runNpmTest();
  results.push({ check: "npm test (mcp-server)", ok: npmTest.ok, error: npmTest.ok ? undefined : npmTest.output.slice(-500) });

  log("info", "=== Validação de scripts PowerShell ===");
  const psScripts = await findPowerShellScripts();
  for (const script of psScripts) {
    const r = await checkPowerShellScript(script);
    results.push({ check: `PS syntax/style ${r.file}`, ok: r.ok, error: r.issues?.map((i) => `${i.type}: ${i.message}`).join("; ") });
  }

  log("info", "=== Smoke checks do HTML principal ===");
  const html = await checkHtmlSmoke(join(PROJECT_ROOT, "v10/index.html"));
  results.push({ check: "HTML smoke v10/index.html", ok: html.ok, error: html.failed?.map((c) => `${c.name}: failed`).join("; ") });

  return results;
}

async function main() {
  const start = Date.now();
  let results;

  if (args.depth === "quick") results = await runQuickChecks();
  else if (args.depth === "full" || args.depth === "ci") results = await runFullChecks();
  else {
    console.error(`Depth inválido: ${args.depth}. Use quick, full ou ci.`);
    process.exit(2);
  }

  const failed = results.filter((r) => !r.ok);
  const passed = results.filter((r) => r.ok);
  const durationMs = Date.now() - start;

  const report = {
    depth: args.depth,
    ok: failed.length === 0,
    passed: passed.length,
    failed: failed.length,
    durationMs,
    results,
  };

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    log("info", "=== Resumo ===");
    log("ok", `Passaram: ${passed.length}`);
    if (failed.length > 0) log("error", `Falharam: ${failed.length}`);
    for (const r of failed) {
      log("error", `${r.check}: ${r.error || "falha"}`);
    }
  }

  process.exit(report.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
