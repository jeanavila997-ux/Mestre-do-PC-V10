// Testes das novas sessões de comandos: Velocidade, Hardware, Inicialização e Blue Team.
// Cobre whitelist-enforcement (operações/templates registrados) e contrato de resolução,
// incluindo rejeição de injeção nos parâmetros (regex âncorado por placeholder).
import test from "node:test";
import assert from "node:assert/strict";
import { loadOperationRegistry, clearOperationRegistryCache } from "../../v10/operation-registry.js";

const CATEGORIAS_NOVAS = ["Velocidade", "Hardware", "Inicialização", "Blue Team"];

test("as 4 novas categorias existem no catálogo", async () => {
  clearOperationRegistryCache();
  const reg = await loadOperationRegistry();
  const cats = new Set([
    ...reg.operations.map((o) => o.category),
    ...reg.parametrizedTemplates.map((t) => t.category),
  ]);
  for (const c of CATEGORIAS_NOVAS) assert.ok(cats.has(c), `categoria ausente: ${c}`);
});

test("o registro continua íntegro após adicionar as sessões", async () => {
  clearOperationRegistryCache();
  const reg = await loadOperationRegistry();
  const v = reg.validate();
  assert.ok(v.ok, `validate() falhou: ${JSON.stringify(v.errors)}`);
});

test("operações fixas das novas sessões resolvem para um comando", async () => {
  clearOperationRegistryCache();
  const reg = await loadOperationRegistry();
  for (const id of ["teste_download_cloudflare", "saude_disco_smart", "listar_programas_inicializacao", "seg_portas_escuta", "seg_defender_status"]) {
    const r = reg.resolve({ id });
    assert.ok(r.cmd && !r.error, `operação ${id} não resolveu: ${r.error}`);
  }
});

test("templates com parâmetros válidos resolvem", async () => {
  clearOperationRegistryCache();
  const reg = await loadOperationRegistry();
  const casos = [
    { id: "ping_host", params: { host: "example.com" } },
    { id: "teste_download_customizado", params: { tamanho: "100" } },
    { id: "desabilitar_tarefa_agendada", params: { nome: "OneDriveStandaloneUpdateTask" } },
    { id: "seg_hash_arquivo", params: { caminho: "C:\\Program Files (x86)\\app\\x.dll" } },
    { id: "seg_eventos_por_id", params: { id: "4625" } },
    { id: "seg_testar_porta", params: { host: "example.com", porta: "443" } },
  ];
  for (const c of casos) {
    const r = reg.resolve(c);
    assert.ok(r.cmd && !r.error, `template ${c.id} não resolveu: ${r.error}`);
  }
});

test("templates rejeitam injeção de shell nos parâmetros", async () => {
  clearOperationRegistryCache();
  const reg = await loadOperationRegistry();
  const maliciosos = [
    { id: "ping_host", params: { host: 'x"; Remove-Item C:\\ -Recurse' } },
    { id: "ping_host", params: { host: "$(calc)" } },
    { id: "teste_download_customizado", params: { tamanho: "1`whoami`" } },
    { id: "desabilitar_tarefa_agendada", params: { nome: 'a" | del *' } },
    { id: "seg_hash_arquivo", params: { caminho: 'c:\\x"; calc' } },
    { id: "seg_eventos_por_id", params: { id: "4625; calc" } },
    { id: "seg_status_servico", params: { nome: "a`whoami`" } },
  ];
  for (const c of maliciosos) {
    const r = reg.resolve(c);
    assert.ok(r.error && !r.cmd, `injeção NÃO bloqueada em ${c.id}: ${JSON.stringify(c.params)}`);
  }
});
