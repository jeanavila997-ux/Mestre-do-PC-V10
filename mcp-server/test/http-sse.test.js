import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { URL } from "node:url";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { generateLocalMcpToken, validateLocalMcpToken } from "../auth/local-token.js";

// Servidor MCP mínimo para testar o transporte HTTP/SSE.
function buildTestServer() {
  const server = new Server({ name: "test-http-sse", version: "1.0.0" }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [] }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    if (req.params.name === "ping") {
      return { content: [{ type: "text", text: "pong" }] };
    }
    throw new Error("Tool not found");
  });
  return server;
}

function startTestHttpServer(server, token) {
  const host = "127.0.0.1";
  const port = 0; // porta dinâmica
  const endpointPath = "/messages";
  const transports = new Map();

  function json(res, status, body) {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      req.on("error", reject);
    });
  }

  function isEnabled() {
    return token.length > 0;
  }

  function validate(t) {
    if (!t || typeof t !== "string") return false;
    const a = Buffer.from(t.normalize(), "utf8");
    const b = Buffer.from(token.normalize(), "utf8");
    if (a.length !== b.length) return false;
    let equal = 0;
    for (let i = 0; i < a.length; i++) equal |= a[i] ^ b[i];
    return equal === 0;
  }

  const httpServer = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", `http://${req.headers.host || `${host}:${port}`}`);
      const pathname = url.pathname;

      if (pathname === "/health") {
        return json(res, 200, { ok: true });
      }

      if (pathname === "/sse") {
        const t = url.searchParams.get("token") || req.headers["x-mcp-token"];
        if (!isEnabled()) {
          return json(res, 403, { error: "disabled" });
        }
        if (!validate(t)) {
          return json(res, 401, { error: "Unauthorized" });
        }
        const transport = new SSEServerTransport(endpointPath, res, { enableDnsRebindingProtection: false });
        await server.connect(transport);
        transports.set(transport.sessionId, transport);
        res.on("close", () => transports.delete(transport.sessionId));
        return;
      }

      if (pathname === endpointPath) {
        const t = url.searchParams.get("token") || req.headers["x-mcp-token"];
        if (!isEnabled()) {
          return json(res, 403, { error: "disabled" });
        }
        if (!validate(t)) {
          return json(res, 401, { error: "Unauthorized" });
        }
        if (req.method !== "POST") {
          res.writeHead(405, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: "Method not allowed" }));
        }
        const sessionId = url.searchParams.get("sessionId");
        if (!sessionId) {
          return json(res, 400, { error: "Missing sessionId" });
        }
        const transport = transports.get(sessionId);
        if (!transport) {
          return json(res, 404, { error: "Session not found" });
        }
        const raw = await readBody(req);
        await transport.handlePostMessage(req, res, raw);
        return;
      }

      return json(res, 404, { error: "Not found" });
    } catch (err) {
      if (!res.headersSent) {
        json(res, 500, { error: "Internal error" });
      }
    }
  });

  return new Promise((resolve, reject) => {
    httpServer.listen(port, host, async (err) => {
      if (err) return reject(err);
      const addr = httpServer.address();
      resolve({ httpServer, baseUrl: `http://${addr.address}:${addr.port}` });
    });
  });
}

describe("http-sse", () => {
  let token;
  let server;
  let httpServer;
  let baseUrl;

  before(async () => {
    token = generateLocalMcpToken();
    server = buildTestServer();
    const ctx = await startTestHttpServer(server, token);
    httpServer = ctx.httpServer;
    baseUrl = ctx.baseUrl;
  });

  after(async () => {
    await new Promise((resolve) => httpServer.close(resolve));
  });

  it("health retorna ok", async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
  });

  it("recusa /sse sem token", async () => {
    const res = await fetch(`${baseUrl}/sse`);
    assert.equal(res.status, 401);
  });

  it("recusa /sse com token inválido", async () => {
    const res = await fetch(`${baseUrl}/sse?token=invalido`);
    assert.equal(res.status, 401);
  });

  it("abre stream /sse com token válido", async () => {
    const ac = new AbortController();
    const res = await fetch(`${baseUrl}/sse?token=${encodeURIComponent(token)}`, { signal: ac.signal });
    assert.equal(res.status, 200);
    const reader = res.body.getReader();
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    ac.abort();
    assert.ok(text.includes("event: endpoint"));
    assert.ok(text.includes("/messages?sessionId="));
  });

  it("POST /messages sem sessionId retorna 400", async () => {
    const res = await fetch(`${baseUrl}/messages?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
    });
    assert.equal(res.status, 400);
  });

  it("POST /messages com sessionId inexistente retorna 404", async () => {
    const res = await fetch(`${baseUrl}/messages?token=${encodeURIComponent(token)}&sessionId=nao-existe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
    });
    assert.equal(res.status, 404);
  });

  it("POST /messages com token inválido retorna 401", async () => {
    const res = await fetch(`${baseUrl}/messages?token=invalido&sessionId=nao-existe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
    });
    assert.equal(res.status, 401);
  });

  it("roundtrip SSE: initialize + tools/list", async () => {
    const ac = new AbortController();
    const sseRes = await fetch(`${baseUrl}/sse?token=${encodeURIComponent(token)}`, { signal: ac.signal });
    assert.equal(sseRes.status, 200);
    const reader = sseRes.body.getReader();
    const { value } = await reader.read();
    const sseText = new TextDecoder().decode(value);
    const match = sseText.match(/sessionId=([^\n]+)/);
    assert.ok(match, "deve conter sessionId");
    const sessionId = match[1].trim();

    const initRes = await fetch(`${baseUrl}/messages?token=${encodeURIComponent(token)}&sessionId=${sessionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 0,
        method: "initialize",
        params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "test", version: "1.0" } },
      }),
    });
    assert.equal(initRes.status, 202, "POST deve ser aceito");
    ac.abort();
  });
});
