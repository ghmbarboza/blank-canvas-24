// O remix do Lovable copia tabelas, funções e policies, mas NÃO os REVOKE/GRANT (provado no remix
// descartável 31dd981d em 02/11: secret_get executável por anon). garantir_privilegios() traz no
// CORPO o retrato dos privilégios do original e o reaplica. Roda uma vez por isolate, no primeiro
// pedido ao servidor, antes de qualquer outra coisa (o cliente só chega ao banco depois de abrir
// o app). Também roda dentro de claim_first_account e garantir_plataforma.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Só um SIM/NÃO fica guardado entre pedidos, nunca a promessa: no runtime do Lovable (workerd) um
// pedido não pode esperar a promessa de rede criada por outro. Se o primeiro pedido termina antes,
// o segundo morre com "This promise was created by a request that has since ended" e o app abre
// na tela de erro (visto na prévia logo depois de um remix, quando vários pedidos chegam juntos
// num isolate frio). A função do banco é idempotente: rodar duas vezes em paralelo não faz mal.
let done = false;
// Um pedido por vez executa a rotina; os outros NÃO esperam e NÃO repetem. Sem isso, enquanto a
// primeira execução não terminava (ou falhava), cada pedido disparava a rotina de novo: dezenas de
// GRANT/REVOKE em paralelo travavam uns aos outros no banco e todo pedido levava 5 s ou ficava
// pendurado (visto em 18/11 no original e numa cópia). Depois de uma falha, só tenta de novo
// passado um minuto.
let running = false;
let nextTryAt = 0;
const RETRY_AFTER_MS = 60_000;
const TIMEOUT_MS = 4_000;

async function run(): Promise<void> {
  const call = supabaseAdmin.rpc("garantir_privilegios" as never).then(({ error }) => {
    if (error) throw error;
  });
  const timeout = new Promise<void>((_, reject) =>
    setTimeout(() => reject(new Error("garantir_privilegios: tempo esgotado")), TIMEOUT_MS),
  );
  await Promise.race([call, timeout]);
  // O remix também não copia a lista de tabelas "ao vivo": sem ela a Caixa de entrada não atualiza
  // sozinha. Falha aqui não impede o resto (função ainda não existe em banco antigo).
  const { error } = await supabaseAdmin.rpc("garantir_realtime" as never);
  if (error) console.error("[realtime]", error.message);
}

/** Uma vez por isolate; nunca segura os outros pedidos e nunca repete em rajada. */
export async function ensurePrivileges(): Promise<void> {
  if (done || running || Date.now() < nextTryAt) return;
  running = true;
  try {
    await run();
    done = true;
  } catch (err: unknown) {
    nextTryAt = Date.now() + RETRY_AFTER_MS;
    console.error("[privilegios]", err);
  } finally {
    running = false;
  }
}

/** Só para teste. */
export function resetPrivilegesForTest(): void {
  done = false;
  running = false;
  nextTryAt = 0;
}
