import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { puppeteer } from "../mcp-server/node_modules/chrome-devtools-mcp/build/src/third_party/index.js";

test("Chrome: migracao, consentimento, opcoes e comando simulado", { timeout: 45000 }, async () => {
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true,
    enableExtensions: [fileURLToPath(new URL(".", import.meta.url))],
  });
  try {
    const worker = await browser.waitForTarget(target => target.type() === "service_worker" && target.url().startsWith("chrome-extension://"));
    const base = worker.url().slice(0, worker.url().lastIndexOf("/"));
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(base + "/options.html");
    await page.evaluate(() => chrome.storage.sync.set({ extensionToken: "e2e-token" }));
    await page.reload();
    await page.waitForFunction(() => document.querySelector("#extensionToken").value === "e2e-token");
    assert.deepEqual(await page.evaluate(() => chrome.storage.sync.get("extensionToken")), {});
    assert.equal(await page.$eval("#extensionToken", input => input.type), "password");
    assert.equal(await page.$eval("#allowPageAnalysis", input => input.checked), false);
    await page.$eval("#launcherUrl", input => { input.value = "https://example.com"; });
    await page.click("#save");
    await page.waitForFunction(() => document.querySelector("#status").textContent.includes("127.0.0.1"));
    assert.equal(await page.evaluate(() => document.activeElement.id), "status");
    await page.$eval("#launcherUrl", input => { input.value = "http://127.0.0.1:7777"; });
    await page.click("#save");
    await page.waitForFunction(() => document.querySelector("#status").textContent.includes("salvas"));

    const requests = [];
    await page.setRequestInterception(true);
    page.on("request", request => {
      if (!request.url().startsWith("http://127.0.0.1:")) { void request.continue(); return; }
      requests.push({ url: request.url(), data: request.postData(), token: request.headers()["x-mestre-extension-token"] });
      const body = request.url().endsWith("/run") ? { accepted: true, jobId: "simulated-job" } : { version: "test", models: [] };
      void request.respond({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    });
    await page.goto(base + "/popup.html");
    await page.click("#btnEnviarPagina");
    await page.waitForFunction(() => document.querySelector("#message").textContent.includes("Autorize"));
    assert.equal(requests.some(request => request.url.endsWith("/ollama/chat")), false);
    await page.click("#btnDiagnostico");
    await page.waitForFunction(() => document.querySelector("#message").textContent.includes("simulated-job"));
    const run = requests.find(request => request.url.endsWith("/run"));
    assert.equal(run.token, "e2e-token");
    assert.equal(JSON.parse(run.data).id, "diagnostico_completo");
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
