import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import * as client from "../../v10/computer-use-client.js";
import { handleComputerUseRoutes } from "../../v10/computer-use-routes.js";

const root = join(fileURLToPath(new URL("../..", import.meta.url)));

async function loadClientComputerUse() {
  const candidates = [
    join(root, "v10", "node_modules", "@qwen-code", "cua-sdk", "computer-use", "index.js"),
    join(root, "node_modules", "@qwen-code", "cua-sdk", "computer-use", "index.js"),
  ];
  const found = candidates.find((file) => existsSync(file));
  assert.ok(found, "cua-sdk visível para v10/computer-use-client.js");
  return import(pathToFileURL(found).href);
}

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
  const results = {
    list_apps: { apps: [{ pid: 7 }] },
    list_windows: { windows: [] },
    get_window_state: { elements: [] },
  };
  const fake = {
    appCall: async (tool, args, opts) => {
      calls.push([tool, args, opts]);
      return { text: "", structured: results[tool] ?? { effect: "confirmed" } };
    },
    close: async () => { calls.push(["close"]); },
  };
  const { ComputerUse } = await loadClientComputerUse();
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
      "list_apps", "list_windows", "get_window_state", "click", "type_text", "press_key",
      "scroll", "set_value", "perform_secondary_action", "hotkey",
    ]);
    const readOnly = Object.fromEntries(calls.filter(([name]) => name !== "close").map(([name, , opts]) => [name, opts.readOnly]));
    assert.deepEqual(readOnly, {
      list_apps: true, list_windows: true, get_window_state: true, click: false, type_text: false,
      press_key: false, scroll: false, set_value: false, perform_secondary_action: false, hotkey: false,
    });
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
