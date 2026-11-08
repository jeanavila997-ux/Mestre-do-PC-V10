// Rotas /providers* — seção "Chaves de API & Provedores" (somente 127.0.0.1)
import { checkPromptInjection } from "../mcp-server/security.js";
import { listProviders, updateProvider, setDefault, testProvider, listModels, chat, chatStream } from "./providers/index.js";

function blockedInjection(messages) {
  const list = Array.isArray(messages) ? messages : [];
  const lastUser = [...list].reverse().find((m) => m?.role === "user");
  if (!lastUser || typeof lastUser.content !== "string") return null;
  const verdict = checkPromptInjection(lastUser.content);
  if (verdict.classification !== "malicioso") return null;
  return {
    error: "Mensagem bloqueada: padrão de prompt injection detectado.",
    classification: verdict.classification,
    score: verdict.score,
    details: verdict.details,
  };
}

function isLoopback(req) {
  const a = req.socket?.remoteAddress || "";
  return a === "127.0.0.1" || a === "::1" || a === "::ffff:127.0.0.1";
}

export async function handleProviderRoutes(req, res, url, { sendJson, readBody, allowedOrigin }) {
  const path = url.pathname;
  if (!(path === "/providers" || path.startsWith("/providers/"))) return false;
  if (!isLoopback(req)) { sendJson(res, 403, { error: "Somente localhost." }, allowedOrigin); return true; }
  try {
    if (path === "/providers" && req.method === "GET") return sendJson(res, 200, listProviders(), allowedOrigin), true;
    if (path === "/providers/default" && req.method === "POST") {
      const b = await readBody(req, 16 * 1024); return sendJson(res, 200, setDefault(b.id), allowedOrigin), true;
    }
    if (path === "/providers/chat" && req.method === "POST") {
      const b = await readBody(req, 4 * 1024 * 1024);
      const blocked = blockedInjection(b.messages);
      if (blocked) return sendJson(res, 400, blocked, allowedOrigin), true;
      if (b.stream) { await chatStream(b.messages || [], res, b); return true; }
      return sendJson(res, 200, await chat(b.messages || [], b), allowedOrigin), true;
    }
    const m = path.match(/^\/providers\/([\w-]+)(?:\/(test|models))?$/);
    if (m) {
      const [, id, action] = m;
      if (action === "test" && req.method === "POST") return sendJson(res, 200, await testProvider(id), allowedOrigin), true;
      if (action === "models") return sendJson(res, 200, { models: await listModels(id) }, allowedOrigin), true;
      if (!action && req.method === "POST") {
        const b = await readBody(req, 64 * 1024); return sendJson(res, 200, updateProvider(id, b), allowedOrigin), true;
      }
    }
    sendJson(res, 404, { error: "Rota não encontrada" }, allowedOrigin); return true;
  } catch (e) {
    sendJson(res, 400, { error: e.message }, allowedOrigin); return true;
  }
}
