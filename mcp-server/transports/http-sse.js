import { createServer } from "node:http";
import { URL } from "node:url";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { validateLocalMcpToken, isLocalMcpEnabled } from "../auth/local-token.js";
import { auditLog, AuditLevel } from "../audit-logger.js";

const DEFAULT_HTTP_PORT = Number(process.env.MESTRE_MCP_HTTP_PORT || "7778");
const DEFAULT_HTTP_HOST = process.env.MESTRE_MCP_HTTP_HOST || "127.0.0.1";

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function collectBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export async function startHttpSseServer(server, options = {}) {
  const host = options.host ?? DEFAULT_HTTP_HOST;
  const port = options.port ?? DEFAULT_HTTP_PORT;
  const endpointPath = options.endpoint ?? "/messages";
  const transports = new Map();

  const httpServer = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", `http://${req.headers.host || `${host}:${port}`}`);
      const pathname = url.pathname;

      if (pathname === "/health") {
        return json(res, 200, { ok: true, transport: "mcp-http-sse", localEnabled: isLocalMcpEnabled() });
      }

      if (pathname === "/sse") {
        const token = url.searchParams.get("token") || req.headers["x-mcp-token"];
        if (!isLocalMcpEnabled()) {
          await auditLog(AuditLevel.SECURITY, "mcp_http_disabled", { reason: "local_mcp_not_enabled" });
          return json(res, 403, { error: "MCP HTTP/SSE disabled. Set MESTRE_LOCAL_MCP_TOKEN to enable." });
        }
        if (!token || !validateLocalMcpToken(token)) {
          await auditLog(AuditLevel.SECURITY, "mcp_http_auth_fail", { ip: req.socket.remoteAddress });
          return json(res, 401, { error: "Unauthorized" });
        }

        const transport = new SSEServerTransport(endpointPath, res, { enableDnsRebindingProtection: false });
        await server.connect(transport);
        transports.set(transport.sessionId, transport);
        res.on("close", () => {
          transports.delete(transport.sessionId);
        });
        await auditLog(AuditLevel.INFO, "mcp_http_sse_connected", { sessionId: transport.sessionId, ip: req.socket.remoteAddress });
        return;
      }

      if (pathname === endpointPath) {
        const token = url.searchParams.get("token") || req.headers["x-mcp-token"];
        if (!isLocalMcpEnabled()) {
          return json(res, 403, { error: "MCP HTTP/SSE disabled." });
        }
        if (!token || !validateLocalMcpToken(token)) {
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
        const raw = await collectBody(req);
        await transport.handlePostMessage(req, res, raw);
        return;
      }

      return json(res, 404, { error: "Not found" });
    } catch (err) {
      try {
        await auditLog(AuditLevel.ERROR, "mcp_http_error", { message: err.message, path: req.url });
      } catch {}
      if (!res.headersSent) {
        json(res, 500, { error: "Internal error" });
      }
    }
  });

  await new Promise((resolve, reject) => {
    httpServer.listen(port, host, (err) => (err ? reject(err) : resolve()));
  });

  await auditLog(AuditLevel.INFO, "mcp_http_server_started", { host, port, endpoint: endpointPath });
  console.error(`Mestre do PC MCP Server iniciado em HTTP/SSE em http://${host}:${port}/sse`);
  return { httpServer, transports };
}
