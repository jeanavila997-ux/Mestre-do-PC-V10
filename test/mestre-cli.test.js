"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { carregarEnvLocal } = require("../src/env-local");
const { RotatingLogger } = require("../src/rotating-logger");

const projeto = path.resolve(__dirname, "..");
const cli = path.join(projeto, "scripts", "mestre-cli.js");

function temporario() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "mestre-extenssao-"));
}

function executarCli(argumentos, env = {}) {
  return new Promise((resolve, reject) => {
    const filho = spawn(process.execPath, [cli, ...argumentos], {
      cwd: projeto,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    filho.stdout.on("data", (chunk) => { stdout += chunk; });
    filho.stderr.on("data", (chunk) => { stderr += chunk; });
    filho.on("error", reject);
    filho.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

test("carrega .env.local sem sobrescrever variáveis do sistema", () => {
  const pasta = temporario();
  const arquivo = path.join(pasta, ".env.local");
  const chaveNova = `MESTRE_TESTE_NOVA_${Date.now()}`;
  const chaveExistente = `MESTRE_TESTE_EXISTENTE_${Date.now()}`;
  process.env[chaveExistente] = "sistema";
  fs.writeFileSync(arquivo, `${chaveNova}="valor local"\n${chaveExistente}=arquivo\nCHAVE INVALIDA=x\n`);

  try {
    const resultado = carregarEnvLocal(arquivo);
    assert.equal(resultado.carregado, true);
    assert.equal(process.env[chaveNova], "valor local");
    assert.equal(process.env[chaveExistente], "sistema");
    assert.deepEqual(resultado.variaveis, [chaveNova]);
  } finally {
    delete process.env[chaveNova];
    delete process.env[chaveExistente];
    fs.rmSync(pasta, { recursive: true, force: true });
  }
});

test("logger respeita nível e rotaciona o arquivo", () => {
  const pasta = temporario();
  const arquivo = path.join(pasta, "mestre.log");
  try {
    const logger = new RotatingLogger({ file: arquivo, level: "INFO", maxBytes: 150, maxFiles: 2 });
    logger.debug("não deve aparecer");
    logger.info("primeiro registro", { texto: "x".repeat(80) });
    logger.warn("segundo registro", { texto: "y".repeat(80) });
    const arquivos = fs.readdirSync(pasta);
    assert.ok(arquivos.some((nome) => /^mestre\..+\.log$/.test(nome)), "deveria criar log rotacionado");
    assert.doesNotMatch(fs.readFileSync(arquivo, "utf8"), /não deve aparecer/);
  } finally {
    fs.rmSync(pasta, { recursive: true, force: true });
  }
});

test("status usa o nome MESTRE EXTENSSAO", async () => {
  const pasta = temporario();
  try {
    const resultado = await executarCli(["status"], { MESTRE_LOG_FILE: path.join(pasta, "status.log") });
    assert.equal(resultado.code, 0, resultado.stderr);
    assert.match(resultado.stdout, /MESTRE EXTENSSAO/);
    assert.match(resultado.stdout, /127\.0\.0\.1:11434/);
  } finally {
    fs.rmSync(pasta, { recursive: true, force: true });
  }
});

test("comando ia envia a pergunta ao Ollama e devolve a resposta", async (t) => {
  let recebido;
  const servidor = http.createServer(async (req, res) => {
    const partes = [];
    for await (const parte of req) partes.push(parte);
    recebido = JSON.parse(Buffer.concat(partes).toString("utf8"));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: { content: "Resposta de teste" } }));
  });
  await new Promise((resolve) => servidor.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => servidor.close(resolve)));
  const pasta = temporario();
  t.after(() => fs.rmSync(pasta, { recursive: true, force: true }));

  const { port } = servidor.address();
  const resultado = await executarCli(["ia", "Analise", "o projeto", "--model", "modelo-teste"], {
    OLLAMA_URL: `http://127.0.0.1:${port}`,
    MESTRE_LOG_FILE: path.join(pasta, "ia.log"),
  });

  assert.equal(resultado.code, 0, resultado.stderr);
  assert.equal(resultado.stdout.trim(), "Resposta de teste");
  assert.equal(recebido.model, "modelo-teste");
  assert.equal(recebido.messages[1].content, "Analise o projeto");
  assert.equal(recebido.stream, false);
});

test("opção sem valor é recusada", async () => {
  const pasta = temporario();
  try {
    const resultado = await executarCli(["ia", "teste", "--model"], { MESTRE_LOG_FILE: path.join(pasta, "erro.log") });
    assert.notEqual(resultado.code, 0);
    assert.match(resultado.stderr, /--model exige um valor/);
  } finally {
    fs.rmSync(pasta, { recursive: true, force: true });
  }
});
