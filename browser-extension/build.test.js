import test from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const source = fileURLToPath(new URL(".", import.meta.url));
const psQuote = (value) => "'" + value.replaceAll("'", "''") + "'";

test("pacotes incluem manifesto correto, recursos e metadados validos", () => {
  const fixture = mkdtempSync(join(tmpdir(), "mestre-extension-test-"));
  try {
    cpSync(source, fixture, { recursive: true, filter: (path) => path !== join(source, "dist") });
    for (const target of ["chrome", "firefox"]) {
      const manifestName = target === "chrome" ? "manifest.json" : "manifest-firefox.json";
      const original = readFileSync(join(fixture, manifestName), "utf8");
      const manifest = JSON.parse(original);
      const result = spawnSync(process.execPath, [join(fixture, "build.js"), target], { encoding: "utf8" });
      assert.equal(result.status, 0, result.stderr);
      const zip = join(fixture, "dist", `mestre-do-pc-extension-${target}-v${manifest.version}.zip`);
      const unpacked = join(fixture, `unpacked-${target}`);
      const expand = spawnSync("powershell.exe", ["-NoProfile", "-Command",
        `$env:PSModulePath = Join-Path $PSHOME 'Modules'; Expand-Archive -LiteralPath ${psQuote(zip)} -DestinationPath ${psQuote(unpacked)} -ErrorAction Stop`],
      { encoding: "utf8", windowsHide: true });
      assert.equal(expand.status, 0, expand.stderr);
      const packaged = JSON.parse(readFileSync(join(unpacked, "manifest.json"), "utf8"));
      assert.deepEqual(packaged, manifest);
      assert.equal(readFileSync(join(fixture, manifestName), "utf8"), original);
      assert.ok(manifest.name.length > 0 && manifest.name.length <= 75);
      assert.ok(manifest.description.length > 0 && manifest.description.length <= 132);
      assert.equal(manifest.version, JSON.parse(readFileSync(join(fixture, "package.json"))).version);
      if (manifest.default_locale) {
        assert.ok(existsSync(join(unpacked, "_locales", manifest.default_locale, "messages.json")), "default_locale sem traducoes");
      }
      const resources = [manifest.action.default_popup, manifest.options_page,
        ...(manifest.background.scripts || [manifest.background.service_worker]),
        ...(manifest.content_scripts || []).flatMap((script) => script.js), "settings.js"];
      assert.equal(manifest.content_scripts, undefined);
      assert.equal(manifest.web_accessible_resources, undefined);
      for (const file of resources) assert.ok(existsSync(join(unpacked, file)), file);
      for (const [size, file] of Object.entries(manifest.icons)) {
        const png = readFileSync(join(unpacked, file));
        assert.equal(png.subarray(1, 4).toString(), "PNG");
        assert.equal(png.readUInt32BE(16), Number(size));
        assert.equal(png.readUInt32BE(20), Number(size));
      }
    }
    const manifest = JSON.parse(readFileSync(join(fixture, "manifest.json")));
    const zip = join(fixture, "dist", `mestre-do-pc-extension-chrome-v${manifest.version}.zip`);
    const previous = readFileSync(zip);
    rmSync(join(fixture, "icons", "icon128.png"));
    const missing = spawnSync(process.execPath, [join(fixture, "build.js"), "chrome"], { encoding: "utf8" });
    assert.notEqual(missing.status, 0, "build deve rejeitar recurso ausente");
    assert.deepEqual(readFileSync(zip), previous, "falha deve preservar ZIP anterior");
    manifest.version = "../invalid";
    writeFileSync(join(fixture, "manifest.json"), JSON.stringify(manifest));
    const invalid = spawnSync(process.execPath, [join(fixture, "build.js"), "chrome"], { encoding: "utf8" });
    assert.notEqual(invalid.status, 0, "build deve rejeitar versao invalida");
    assert.match(invalid.stderr, /Versao invalida/);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
