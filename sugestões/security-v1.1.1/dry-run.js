import { SecurityError } from './errors.js';
import { redactAndTruncate } from './redact.js';

/**
 * Regra #14 — Dry-run obrigatório, à prova de "simulação que executa".
 *
 * O bug encontrado no código real (v10/chat-integrado/tools-api.js:223):
 *
 *     if (options.dryRun) return data;
 *
 * É a ÚNICA ocorrência de dryRun em todo o v10/. Nenhuma operação da whitelist
 * declara suporte. Então `runOperation(op, {...args, dryRun:true})` IGNORA a
 * flag e executa de verdade — enquanto a UI mostra "simulação". O usuário lê
 * o preview, digita "confirmo", e a limpeza já aconteceu.
 *
 * Aqui: sem `supportsDryRun === true` explícito, a operação NÃO roda.
 */

/**
 * @param {{
 *   op: string,
 *   args: object,
 *   supportsDryRun: boolean,
 *   broker?: import('./approval.js').ApprovalBroker,
 *   token?: string|null,
 *   runner: (ctx: { op: string, args: object, dryRun: boolean }) => Promise<any>,
 *   action?: string,
 *   nivel?: string,
 * }} input
 */
export async function executeDestructive({
  op,
  args,
  supportsDryRun,
  broker = null,
  token = null,
  runner,
  action = 'destructive',
  nivel = 'N3',
}) {
  if (typeof runner !== 'function') {
    throw new SecurityError('RUNNER_AUSENTE', 'executeDestructive exige um runner.');
  }

  // 1) Fail-closed: sem suporte declarado, não há preview possível.
  if (supportsDryRun !== true) {
    return {
      status: 'BLOQUEADO_SEM_DRYRUN',
      nivel,
      op,
      precisaConfirmacaoInterativa: true,
      motivo: 'OP_SEM_DRYRUN',
      mensagem:
        `⚠️ **${op}** declara não suportar simulação (dry-run).\n` +
        'Executar sem preview é proibido. Confirme no painel, vendo os argumentos exatos.',
    };
  }

  // 2) Preview de verdade.
  const preview = await runner({ op, args, dryRun: true });
  const resumo = redactAndTruncate(
    typeof preview === 'string' ? preview : JSON.stringify(preview),
    800,
  );

  // 3) Sem aprovação -> devolve o preview e para aqui.
  if (!token) {
    return {
      status: 'PREVIEW',
      nivel,
      op,
      precisaConfirmacao: true,
      preview: resumo,
      mensagem:
        `⚠️ **${op}** — simulação:\n${resumo}\n\n` +
        'Confirme no painel do Mestre do PC (botão "Executar"). A palavra "confirmo" no chat não vale.',
    };
  }

  // 4) Aprovação fora de banda, ligada a estes args exatos, uso único.
  if (!broker) {
    throw new SecurityError('APROVACAO_SEM_BROKER', 'Token fornecido sem broker configurado.');
  }
  broker.consume(token, { op, args, action });

  // 5) Só agora executa.
  const resultado = await runner({ op, args, dryRun: false });
  return {
    status: 'EXECUTADO',
    nivel,
    op,
    resultado: redactAndTruncate(
      typeof resultado === 'string' ? resultado : JSON.stringify(resultado),
      800,
    ),
  };
}
