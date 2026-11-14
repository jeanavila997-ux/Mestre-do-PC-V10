#!/usr/bin/env node
"use strict";

const { carregarEnvLocal } = require("../src/env-local");
carregarEnvLocal();
const { RotatingLogger } = require("../src/rotating-logger");

const logger = new RotatingLogger();

function mostrarAjuda() {
  console.log(`
MESTRE EXTENSSAO — CLI local com IA

Uso:
  npm run cli:status
  npm run ia -- "sua pergunta"

Opções do comando ia:
  --model <modelo>   Escolhe o modelo Ollama (padrão: MESTRE_CLI_MODEL, depois OLLAMA_MODEL, depois qwen3.5:4b-text)
  --system <prompt>  Substitui o prompt de sistema
  --json             Exibe a resposta completa em JSON

Exemplos:
  npm run ia -- "Analise a arquitetura do Mestre do PC"
  npm run ia -- "Explique este erro" --model deepseek-coder:6.7b
`);
}

function lerArgumentos(lista) {
  const resultado = { posicionais: [], model: null, system: null, json: false };
  for (let i = 0; i < lista.length; i += 1) {
    const atual = lista[i];
    if (atual === "--model" || atual === "--system") {
      const valor = lista[++i];
      if (!valor || valor.startsWith("--")) throw new Error(`A opção ${atual} exige um valor.`);
      resultado[atual.slice(2)] = valor;
    } else if (atual === "--json") {
      resultado.json = true;
    } else if (atual.startsWith("--")) {
      throw new Error(`Opção desconhecida: ${atual}`);
    } else {
      resultado.posicionais.push(atual);
    }
  }
  return resultado;
}

function numero(valor, fallback, parser = Number.parseFloat) {
  const resultado = parser(String(valor));
  return Number.isFinite(resultado) && resultado > 0 ? resultado : fallback;
}

function obterConfig() {
  return {
    ollamaUrl: process.env.OLLAMA_URL ?? "http://127.0.0.1:11434",
    apiKey: process.env.OLLAMA_API_KEY ?? "",
    model: process.env.MESTRE_CLI_MODEL || process.env.OLLAMA_MODEL || "qwen3.5:4b-text",
    system: process.env.MESTRE_IA_SYSTEM_PROMPT ?? "Você é o assistente local do Mestre do PC. Responda em português do Brasil.",
    timeoutMs: numero(process.env.OLLAMA_TIMEOUT_MS, 120000, Number.parseInt),
    numCtx: numero(process.env.OLLAMA_NUM_CTX, 8192, Number.parseInt),
    temperature: numero(process.env.OLLAMA_TEMPERATURE, 0.7),
    topP: numero(process.env.OLLAMA_TOP_P, 0.9),
    topK: numero(process.env.OLLAMA_TOP_K, 40, Number.parseInt),
    keepAlive: process.env.OLLAMA_KEEP_ALIVE ?? "5m",
  };
}

function status() {
  const config = obterConfig();
  console.log("MESTRE EXTENSSAO");
  console.log(`Ollama: ${config.ollamaUrl}`);
  console.log(`Modelo: ${config.model}`);
  console.log(`Log: ${process.env.MESTRE_LOG_FILE ?? "logs/mestre-cli.log"}`);
  console.log(`Nível do log: ${process.env.MESTRE_LOG_LEVEL ?? "INFO"}`);
  console.log(`Chave de API: ${config.apiKey ? "configurada" : "não configurada"}`);
  logger.info("Status da CLI consultado");
}

async function executarIA(args) {
  const config = obterConfig();
  const prompt = args.posicionais.join(" ").trim();
  if (!prompt) throw new Error("Informe uma pergunta para o comando ia.");

  const model = args.model || config.model;
  const system = args.system || config.system;
  const url = `${config.ollamaUrl.replace(/\/$/, "")}/api/chat`;
  const headers = { "Content-Type": "application/json" };
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
  const body = {
    model,
    stream: false,
    // Resposta direta: sem think:false, modelos com raciocínio devolvem message.content vazio.
    think: false,
    messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
    options: { num_ctx: config.numCtx, temperature: config.temperature, top_p: config.topP, top_k: config.topK },
    keep_alive: config.keepAlive,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  logger.info("Requisição de IA iniciada", { model, promptLength: prompt.length });
  try {
    const resposta = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: controller.signal });
    const texto = await resposta.text();
    let payload;
    try { payload = JSON.parse(texto); } catch { payload = { raw: texto }; }
    if (!resposta.ok) throw new Error(`Ollama retornou HTTP ${resposta.status}: ${texto}`);
    logger.info("Requisição de IA concluída", { model });
    if (args.json) return console.log(JSON.stringify(payload, null, 2));
    if (!payload?.message?.content) throw new Error("A resposta do Ollama não contém message.content.");
    console.log(payload.message.content);
  } catch (erro) {
    logger.error("Falha na requisição de IA", { model, error: erro.message });
    if (erro.name === "AbortError") throw new Error(`Ollama excedeu o tempo limite de ${config.timeoutMs} ms.`);
    throw erro;
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const [, , comando, ...restante] = process.argv;
  if (!comando || comando === "--help" || comando === "-h") return mostrarAjuda();
  if (comando === "status") return status();
  if (comando === "ia") return executarIA(lerArgumentos(restante));
  throw new Error(`Comando desconhecido: ${comando}`);
}

if (require.main === module) {
  main().catch((erro) => {
    logger.error("Erro fatal da CLI", { error: erro.message });
    console.error(`Erro: ${erro.message}`);
    process.exitCode = 1;
  });
}

module.exports = { executarIA, lerArgumentos, mostrarAjuda, obterConfig, status };
