import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const testDir = dirname(fileURLToPath(import.meta.url));
const mcpDir = join(testDir, "..");

async function startMockLauncher(statusData, outputs = {}) {
  const calls = [];
  const jobs = new Map();
  let nextJob = 1;
  const server = createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.method === "GET" && req.url === "/status") {
      res.end(JSON.stringify(statusData));
      return;
    }
    if (req.method === "POST" && req.url === "/run") {
      let body = "";
      for await (const chunk of req) body += chunk;
      const payload = JSON.parse(body);
      calls.push(payload);
      const jobId = String(nextJob++);
      jobs.set(jobId, outputs[payload.id] ?? "");
      res.end(JSON.stringify({ success: true, accepted: true, jobId }));
      return;
    }
    if (req.method === "GET" && req.url.startsWith("/run-status?")) {
      const jobId = new URL(req.url, "http://127.0.0.1").searchParams.get("id");
      res.end(JSON.stringify({ state: "completed", success: true, exitCode: 0, output: jobs.get(jobId) ?? "" }));
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: "not found" }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    calls,
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

async function withMcpClient(t, launcher, callback) {
  const auditDir = await mkdtemp(join(tmpdir(), "mestre-audit-"));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(mcpDir, "index.js")],
    cwd: mcpDir,
    stderr: "pipe",
    env: {
      ...process.env,
      MESTRE_BASE_URL: launcher.baseUrl,
      MESTRE_AUDIT_LOG_DIR: auditDir,
      COMPUTERNAME: "TEST-PC",
    },
  });
  const client = new Client({ name: "diagnosticar-saude-test", version: "1.0.0" });
  t.after(async () => {
    await client.close();
    await launcher.close();
    await rm(auditDir, { recursive: true, force: true });
  });
  await client.connect(transport);
  await callback(client, auditDir);
}

test("diagnóstico usa métricas em GB, executa coletores e audita resposta JSON", async (t) => {
  const launcher = await startMockLauncher(
    { cpu: 42, ramTotal: 16, ramFree: 4, diskUsed: 400, diskFree: 100 },
    {
      listar_servicos_em_execucao: "Running  AudioSrv  Windows Audio\nRunning  LanmanServer  Server\nRunning  wuauserv  Windows Update",
      verificar_saude_do_disco_smart: "PredictFailure Reason\n-------------- ------\nFalse          0",
      historico_de_erros_do_sistema: "TimeGenerated Source Message\n------------- ------ -------\n01/01/2026 Kernel erro um\n02/01/2026 Disk erro dois",
    },
  );

  await withMcpClient(t, launcher, async (client, auditDir) => {
    const result = await client.callTool({
      name: "mestre_diagnosticar_saude_sistema",
      arguments: { incluir_historico: true, verificar_smart: true, response_format: "json" },
    });
    assert.equal(result.isError, undefined);
    const report = JSON.parse(result.content[0].text);

    assert.deepEqual(report.metrics.ram, { total_gb: 16, free_gb: 4, used_percent: 75 });
    assert.deepEqual(
      { total_gb: report.metrics.disk.total_gb, free_gb: report.metrics.disk.free_gb, used_percent: report.metrics.disk.used_percent },
      { total_gb: 500, free_gb: 100, used_percent: 80 },
    );
    assert.equal(report.metrics.smart_status, "healthy");
    assert.deepEqual(report.services_failing, ["BITS"]);
    assert.equal(report.critical_events_count, 2);
    assert.deepEqual(launcher.calls.map((call) => call.id), [
      "listar_servicos_em_execucao",
      "verificar_saude_do_disco_smart",
      "historico_de_erros_do_sistema",
    ]);

    const auditFiles = await import("node:fs/promises").then(({ readdir }) => readdir(auditDir));
    const auditText = await readFile(join(auditDir, auditFiles[0]), "utf8");
    assert.match(auditText, /"action":"mestre_diagnosticar_saude_sistema"/);
  });
});

test("operações que apagam dados, fazem push ou alteram ExecutionPolicy são destrutivas", async () => {
  const catalog = JSON.parse(await readFile(join(mcpDir, "..", "v10", "allowed-operations.json"), "utf8"));
  const destructiveIds = [
    "limpeza_rapida_completa",
    "limpar_temp_usuario",
    "limpar_temp_do_windows",
    "esvaziar_lixeira",
    "limpar_arquivos_antigos_do_downloads_30_dias",
    "limpar_thumbnail_cache",
    "remover_arquivos_tmp_do_sistema",
    "git_add_commit_push",
    "limpar_cache_pip",
    "ativar_bloqueio_script_powershell_constrained",
  ];

  for (const id of destructiveIds) {
    const operation = catalog.operations.find((candidate) => candidate.id === id);
    assert.ok(operation, `operação ausente: ${id}`);
    assert.equal(operation.destructive, true, `${id} deve exigir confirmação`);
  }
});

test("limpeza de logs preserva diretórios e limita remoção a arquivos antigos conhecidos", async () => {
  const script = await readFile(join(mcpDir, "..", "scripts", "limpar-logs-windows.ps1"), "utf8");
  const catalog = JSON.parse(await readFile(join(mcpDir, "..", "v10", "allowed-operations.json"), "utf8"));
  const operation = catalog.operations.find((candidate) => candidate.id === "limpar_arquivos_de_log_do_windows");

  assert.doesNotMatch(script, /Remove-Item\s+["']C:\\Windows\\Logs\\\*["']\s+-Recurse\s+-Force/i);
  assert.match(script, /Get-ChildItem[^\r\n]+-Recurse\s+-File/i);
  assert.match(script, /AddDays\(-30\)/);
  assert.doesNotMatch(operation.command, /Remove-Item\s+"C:\\Windows\\Logs\\\*"\s+-Recurse\s+-Force/i);
  assert.match(operation.command, /Get-ChildItem[^;]+-Recurse\s+-File/i);
});

test("diagnóstico tolera métricas de disco ausentes e não anuncia ferramenta inexistente", async (t) => {
  const launcher = await startMockLauncher(
    { cpu: 10, ramTotal: 8, ramFree: 4 },
    { listar_servicos_em_execucao: "Running  AudioSrv\nRunning  BITS\nRunning  LanmanServer\nRunning  wuauserv" },
  );

  await withMcpClient(t, launcher, async (client) => {
    const result = await client.callTool({
      name: "mestre_diagnosticar_saude_sistema",
      arguments: { incluir_historico: false, verificar_smart: false, response_format: "markdown" },
    });
    assert.equal(result.isError, undefined);
    assert.match(result.content[0].text, /S\.M\.A\.R\.T\.:.*Não verificado/);
    assert.doesNotMatch(result.content[0].text, /mestre_otimizar_sistema_automatico/);
    assert.deepEqual(launcher.calls.map((call) => call.id), ["listar_servicos_em_execucao"]);
  });
});
