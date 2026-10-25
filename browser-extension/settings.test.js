import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, getSettings, localBaseUrl, fetchLocal } from "./settings.js";

function storage(data, failWrite = false) {
  return {
    data,
    async get(keys) { return Object.fromEntries(keys.filter(key => key in data).map(key => [key, data[key]])); },
    async set(values) { if (failWrite) throw new Error("disk full"); Object.assign(data, values); },
    async remove(keys) { for (const key of keys) delete data[key]; },
  };
}

test("migra credencial para local sem sobrescrever configuracao local", async () => {
  const local = storage({ launcherUrl: "http://127.0.0.1:8888" });
  const sync = storage({ extensionToken: "test-token", launcherUrl: DEFAULTS.launcherUrl, unrelated: "keep" });
  globalThis.chrome = { storage: { local, sync } };
  const result = await getSettings();
  assert.equal(result.extensionToken, "test-token");
  assert.equal(result.launcherUrl, "http://127.0.0.1:8888");
  assert.equal(result.allowPageAnalysis, false);
  assert.deepEqual(sync.data, { unrelated: "keep" });
  assert.equal(local.data.extensionToken, "test-token");
});

test("falha de gravacao preserva credencial anterior", async () => {
  const sync = storage({ extensionToken: "test-token" });
  globalThis.chrome = { storage: { local: storage({}, true), sync } };
  await assert.rejects(getSettings(), /disk full/);
  assert.equal(sync.data.extensionToken, "test-token");
});

test("URLs aceitam somente base HTTP loopback sem credenciais", () => {
  assert.equal(localBaseUrl("http://127.0.0.1:7777/"), DEFAULTS.launcherUrl);
  for (const value of ["https://example.com", "http://localhost:7777", "http://127.0.0.1.evil.test", "http://secret@127.0.0.1", "http://127.0.0.1/path", "http://127.0.0.1/?token=secret", "file:///C:/test"]) {
    assert.throws(() => localBaseUrl(value));
  }
});

test("requisicoes bloqueiam destinos externos e redirecionamentos", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.equal(url, "http://127.0.0.1:7777/run");
    assert.equal(options.redirect, "error");
    assert.ok(options.signal instanceof AbortSignal);
    return { ok: true };
  };
  try {
    await fetchLocal(DEFAULTS.launcherUrl + "/run", { redirect: "follow" });
    await assert.rejects(fetchLocal("http://example.com/run"));
    await assert.rejects(fetchLocal("http://secret@127.0.0.1:7777/run"));
    assert.equal(calls, 1);
  } finally { globalThis.fetch = originalFetch; }
});
