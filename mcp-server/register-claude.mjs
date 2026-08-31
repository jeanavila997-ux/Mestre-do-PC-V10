// Registra o MCP do Mestre do PC no Claude Code (~/.claude.json) sem corromper o arquivo.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const claudePath = path.join(os.homedir(), ".claude.json");
const MCP_ENTRY = {
  command: "node",
  args: ["C:\\Mestre-do-PC-V10-main\\mcp-server\\index.js"],
  env: {
    MESTRE_PROJETO_PATH: "C:\\Mestre-do-PC-V10-main",
    MESTRE_BASE_URL: "http://127.0.0.1:7777",
  },
};

const raw = fs.readFileSync(claudePath, "utf8");
const config = JSON.parse(raw);

config.mcpServers = config.mcpServers || {};
config.mcpServers["mestre_do_pc"] = MCP_ENTRY;

// Backup antes de gravar
fs.writeFileSync(claudePath + ".bak-mcp", raw, "utf8");
fs.writeFileSync(claudePath, JSON.stringify(config, null, 2), "utf8");

console.log("OK: mcpServers.mestre_do_pc registrado em " + claudePath);
console.log("Backup: " + claudePath + ".bak-mcp");