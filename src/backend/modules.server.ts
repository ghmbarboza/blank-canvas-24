// Recursos extras (Ajustes › Recursos extras) valem no servidor, não só no menu (revisão de
// segurança de 04/11, S3). Rota de um módulo desligado responde 403 module_off; trabalho na fila
// de um módulo desligado termina como pulado, sem efeito.
import { EXTRA_MODULES, type ModuleId } from "@/components/layout/modules";
import { HttpError, admin, type Caller } from "@/backend/http.server";

import { isModuleOn, moduleOffMessage } from "./modules-logic";

export { isModuleOn, jobModule, moduleOffMessage } from "./modules-logic";

const TTL_MS = 30_000;
const cache = new Map<string, { settings: unknown; at: number }>();

async function accountSettings(accountId: string): Promise<unknown> {
  const hit = cache.get(accountId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.settings;
  const { data, error } = await admin()
    .from("accounts")
    .select("settings")
    .eq("id", accountId)
    .maybeSingle();
  if (error) throw new HttpError(503, "Tente de novo em instantes", "settings_unavailable");
  cache.set(accountId, { settings: data?.settings ?? null, at: Date.now() });
  return data?.settings ?? null;
}

export async function moduleEnabled(accountId: string, id: ModuleId): Promise<boolean> {
  return isModuleOn(await accountSettings(accountId), id);
}

/** 403 com mensagem clara quando o recurso extra está desligado na conta. */
export async function requireModule(caller: Pick<Caller, "accountId">, id: ModuleId) {
  if (await moduleEnabled(caller.accountId, id)) return;
  const label = EXTRA_MODULES.find((m) => m.id === id)?.label ?? id;
  throw new HttpError(403, moduleOffMessage(label), "module_off");
}

/** Para testes: esquece o que foi lido. */
export function clearModuleCache() {
  cache.clear();
}
