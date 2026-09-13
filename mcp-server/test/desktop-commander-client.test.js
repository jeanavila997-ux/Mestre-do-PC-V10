import test, { after } from "node:test";
import assert from "node:assert/strict";
import {
  callDesktopCommanderTool,
  closeDesktopCommander,
  getDesktopCommanderStatus,
  isDesktopCommanderTool,
  listDesktopCommanderTools,
} from "../../v10/chat-integrado/desktop-commander-client.js";

after(async () => {
  await closeDesktopCommander();
});

test("descobre as ferramentas do Desktop Commander", async () => {
  const tools = await listDesktopCommanderTools({ refresh: true });
  const readFile = tools.find((tool) => tool.name === "read_file");
  const writeFile = tools.find((tool) => tool.name === "write_file");

  assert.ok(tools.length >= 20);
  assert.equal(readFile?.id, "desktop__read_file");
  assert.equal(readFile?.requiresConfirmation, false);
  assert.equal(writeFile?.requiresConfirmation, true);
  assert.equal(isDesktopCommanderTool("desktop__list_directory"), true);
});

test("executa uma ferramenta somente leitura", async () => {
  const result = await callDesktopCommanderTool("desktop__get_config", {});

  assert.equal(result.provider, "desktop-commander");
  assert.equal(result.tool, "get_config");
  assert.equal(result.isError, false);
  assert.ok(result.content.some((item) => item.type === "text"));
});

test("bloqueia ferramenta destrutiva sem confirmação", async () => {
  await assert.rejects(
    callDesktopCommanderTool("desktop__write_file", {
      path: "C:\\arquivo-nao-deve-ser-criado.txt",
      content: "teste",
    }),
    /exige confirmação explícita/,
  );
});

test("informa status e versão instalada", async () => {
  const status = await getDesktopCommanderStatus();

  assert.equal(status.installed, true);
  assert.equal(status.connected, true);
  assert.match(status.version, /^0\.2\./);
});
