// O remix do Lovable copia tabelas, funções e policies, mas NÃO os REVOKE/GRANT (provado no remix
// descartável 31dd981d em 02/11: secret_get executável por anon). garantir_privilegios() traz no
// CORPO o retrato dos privilégios do original e o reaplica. Roda uma vez por isolate, no primeiro
// pedido ao servidor, antes de qualquer outra coisa (o cliente só chega ao banco depois de abrir
// o app). Também roda dentro de claim_first_account e garantir_plataforma.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

let done: Promise<void> | null = null;
const TIMEOUT_MS = 4_000;

async function run(): Promise<void> {
  const call = supabaseAdmin.rpc("garantir_privilegios" as never).then(({ error }) => {
    if (error) throw error;
  });
  const timeout = new Promise<void>((_, reject) =>
    setTimeout(() => reject(new Error("garantir_privilegios: tempo esgotado")), TIMEOUT_MS),
  );
  await Promise.race([call, timeout]);
}

/** Uma vez por isolate; falha não derruba o pedido, mas tenta de novo no próximo. */
export async function ensurePrivileges(): Promise<void> {
  if (!done) {
    done = run().catch((err: unknown) => {
      console.error("[privilegios]", err);
      done = null;
    });
  }
  await done;
}
