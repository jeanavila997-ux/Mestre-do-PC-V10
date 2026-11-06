"use strict";

const fs = require("node:fs");
const path = require("node:path");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const DEFAULT_ENV_FILE = path.join(PROJECT_ROOT, ".env.local");
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

function removerAspas(valor) {
  if (valor.length < 2) return valor;
  const primeira = valor[0];
  const ultima = valor.at(-1);
  return (primeira === '"' && ultima === '"') || (primeira === "'" && ultima === "'")
    ? valor.slice(1, -1)
    : valor;
}

function carregarEnvLocal(arquivo = DEFAULT_ENV_FILE) {
  if (!fs.existsSync(arquivo)) return { carregado: false, arquivo, variaveis: [] };

  const variaveis = [];
  const conteudo = fs.readFileSync(arquivo, "utf8");
  for (const linhaOriginal of conteudo.split(/\r?\n/)) {
    const linha = linhaOriginal.trim();
    if (!linha || linha.startsWith("#")) continue;

    const indice = linha.indexOf("=");
    if (indice <= 0) continue;
    const chave = linha.slice(0, indice).trim();
    if (!ENV_NAME.test(chave) || process.env[chave] !== undefined) continue;

    process.env[chave] = removerAspas(linha.slice(indice + 1).trim());
    variaveis.push(chave);
  }

  return { carregado: true, arquivo, variaveis };
}

module.exports = { PROJECT_ROOT, DEFAULT_ENV_FILE, carregarEnvLocal, removerAspas };
