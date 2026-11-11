#!/usr/bin/env node

/**
 * dsh-routes.js — Rotas HTTP nativas do DeepSeek Harness (dsh).
 *
 * Endpoints (todos exigem a mesma autorização do /run; só loopback):
 *   GET  /dsh/status   — instalação, home e cadeia de provedores visível
 *   POST /dsh/run      - inicia tarefa headless {task, cwd?, provider?,
 *                        timeoutMs?, retry?} → 202 {jobId}
 *   GET  /dsh/job?id=  — estado/resultado do job
 *
 * A tarefa é assíncrona porque o dsh pode levar minutos; a UI faz polling como
 * em /run-status e /rea/job.
 */

import { randomUUID } from "node:crypto";
import { dshStatus, runTask, validateTask } from "./dsh-bridge.js";

const JOB_RETENTION_MS = 30 * 60 * 1000;
const MAX_CONCURRENT_JOBS = 2;
const jobs = new Map();

function jsonHeaders(origin) {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, X-Mestre-Client, X-Mestre-Mobile-Token, X-Mestre-Mcp-Token, X-Mestre-Extension-Token",
    Vary: "Origin",
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
      try {
        resolve(JSON.parse(buf || "{}"));
      } catch {
        reject(new Error("JSON inválido."));
      }
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

function runningJobs() {
  let total = 0;
  for (const job of jobs.values()) {
    if (job.state === "queued" || job.state === "running") total += 1;
  }
  return total;
}

function jobOptions(body, check) {
  const provider = typeof body.provider === "string" ? body.provider.trim().slice(0, 40) : "";
  return {
    task: check.task,
    cwd: check.cwd,
    ...(provider ? { provider } : {}),
    ...(body.timeoutMs !== undefined ? { timeoutMs: body.timeoutMs } : {}),
    retry: body.retry === true,
  };
}

async function startJob(job, options) {
  job.state = "running";
  job.startedAt = Date.now();
  try {
    const result = await runTask(options);
    job.state = result.ok ? "completed" : "failed";
    job.result = result;
    if (!result.ok) job.error = result.error || "dsh não concluiu a tarefa.";
  } catch (error) {
    job.state = "failed";
    job.error = error.message;
  } finally {
    job.finishedAt = Date.now();
  }
}

export async function handleDshRoutes(req, res, url, ctx) {
  const { isAuthorized, allowedOrigin } = ctx;
  const path = url.pathname;
  const method = req.method;

  if (method === "OPTIONS") {
    res.writeHead(204, jsonHeaders(allowedOrigin));
    res.end();
    return true;
  }

  if (path === "/dsh/status" && method === "GET") {
    if (!isAuthorized(req)) return send(res, 403, { error: "Não autorizado." }, allowedOrigin), true;
    send(res, 200, dshStatus(), allowedOrigin);
    return true;
  }

  if (path === "/dsh/run" && method === "POST") {
    if (!isAuthorized(req)) return send(res, 403, { error: "Não autorizado." }, allowedOrigin), true;
    let body;
    try {
      body = await readBody(req);
    } catch (error) {
      return send(res, 400, { error: error.message }, allowedOrigin), true;
    }
    pruneJobs();
    if (runningJobs() >= MAX_CONCURRENT_JOBS) {
      return send(res, 429, { ok: false, error: "Limite de tarefas dsh simultâneas atingido." }, allowedOrigin), true;
    }
    const check = await validateTask({ task: body.task, cwd: body.cwd });
    if (!check.ok) {
      return send(res, 400, { ok: false, error: check.error }, allowedOrigin), true;
    }
    const id = randomUUID();
    const job = {
      id,
      state: "queued",
      createdAt: Date.now(),
      startedAt: null,
      finishedAt: null,
      task: check.task.slice(0, 160),
      result: null,
      error: null,
    };
    jobs.set(id, job);
    send(res, 202, { ok: true, accepted: true, jobId: id, state: "queued" }, allowedOrigin);
    // A resposta sai antes de qualquer trabalho: o dsh pode levar minutos.
    setImmediate(() => {
      void startJob(job, jobOptions(body, check));
    });
    return true;
  }

  if (path === "/dsh/job" && method === "GET") {
    if (!isAuthorized(req)) return send(res, 403, { error: "Não autorizado." }, allowedOrigin), true;
    pruneJobs();
    const id = url.searchParams.get("id");
    const job = id ? jobs.get(id) : null;
    if (!job) return send(res, 404, { ok: false, error: "Job não encontrado." }, allowedOrigin), true;
    const payload = {
      id: job.id,
      state: job.state,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
    };
    if (job.result) payload.result = job.result;
    if (job.error) payload.error = job.error;
    send(res, 200, payload, allowedOrigin);
    return true;
  }

  return false;
}

export default { handleDshRoutes };
