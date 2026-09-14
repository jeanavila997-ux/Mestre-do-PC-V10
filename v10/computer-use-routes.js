// Mestre do PC V11 - Computer Use Routes
// Endpoints HTTP autenticados para controle de UI via Computer Use.

import * as computerUse from "./computer-use-client.js";

const MAX_BODY_BYTES = 64 * 1024;
const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sendJson(res, status, data, allowedOrigin) {
  res.writeHead(status, {
    ...JSON_HEADERS,
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Mestre-Client, X-Mestre-Extension-Token, X-Mestre-Npp-Token",
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
}

async function readJsonBody(req) {
  const declaredLength = Number(req.headers["content-length"] || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    throw new RequestError(413, "Corpo da requisição excede o limite permitido.");
  }

  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > MAX_BODY_BYTES) {
      throw new RequestError(413, "Corpo da requisição excede o limite permitido.");
    }
    chunks.push(buffer);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw new RequestError(400, "JSON inválido.");
  }
}

function requirePositiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new RequestError(400, `${name} deve ser um número inteiro positivo.`);
  }
  return parsed;
}

function requireString(value, name, { allowEmpty = false } = {}) {
  if (typeof value !== "string" || (!allowEmpty && value.trim() === "")) {
    throw new RequestError(400, `${name} é obrigatório.`);
  }
  return value;
}

function normalizeBase(body) {
  return { ...body, pid: requirePositiveInteger(body.pid, "PID") };
}

function requireWindowOrElement(params) {
  if (params.elementToken !== undefined) {
    params.elementToken = requireString(params.elementToken, "elementToken");
    return;
  }
  params.windowId = requirePositiveInteger(params.windowId, "windowId");
}

function requirePointOrElement(params) {
  if (params.elementToken !== undefined) {
    params.elementToken = requireString(params.elementToken, "elementToken");
    return;
  }
  params.windowId = requirePositiveInteger(params.windowId, "windowId");
  if (!Number.isFinite(params.x) || !Number.isFinite(params.y)) {
    throw new RequestError(400, "x e y são obrigatórios para ações por coordenadas.");
  }
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {URL} url
 * @param {{ isAuthorized: (req: import("node:http").IncomingMessage) => boolean, allowedOrigin: string }} ctx
 * @returns {Promise<boolean>}
 */
export async function handleComputerUseRoutes(req, res, url, ctx) {
  const { isAuthorized, allowedOrigin } = ctx;
  const path = url.pathname;
  const method = req.method;

  if (method === "OPTIONS") {
    sendJson(res, 204, {}, allowedOrigin);
    return true;
  }

  if (!isAuthorized(req)) {
    sendJson(res, 403, { error: "Não autorizado" }, allowedOrigin);
    return true;
  }

  try {
    if (path === "/computer-use/status" && method === "GET") {
      sendJson(res, 200, computerUse.getStatus(), allowedOrigin);
      return true;
    }

    if (path === "/computer-use/apps" && method === "GET") {
      const apps = await computerUse.listApps({ refresh: url.searchParams.get("refresh") === "true" });
      sendJson(res, 200, apps, allowedOrigin);
      return true;
    }

    if (path === "/computer-use/close" && method === "POST") {
      sendJson(res, 200, await computerUse.closeComputerUse(), allowedOrigin);
      return true;
    }

    const knownPostPaths = new Set([
      "/computer-use/windows",
      "/computer-use/observe",
      "/computer-use/click",
      "/computer-use/type",
      "/computer-use/press-key",
      "/computer-use/scroll",
      "/computer-use/set-value",
      "/computer-use/secondary-action",
      "/computer-use/hotkey",
    ]);
    if (method !== "POST" || !knownPostPaths.has(path)) return false;
    const body = await readJsonBody(req);

    if (path === "/computer-use/windows") {
      const pid = requirePositiveInteger(body.pid, "PID");
      sendJson(res, 200, await computerUse.listWindows(pid), allowedOrigin);
      return true;
    }

    const params = normalizeBase(body);
    if (path === "/computer-use/observe") {
      params.windowId = requirePositiveInteger(params.windowId, "windowId");
      sendJson(res, 200, await computerUse.observeWindow(params), allowedOrigin);
      return true;
    }
    if (path === "/computer-use/click") {
      requirePointOrElement(params);
      sendJson(res, 200, await computerUse.click(params), allowedOrigin);
      return true;
    }
    if (path === "/computer-use/type") {
      requireWindowOrElement(params);
      params.text = requireString(params.text, "texto", { allowEmpty: true });
      sendJson(res, 200, await computerUse.typeText(params), allowedOrigin);
      return true;
    }
    if (path === "/computer-use/press-key") {
      requireWindowOrElement(params);
      params.key = requireString(params.key, "tecla");
      sendJson(res, 200, await computerUse.pressKey(params), allowedOrigin);
      return true;
    }
    if (path === "/computer-use/scroll") {
      requirePointOrElement(params);
      params.direction = requireString(params.direction, "direção");
      sendJson(res, 200, await computerUse.scroll(params), allowedOrigin);
      return true;
    }
    if (path === "/computer-use/set-value") {
      params.elementToken = requireString(params.elementToken, "elementToken");
      params.value = requireString(params.value, "valor", { allowEmpty: true });
      sendJson(res, 200, await computerUse.setValue(params), allowedOrigin);
      return true;
    }
    if (path === "/computer-use/secondary-action") {
      params.elementToken = requireString(params.elementToken, "elementToken");
      params.action = requireString(params.action, "ação");
      sendJson(res, 200, await computerUse.performSecondaryAction(params), allowedOrigin);
      return true;
    }
    if (path === "/computer-use/hotkey") {
      requireWindowOrElement(params);
      if (!Array.isArray(params.keys) || params.keys.length === 0 || params.keys.some((key) => typeof key !== "string" || !key.trim())) {
        throw new RequestError(400, "teclas são obrigatórias.");
      }
      sendJson(res, 200, await computerUse.hotkey(params), allowedOrigin);
      return true;
    }

    return false;
  } catch (error) {
    sendJson(res, error.status || 500, { error: error?.message || String(error) }, allowedOrigin);
    return true;
  }
}
