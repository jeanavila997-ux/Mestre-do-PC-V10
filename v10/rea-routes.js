#!/usr/bin/env node

/**
 * rea-routes.js — Rotas HTTP nativas de engenharia reversa (REA).
 *
 * Endpoints (todos exigem a mesma autorização do /run):
 *   GET  /rea/status        — como o REA está sendo chamado (local / PATH / npx)
 *   POST /rea/doctor        — `rea doctor --json` (read-only, pode demorar)
 *   POST /rea/analyze       - inicia job de análise {target} → 202 {jobId}
 *   GET  /rea/job?id=       — estado/resultado do job
 *
 * A análise é assíncrona porque `analyze-javascript-application` pode levar
 * minutos; a UI faz polling como em /run-status.
 */

import { randomUUID } from "node:crypto";
import { reaStatus, reaDoctor, reaAnalyzeAppJs, allowedRoots } from "./rea-bridge.js";

const JOB_RETENTION_MS = 30 * 60 * 1000;
const jobs = new Map();

function jsonHeaders(origin) {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Mestre-Client, X-Mestre-Mobile-Token, X-Mestre-Mcp-Token, X-Mestre-Extension-Token",
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store",
  };
}

function send(res, status, data, origin) {
  res.writeHead(status, jsonHeaders(origin));
  res.end(JSON.stringify(data));
}

function readBody(req, maxBytes = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let buf = "";
    req.on("data", (chunk) => {
      buf += chunk;
      if (Buffer.byteLength(buf, "utf8") > maxBytes) {
        reject(new Error("Corpo da requisição excede o limite."));
        req.destroy();
      }
    });
    req.on("end", () => {
      try { resolve(JSON.parse(buf || "{}")); }
      catch { reject(new Error("JSON inválido.")); }
    });
    req.on("error", reject);
  });
}

function pruneJobs() {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (job.finishedAt && now - job.finishedAt >= JOB_RETENTION_MS) jobs.delete(id);
  }
}

export async function handleReaRoutes(req, res, url, ctx) {
  const { isAuthorized, allowedOrigin } = ctx;
  const path = url.pathname;
  const method = req.method;

  if (method === "OPTIONS") {
    res.writeHead(204, jsonHeaders(allowedOrigin));
    res.end();
    return true;
  }

  if (path === "/rea/status" && method === "GET") {
    if (!isAuthorized(req)) return send(res, 403, { error: "Não autorizado." }, allowedOrigin), true;
    const status = await reaStatus();
    send(res, 200, { success: true, rea: status }, allowedOrigin);
    return true;
  }

  if (path === "/rea/doctor" && method === "POST") {
    if (!isAuthorized(req)) return send(res, 403, { error: "Não autorizado." }, allowedOrigin), true;
    const report = await reaDoctor();
    send(res, report.ok ? 200 : 502, { success: report.ok, ...report }, allowedOrigin);
    return true;
  }

  if (path === "/rea/analyze" && method === "POST") {
    if (!isAuthorized(req)) return send(res, 403, { error: "Não autorizado." }, allowedOrigin), true;
    let body;
    try {
      body = await readBody(req);
    } catch (error) {
      return send(res, 400, { error: error.message }, allowedOrigin), true;
    }
    pruneJobs();
    const id = randomUUID();
    const job = { id, state: "running", startedAt: Date.now(), target: body.target || "" };
    jobs.set(id, job);
    reaAnalyzeAppJs({ target: body.target })
      .then((result) => {
        job.state = result.ok ? "completed" : "failed";
        job.result = result;
      })
      .catch((error) => {
        job.state = "failed";
        job.result = { ok: false, error: error.message };
      })
      .finally(() => {
        job.finishedAt = Date.now();
      });
    send(res, 202, {
      success: true,
      accepted: true,
      jobId: id,
      state: "running",
      allowedRoots: allowedRoots(),
    }, allowedOrigin);
    return true;
  }

  if (path === "/rea/job" && method === "GET") {
    if (!isAuthorized(req)) return send(res, 403, { error: "Não autorizado." }, allowedOrigin), true;
    pruneJobs();
    const id = url.searchParams.get("id");
    const job = id ? jobs.get(id) : null;
    if (!job) return send(res, 404, { success: false, error: "Job não encontrado." }, allowedOrigin), true;
    send(res, 200, {
      success: job.state === "completed",
      jobId: job.id,
      state: job.state,
      target: job.target,
      running: job.state === "running",
      done: job.state !== "running",
      result: job.result || null,
    }, allowedOrigin);
    return true;
  }

  return false;
}

export default { handleReaRoutes };
