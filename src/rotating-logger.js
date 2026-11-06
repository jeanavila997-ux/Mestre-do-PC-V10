"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { PROJECT_ROOT } = require("./env-local");

const NIVEIS = { DEBUG: 10, INFO: 20, WARN: 30, ERROR: 40 };

function inteiroPositivo(valor, fallback) {
  const numero = Number.parseInt(valor, 10);
  return Number.isFinite(numero) && numero > 0 ? numero : fallback;
}

function timestampArquivo() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

class RotatingLogger {
  constructor(opcoes = {}) {
    this.level = String(opcoes.level ?? process.env.MESTRE_LOG_LEVEL ?? "INFO").toUpperCase();
    const configurado = opcoes.file ?? process.env.MESTRE_LOG_FILE ?? "logs/mestre-cli.log";
    this.file = path.isAbsolute(configurado) ? configurado : path.join(PROJECT_ROOT, configurado);
    this.maxBytes = inteiroPositivo(opcoes.maxBytes ?? process.env.MESTRE_LOG_MAX_BYTES, 5 * 1024 * 1024);
    this.maxFiles = inteiroPositivo(opcoes.maxFiles ?? process.env.MESTRE_LOG_MAX_FILES, 5);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
  }

  deveRegistrar(level) {
    return (NIVEIS[level] ?? NIVEIS.INFO) >= (NIVEIS[this.level] ?? NIVEIS.INFO);
  }

  rotacionarSeNecessario(bytesNovos) {
    if (!fs.existsSync(this.file) || fs.statSync(this.file).size + bytesNovos < this.maxBytes) return;
    const ext = path.extname(this.file);
    const base = this.file.slice(0, this.file.length - ext.length);
    fs.renameSync(this.file, `${base}.${timestampArquivo()}${ext}`);
    this.limparArquivosAntigos();
  }

  limparArquivosAntigos() {
    const pasta = path.dirname(this.file);
    const ext = path.extname(this.file);
    const prefixo = `${path.basename(this.file, ext)}.`;
    const arquivos = fs.readdirSync(pasta)
      .filter((item) => item.startsWith(prefixo) && item.endsWith(ext))
      .map((item) => {
        const completo = path.join(pasta, item);
        return { completo, mtime: fs.statSync(completo).mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);

    for (const antigo of arquivos.slice(this.maxFiles)) {
      try { fs.unlinkSync(antigo.completo); } catch { /* log não interrompe a CLI */ }
    }
  }

  escrever(level, mensagem, dados) {
    if (!this.deveRegistrar(level)) return;
    const registro = { timestamp: new Date().toISOString(), level, message: String(mensagem) };
    if (dados !== undefined) registro.data = dados;
    const linha = `${JSON.stringify(registro)}\n`;
    this.rotacionarSeNecessario(Buffer.byteLength(linha));
    fs.appendFileSync(this.file, linha, "utf8");
  }

  debug(mensagem, dados) { this.escrever("DEBUG", mensagem, dados); }
  info(mensagem, dados) { this.escrever("INFO", mensagem, dados); }
  warn(mensagem, dados) { this.escrever("WARN", mensagem, dados); }
  error(mensagem, dados) { this.escrever("ERROR", mensagem, dados); }
}

module.exports = { RotatingLogger, NIVEIS, inteiroPositivo };
