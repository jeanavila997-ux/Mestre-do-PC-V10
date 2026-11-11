import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const bridge = await import(new URL("../../v10/dsh-bridge.js", import.meta.url));

test("dsh: status sempre responde, mesmo sem o pacote instalado", () => {
  const status = bridge.dshStatus();
  assert.equal(status.ok, true);
  assert.equal(typeof status.installed, "boolean");
  assert.ok(["custom", "local", "npx"].includes(status.mode), `modo inesperado: ${status.mode}`);
  assert.equal(status.version, bridge.DSH_VERSION);
  assert.ok(status.home && status.home.length > 0, "home deve ser informado");
  assert.ok(Array.isArray(status.providers), "providers deve ser lista");
  assert.equal(status.available, true, "modo npx também alcança o dsh");
  assert.ok(Array.isArray(status.skipped), "skipped deve ser lista");
  for (const provider of status.providers) {
    assert.equal(provider.ready, true);
    assert.equal(typeof provider.label, "string");
    assert.ok(provider.model, `provedor ${provider.id} sem model na cadeia`);
  }
  assert.match(status.command, /headless --patch <patchFile> --json/);
  assert.match(status.command, /dsh/);
});

test("dsh: cadeia respeita a ordem e omite provedor sem chave", () => {
  const chain = bridge.providerChain({
    env: { XAI_API_KEY: "chave-grok", OPENCODE_GO_API_KEY: "chave-go" },
    envFile: null,
    providersFile: null,
  });
  const ids = chain.map((provider) => provider.id);
  // grok → opencode-go → ollama (local, dispensa chave); 9router/opencode/deepseek ficam de fora.
  assert.deepEqual(ids, ["grok", "opencode-go", "ollama"]);

  const soDeepseek = bridge.providerChain({
    env: { DEEPSEEK_API_KEY: "chave-ds" },
    envFile: null,
    providersFile: null,
  });
  assert.deepEqual(soDeepseek.map((provider) => provider.id), ["ollama", "deepseek"]);

  const semNada = bridge.providerChain({ env: {}, envFile: null, providersFile: null });
  assert.deepEqual(semNada.map((provider) => provider.id), ["ollama"], "só o local sobrevive sem chaves");

  // Metadados públicos: nome da variável pode, valor da chave nunca.
  assert.equal(chain[0].envKey, "XAI_API_KEY");
  assert.equal(chain[0].label, "Grok (xAI)");
  assert.equal(chain[0].ready, true);
  assert.ok(!JSON.stringify(chain).includes("chave-grok"), "a chave não pode sair da ponte");
});

