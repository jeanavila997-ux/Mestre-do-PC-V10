#!/usr/bin/env node
/**
 * rea-cli.mjs — atalho de linha de comando para a ponte do REA.
 *
 * Usado pelas operações da whitelist (menu de comandos) e por testes:
 *   node scripts/rea-cli.mjs status
 *   node scripts/rea-cli.mjs doctor
 *   node scripts/rea-cli.mjs analyze-js "C:\caminho\app.asar"
 *
 * Só faz análise (leitura). Nunca executa o alvo.
 */

import { reaStatus, reaDoctor, reaAnalyzeAppJs } from "../v10/rea-bridge.js";

const [command, ...args] = process.argv.slice(2);

function print(payload) {
  process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
}

async function main() {
  switch (command) {
    case "status": {
      const result = await reaStatus();
      print({ success: true, rea: result });
      return 0;
    }
    case "doctor": {
      const result = await reaDoctor();
      // Diagnóstico executado = sucesso; o veredito de saúde do REA vai no payload.
      print({ success: Boolean(result.report), healthy: result.report?.healthy ?? null, ...result });
      return result.report ? 0 : 1;
    }
    case "analyze-js": {
      const target = args.join(" ").trim();
      const result = await reaAnalyzeAppJs({ target });
      print(result);
      return result.ok ? 0 : 1;
    }
    default:
      print({
        success: false,
        error: "Comando inválido.",
        usage: [
          "node scripts/rea-cli.mjs status",
          "node scripts/rea-cli.mjs doctor",
          "node scripts/rea-cli.mjs analyze-js \"C:\\caminho\\app.asar\"",
        ],
      });
      return 2;
  }
}

main()
  .then((code) => { process.exitCode = code; })
  .catch((error) => {
    print({ success: false, error: error.message });
    process.exitCode = 1;
  });
