// Teste de conexao: node v10/scripts/test-supabase.js
import { supabase, SUPABASE_SCHEMA } from "../supabase-client.js";
if (!supabase) { console.error("SUPABASE_URL/KEY ausentes"); process.exit(1); }
const { error, status } = await supabase.from("_ping_inexistente").select("*").limit(1);
console.log("schema:", SUPABASE_SCHEMA, "| http:", status, "| code:", error?.code, "|", error?.message);
if (error?.code === "PGRST106") console.log("=> Schema ainda NAO exposto na Data API.");
else if (error?.code === "PGRST205" || error?.code === "42P01") console.log("=> Conectou e o schema esta exposto (so nao ha tabelas ainda).");