test("dsh: store da UI define credencial, enabled:false e model obrigatório", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mpc-dsh-store-"));
  try {
    const file = join(dir, "providers.json");
    await writeFile(
      file,
      JSON.stringify({
        defaultProvider: "9router",
        providers: {
          grok: {},
          "9router": { apiKey: "chave-9router-invalida", enabled: false },
          opencode: {
            apiKey: "chave-opencode",
            model: "deepseek-v4.1-flash",
            baseUrl: "https://opencode.ai/zen/go/v1",
          },
          "opencode-go": { apiKey: "chave-opencode-go" },
        },
      }),
      "utf8",
    );

    const chain = bridge.providerChain({ env: {}, envFile: null, providersFile: file });
    const ids = chain.map((provider) => provider.id);
    assert.deepEqual(ids, ["opencode", "opencode-go", "ollama"]);

    // (a) enabled:false tira o 9router, mesmo com apiKey.
    assert.ok(!ids.includes("9router"));
    // (b) apiKey do store conta como credencial (não há nada no env/.env.local).
    assert.ok(ids.includes("opencode-go"));
    // baseUrl/model do store vencem os defaults.
    const opencode = chain.find((provider) => provider.id === "opencode");
    assert.equal(opencode.model, "deepseek-v4.1-flash");
    assert.equal(opencode.baseUrl, "https://opencode.ai/zen/go/v1");

    // (d) label/ready presentes em todos.
    for (const provider of chain) {
      assert.equal(provider.ready, true);
      assert.equal(typeof provider.label, "string");
      assert.ok(provider.label.length > 0);
    }

    const status = bridge.dshStatus({ env: {}, envFile: null, providersFile: file });
    assert.equal(status.available, true);
    assert.ok(status.skipped.some((item) => item.id === "9router"), "desativado aparece em skipped");
    assert.ok(!JSON.stringify(status).includes("chave-opencode-go"), "chave do store não pode vazar");

    // (c) provedor sem model resolvido sai da cadeia e vai para skipped.
    const semModel = join(dir, "sem-model.json");
    await writeFile(semModel, JSON.stringify({ providers: { opencode: { apiKey: "chave" } } }), "utf8");
    const semModelDeps = { env: {}, envFile: null, providersFile: semModel };
    assert.deepEqual(bridge.providerChain(semModelDeps).map((provider) => provider.id), ["ollama"]);
    const skipped = bridge.dshStatus(semModelDeps).skipped.find((item) => item.id === "opencode");
    assert.ok(skipped, "opencode precisa aparecer em skipped");
    assert.match(skipped.reason, /model/i);

    // Store corrompido nunca lança: cai para os defaults.
    const quebrado = join(dir, "quebrado.json");
    await writeFile(quebrado, "{ isso nao e json", "utf8");
    assert.deepEqual(
      bridge.providerChain({ env: {}, envFile: null, providersFile: quebrado }).map((provider) => provider.id),
      ["ollama"],
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("dsh: validateTask recusa vazio, tarefa gigante e cwd relativo", async () => {
  const vazio = await bridge.validateTask({ task: "   " });
  assert.equal(vazio.ok, false);
  assert.match(vazio.error, /tarefa/i);

  const gigante = await bridge.validateTask({ task: "a".repeat(8001) });
  assert.equal(gigante.ok, false);
  assert.match(gigante.error, /8000/);

  const relativo = await bridge.validateTask({ task: "listar", cwd: "v10" });
  assert.equal(relativo.ok, false);
  assert.match(relativo.error, /absoluto/i);

  const traversal = await bridge.validateTask({ task: "listar", cwd: `${root}\\..\\Windows` });
  assert.equal(traversal.ok, false);
  assert.match(traversal.error, /\.\./);

  const sistema = await bridge.validateTask({ task: "listar", cwd: "C:\\Windows\\System32" });
  assert.equal(sistema.ok, false);
  assert.match(sistema.error, /sistema/i);

  const inexistente = await bridge.validateTask({ task: "listar", cwd: join(root, "nao-existe-xyz") });
  assert.equal(inexistente.ok, false);
  assert.match(inexistente.error, /não encontrado/i);

  const valido = await bridge.validateTask({ task: "listar arquivos", cwd: root });
  assert.equal(valido.ok, true);
  assert.equal(valido.cwd, resolve(root));
  assert.equal(valido.task, "listar arquivos");
});

test("dsh: parser NDJSON extrai texto, sessão e final.reason.kind", () => {
  const amostra = [
    JSON.stringify({ type: "session", sessionId: "ses_abc123" }),
    "npm warn deprecated alguma-coisa@1.0.0", // ruído do npx não é evento
    JSON.stringify({ type: "message", text: "pensando..." }),
    JSON.stringify({ type: "final", text: "pronto: 3 arquivos", reason: { kind: "completed" } }),
  ].join("\r\n");

  const parsed = bridge.__testables.parseEvents(amostra);
  assert.equal(parsed.events.length, 3, "só linhas JSON viram evento");
  assert.equal(parsed.text, "pronto: 3 arquivos");
  assert.equal(parsed.sessionId, "ses_abc123");
  assert.equal(parsed.reasonKind, "completed");
  assert.equal(parsed.lastIsFinal, true, "a última linha é o evento final");
  assert.equal(parsed.last, parsed.final);

  const semFinalNoFim = bridge.__testables.parseEvents(
    [
      JSON.stringify({ type: "final", text: "x", reason: { kind: "completed" } }),
      JSON.stringify({ type: "message", text: "log depois do final" }),
    ].join("\n"),
  );
  assert.equal(semFinalNoFim.lastIsFinal, false, "final não é a última linha");

  const falha = bridge.__testables.parseEvents(
    [JSON.stringify({ type: "final", text: "sem rede", reason: { kind: "provider_error" } })].join("\n"),
  );
  assert.equal(falha.reasonKind, "provider_error");
  assert.equal(falha.text, "sem rede");

  const gigante = bridge.__testables.parseEvents(
    JSON.stringify({ type: "final", text: "x".repeat(20000), reason: { kind: "completed" } }),
  );
  assert.ok(gigante.text.length < 20000, "string grande deve ser truncada");
  assert.match(gigante.text, /truncado/);
});

test("dsh: cascata avança para o próximo provedor quando o primeiro falha", async () => {
  const home = await mkdtemp(join(tmpdir(), "mpc-dsh-test-"));
  const chamadas = [];
  const segredo = "SEGREDO-NAO-VAZAR-123";
  try {
    const run = async (commandLine, options) => {
      chamadas.push({ commandLine, cwd: options.cwd });
      const provider = /patches[\\/]([\w-]+)\.yml/.exec(commandLine)?.[1];
      if (provider === "grok") {
        return {
          ok: false,
          code: 3,
          timedOut: false,
          truncated: false,
          durationMs: 5,
          stderr: "dsh: AUTH: 401 invalid key",
          stdout: JSON.stringify({ type: "final", text: "", reason: { kind: "error" } }),
        };
      }
      return {
        ok: true,
        code: 0,
        timedOut: false,
        truncated: false,
        durationMs: 7,
        stderr: "",
        stdout: [
          JSON.stringify({ type: "session", sessionId: "ses_ok" }),
          JSON.stringify({ type: "final", text: "concluído pelo ollama", reason: { kind: "completed" } }),
        ].join("\n"),
      };
    };

    const result = await bridge.runTask(
      { task: "listar os 3 maiores arquivos" },
      {
        run,
        env: { XAI_API_KEY: segredo, DEEPSEEK_API_KEY: "outra-chave" },
        envFile: null,
        home,
        sleep: async () => {},
      },
    );

    assert.equal(result.ok, true);
    assert.equal(result.provider, "ollama");
    assert.equal(result.text, "concluído pelo ollama");
    assert.equal(result.sessionId, "ses_ok");
    assert.deepEqual(result.attempts.map((attempt) => attempt.provider), ["grok", "ollama"]);
    assert.equal(result.attempts[0].ok, false);
    assert.equal(result.attempts[0].code, "AUTH", "código vem de 'dsh: <CODE>: <msg>' no stderr");
    assert.match(result.attempts[0].error, /AUTH/);
    assert.equal(typeof result.ms, "number");

    // cwd default é a raiz do projeto; --patch antes de --json e tarefa por último.
    assert.equal(chamadas[0].cwd, bridge.PROJECT_DIR);
    assert.match(chamadas[0].commandLine, /headless --patch [^ ]+grok\.yml --json "listar os 3 maiores arquivos"$/);

    // Patch do provedor: três rows endereçadas por id, só o nome da variável.
    const patch = await readFile(join(home, "patches", "grok.yml"), "utf8");
    assert.match(patch, /^- id: llm-pi-ai$/m);
    assert.match(patch, /^ {6}grok:$/m);
    assert.match(patch, /displayName: Grok \(xAI\)/);
    assert.match(patch, /baseURL: https:\/\/api\.x\.ai\/v1/);
    assert.match(patch, /apiKeyEnv: XAI_API_KEY/);
    assert.match(patch, /^- id: agent-default-model$/m);
    assert.match(patch, /^ {4}provider: grok$/m);
    assert.match(patch, /^ {4}model: grok-4\.7$/m);
    assert.match(patch, /^- id: session-log-deepseek$/m);
    assert.match(patch, /enabled: false/);
    assert.ok(!patch.includes(segredo), "a chave não pode ser escrita no patch");
    assert.ok(!JSON.stringify(result).includes(segredo), "a chave não pode voltar na resposta");
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("dsh: exit 0 não basta — exige final completed na última linha", async () => {
  const home = await mkdtemp(join(tmpdir(), "mpc-dsh-test-"));
  const deps = { env: { XAI_API_KEY: "k" }, envFile: null, home, sleep: async () => {} };
  const finalError = JSON.stringify({ type: "final", text: "", reason: { kind: "error" } });
  const finalOk = JSON.stringify({ type: "final", text: "ok", reason: { kind: "completed" } });
  try {
    // 1) Falha dentro do turno: exit 0 + final "error" + MISSING_CREDENTIAL no stderr.
    const credencial = await bridge.runTask(
      { task: "t" },
      {
        ...deps,
        run: async () => ({
          ok: true,
          code: 0,
          timedOut: false,
          truncated: false,
          durationMs: 9,
          stdout: finalError,
          stderr: "dsh: MISSING_CREDENTIAL: XAI_API_KEY não definida",
        }),
      },
    );
    assert.equal(credencial.ok, false);
    assert.equal(credencial.attempts[0].code, "MISSING_CREDENTIAL");
    assert.match(credencial.attempts[0].error, /MISSING_CREDENTIAL/);

    // 2) Exit 0 com final completed, mas com evento depois dele → turno não concluiu.
    const foraDeOrdem = await bridge.runTask(
      { task: "t" },
      {
        ...deps,
        run: async () => ({
          ok: true,
          code: 0,
          timedOut: false,
          truncated: false,
          durationMs: 9,
          stdout: [finalOk, JSON.stringify({ type: "message", text: "log depois" })].join("\n"),
          stderr: "",
        }),
      },
    );
    assert.equal(foraDeOrdem.ok, false);
    assert.match(foraDeOrdem.attempts[0].error, /sem evento final/);

    // 3) Timeout na estreia: o erro precisa dizer que é cold start.
    const frio = await bridge.runTask(
      { task: "t" },
      {
        ...deps,
        run: async () => ({
          ok: false,
          code: null,
          timedOut: true,
          truncated: false,
          durationMs: 300000,
          stdout: "",
          stderr: "",
        }),
      },
    );
    assert.equal(frio.ok, false);
    assert.match(frio.attempts[0].error, /cold start/i);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("dsh: parseDshError e yaml do patch seguem o formato medido", () => {
  const { parseDshError, patchYaml } = bridge.__testables;
  assert.deepEqual(parseDshError("dsh: AUTH: 401 invalid_api_key"), {
    code: "AUTH",
    message: "401 invalid_api_key",
  });
  assert.equal(parseDshError("stack trace qualquer"), null);

  const yaml = patchYaml({
    id: "grok",
    displayName: "Grok (xAI)",
    api: "openai-completions",
    envKey: "XAI_API_KEY",
    baseUrl: "https://api.x.ai/v1",
    model: "grok-4.7",
  });
  const rows = yaml.split("\n").filter((line) => line.startsWith("- id:"));
  assert.deepEqual(rows, ["- id: llm-pi-ai", "- id: agent-default-model", "- id: session-log-deepseek"]);
  assert.match(yaml, /^ {8}api: openai-completions$/m);
  assert.match(yaml, /^ {10}- id: grok-4\.7$/m);
});

test("dsh: retry repete a cadeia com espera de 300s entre rodadas", async () => {
  const home = await mkdtemp(join(tmpdir(), "mpc-dsh-test-"));
  const esperas = [];
  try {
    const run = async () => ({
      ok: false,
      code: 1,
      timedOut: false,
      truncated: false,
      durationMs: 1,
      stderr: "dsh: NETWORK: sem rede",
      stdout: JSON.stringify({ type: "final", reason: { kind: "error" } }),
    });

    const result = await bridge.runTask(
      { task: "tarefa que falha", retry: true },
      {
        run,
        env: { XAI_API_KEY: "k", MPC_DSH_RETRY_ROUNDS: "1" },
        envFile: null,
        home,
        sleep: async (ms) => {
          esperas.push(ms);
        },
      },
    );

    assert.equal(result.ok, false);
    // cadeia = grok + ollama, uma rodada extra → 4 tentativas e 1 espera.
    assert.deepEqual(result.attempts.map((attempt) => attempt.provider), ["grok", "ollama", "grok", "ollama"]);
    assert.deepEqual(esperas, [300000]);
    assert.match(result.error, /NETWORK/);
    assert.equal(result.attempts[0].code, "NETWORK");
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
