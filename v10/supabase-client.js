// Cliente Supabase do Mestre-do-PC-V10.
// Le SUPABASE_* do ambiente; se faltar, le ../.env.local (o launcher nao usa dotenv).
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const envFile = join(here, "..", ".env.local");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*(SUPABASE_[A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY;
export const SUPABASE_SCHEMA = process.env.SUPABASE_SCHEMA || "mestre_do_pc_v10";

export const supabase = url && key
  ? createClient(url, key, { db: { schema: SUPABASE_SCHEMA }, auth: { persistSession: false } })
  : null;
