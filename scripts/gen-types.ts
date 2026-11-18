// Regera o bloco `public` de src/integrations/supabase/types.ts a partir do banco.
// Uso: SUPABASE_SERVICE_ROLE_KEY=... bun scripts/gen-types.ts   (token em .types-token ou NEXUS_TYPES_TOKEN)
// dev_schema_types só aceita service_role (revisão de segurança de 04/11, S9): a chave pública não chama.
import { readFileSync, writeFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [
        l.slice(0, i).trim(),
        l
          .slice(i + 1)
          .trim()
          .replace(/^"|"$/g, ""),
      ];
    }),
);
const token = process.env["NEXUS_TYPES_TOKEN"] ?? readFileSync(".types-token", "utf8").trim();
const url = env["VITE_SUPABASE_URL"];
const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
if (!key)
  throw new Error("Defina SUPABASE_SERVICE_ROLE_KEY (só service_role chama dev_schema_types)");

const res = await fetch(`${url}/rest/v1/rpc/dev_schema_types`, {
  method: "POST",
  headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" },
  body: JSON.stringify({ _token: token }),
});
if (!res.ok) throw new Error(`dev_schema_types: ${res.status} ${await res.text()}`);
const block = (await res.json()) as string;

const path = "src/integrations/supabase/types.ts";
const src = readFileSync(path, "utf8");
const start = src.indexOf("  public: {\n    Tables: {");
const end = src.indexOf("\ntype DatabaseWithoutInternals");
if (start < 0 || end < 0) throw new Error("marcadores do types.ts não encontrados");
const out = src.slice(0, start) + block + "\n}\n" + src.slice(end);
writeFileSync(path, out);
console.log(`types.ts regenerado (${block.length} caracteres)`);
