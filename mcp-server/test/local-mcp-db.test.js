import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getDbExtraTools, handleDbTool } from "../db/mcp-db-tools.js";
import { generateLocalMcpToken, validateLocalMcpToken, isLocalMcpEnabled } from "../auth/local-token.js";

describe("mcp-db-tools", () => {
  it("lista tools de banco quando MESTRE_LOCAL_MCP_TOKEN está vazio", () => {
    const tools = getDbExtraTools();
    assert.equal(tools.length, 0, "sem token não deve expor tools de banco");
  });

  it("gera e valida token local", () => {
    const token = generateLocalMcpToken();
    assert.equal(typeof token, "string");
    assert.ok(token.length > 0);

    // Simula validação sem variável de ambiente configurada.
    const original = process.env.MESTRE_LOCAL_MCP_TOKEN;
    process.env.MESTRE_LOCAL_MCP_TOKEN = token;
    try {
      assert.equal(validateLocalMcpToken(token).valid, true);
      assert.equal(validateLocalMcpToken(token + "x").valid, false);
      assert.equal(isLocalMcpEnabled(), true);
    } finally {
      process.env.MESTRE_LOCAL_MCP_TOKEN = original;
    }
  });

  it("recusa tool de banco sem token configurado", async () => {
    const original = process.env.MESTRE_LOCAL_MCP_TOKEN;
    process.env.MESTRE_LOCAL_MCP_TOKEN = "";
    try {
      const result = await handleDbTool("mcp_local_db_status", { local_mcp_token: "" });
      assert.equal(result.isError, true);
      assert.ok(result.content[0].text.includes("desabilitado"));
    } finally {
      process.env.MESTRE_LOCAL_MCP_TOKEN = original;
    }
  });

  it("recusa consulta de escrita", async () => {
    const token = generateLocalMcpToken();
    const original = process.env.MESTRE_LOCAL_MCP_TOKEN;
    process.env.MESTRE_LOCAL_MCP_TOKEN = token;
    try {
      const result = await handleDbTool("mcp_local_db_query", {
        local_mcp_token: token,
        sql: "DELETE FROM mcp_local_memories",
      });
      assert.equal(result.isError, true);
      assert.ok(result.content[0].text.includes("leitura"));
    } finally {
      process.env.MESTRE_LOCAL_MCP_TOKEN = original;
    }
  });
});
