import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { ComputerUse } from "@qwen-code/cua-sdk/computer-use";
import * as client from "../../v10/computer-use-client.js";
import { handleComputerUseRoutes } from "../../v10/computer-use-routes.js";

const root = join(fileURLToPath(new URL("../..", import.meta.url)));

function request({ method = "GET", url = "/computer-use/status", body = "", headers = {} } = {}) {
  const req = Readable.from(body ? [body] : []);
  req.method = method;
  req.url = url;
  req.headers = { host: "127.0.0.1:7777", ...headers };
  return req;
}

function response() {
  return {
    statusCode: null,
    headers: {},
    body: "",
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    writeHead(status, headers = {}) {
      this.statusCode = status;
      for (const [name, value] of Object.entries(headers)) this.setHeader(name, value);
    },
    end(chunk = "") { this.body += chunk; },
  };
}

const authorizedContext = {
  isAuthorized: () => true,
  allowedOrigin: "http://127.0.0.1:7777",
};

test("computer-use routes enforce launcher authorization and scoped CORS", async () => {
  const req = request({ headers: { origin: "https://evil.example" } });
  const res = response();

  const handled = await handleComputerUseRoutes(req, res, new URL(req.url, "http://127.0.0.1:7777"), {
    isAuthorized: () => false,
    allowedOrigin: "http://127.0.0.1:7777",
  });

  assert.equal(handled, true);
  assert.equal(res.statusCode, 403);
  assert.equal(res.headers["access-control-allow-origin"], "http://127.0.0.1:7777");
  assert.equal(res.headers.vary, "Origin");
  assert.notEqual(res.headers["access-control-allow-origin"], "*");
});

test("computer-use routes reject oversized JSON bodies", async () => {
  const req = request({
    method: "POST",
    url: "/computer-use/windows",
    body: JSON.stringify({ pid: 1, padding: "x".repeat(70 * 1024) }),
  });
  const res = response();

  await handleComputerUseRoutes(req, res, new URL(req.url, "http://127.0.0.1:7777"), authorizedContext);

  assert.equal(res.statusCode, 413);
});

test("computer-use client exports route contract and calls matching SDK methods", async () => {
  const calls = [];
  const fake = {
    listApps: async (opts) => (calls.push(["listApps", opts]), [{ pid: 7 }]),
    listWindows: async (opts) => (calls.push(["listWindows", opts]), []),
    observeWindow: async (opts) => (calls.push(["observeWindow", opts]), { elements: [] }),
    click: async (opts) => (calls.push(["click", opts]), { effect: "confirmed" }),
    typeText: async (opts) => (calls.push(["typeText", opts]), { effect: "confirmed" }),
    pressKey: async (opts) => (calls.push(["pressKey", opts]), { effect: "confirmed" }),
    scroll: async (opts) => (calls.push(["scroll", opts]), { effect: "confirmed" }),
    setValue: async (opts) => (calls.push(["setValue", opts]), { effect: "confirmed" }),
    performSecondaryAction: async (opts) => (calls.push(["performSecondaryAction", opts]), { effect: "confirmed" }),
    hotkey: async (opts) => (calls.push(["hotkey", opts]), { effect: "confirmed" }),
    close: async () => { calls.push(["close"]); },
  };
  const originalCreate = ComputerUse.create;
  ComputerUse.create = async () => fake;

  try {
    await client.listApps({ refresh: true });
    await client.listWindows(7);
    await client.observeWindow({ pid: 7, windowId: 9 });
    await client.click({ pid: 7, windowId: 9, x: 1, y: 2 });
    await client.typeText({ pid: 7, windowId: 9, text: "abc" });
    await client.pressKey({ pid: 7, windowId: 9, key: "Enter" });
    await client.scroll({ pid: 7, elementToken: "token", direction: "down" });
    await client.setValue({ pid: 7, elementToken: "token", value: "abc" });
    await client.performSecondaryAction({ pid: 7, elementToken: "token", action: "expand" });
    await client.hotkey({ pid: 7, windowId: 9, keys: ["CTRL", "C"] });

    assert.deepEqual(calls.map(([name]) => name), [
      "listApps", "listWindows", "observeWindow", "click", "typeText", "pressKey",
      "scroll", "setValue", "performSecondaryAction", "hotkey",
    ]);
    assert.deepEqual(client.getStatus(), {
      connected: true,
      initialized: true,
      pid: null,
      appsCount: 1,
      error: null,
      lastInitialized: client.getStatus().lastInitialized,
    });

    await client.closeComputerUse();
    assert.equal(calls.at(-1)[0], "close");
    assert.equal(client.getStatus().connected, false);
  } finally {
    ComputerUse.create = originalCreate;
  }
});

test("computer-use UI renders accessibility metadata without HTML or inline handlers", async () => {
  const source = await readFile(join(root, "v10", "index.html"), "utf8");
  const start = source.indexOf("function renderElementTree");
  const end = source.indexOf("async function runCUListApps", start);
  const renderSource = source.slice(start, end);

  assert.match(renderSource, /replaceChildren/);
  assert.match(renderSource, /createElement/);
  assert.match(renderSource, /addEventListener/);
  assert.doesNotMatch(renderSource, /innerHTML/);
  assert.doesNotMatch(renderSource, /onclick=/);
});

test("computer-use installer fails when the SDK directory is missing", async () => {
  const source = await readFile(join(root, "scripts", "install-computer-use.js"), "utf8");
  const missingSdkBranch = source.slice(source.indexOf("if (existsSync(sdkPath))"));
  assert.match(missingSdkBranch, /throw new Error\([^)]*@qwen-code\/cua-sdk/);
  assert.doesNotMatch(missingSdkBranch, /console\.warn/);
});
