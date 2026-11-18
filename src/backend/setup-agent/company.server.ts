// O perfil da empresa que o atendente consulta. Nome, o que vende, horário e contato ficam também
// num documento da base de conhecimento ("Sobre a empresa"), e o tom de voz vai para o atendente:
// sem isso, o que o dono conta na configuração não chegaria à conversa com o cliente.
import { admin, type Caller } from "@/backend/http.server";

import { PLACEHOLDER_COMPANY } from "./roteiro";
import type { SiteCompany } from "./site-import/types";

/** Marca do documento do perfil: não conta como "base de conhecimento" no passo a passo. */
export const PROFILE_REF = "perfil-da-empresa";
const PROFILE_FACTS: Record<string, string> = {
  o_que_vende: "O que vende",
  horario_atendimento: "Horário de atendimento",
  contato: "Contato",
  endereco: "Endereço",
  politica_troca: "Troca e devolução",
  politica_entrega: "Entrega",
  garantia: "Garantia",
};

/** Fatos que entram no perfil (mudou um deles, o documento é regravado). */
export const PROFILE_KEYS: readonly string[] = [...Object.keys(PROFILE_FACTS), "tom_de_voz"];

async function facts(accountId: string) {
  const { data } = await admin()
    .from("setup_facts")
    .select("key, value")
    .eq("account_id", accountId);
  return new Map((data ?? []).map((f) => [f.key, f.value]));
}

/** Regrava o documento "Sobre a empresa" e leva o tom de voz para o atendente. Nunca derruba quem chamou. */
export async function syncCompanyProfile(caller: Caller): Promise<void> {
  try {
    const db = admin();
    const [acc, known] = await Promise.all([
      db.from("accounts").select("name").eq("id", caller.accountId).single(),
      facts(caller.accountId),
    ]);
    const name = acc.data?.name && acc.data.name !== PLACEHOLDER_COMPANY ? acc.data.name : "";
    const lines = [
      name ? `Empresa: ${name}` : "",
      ...Object.entries(PROFILE_FACTS).map(([key, label]) =>
        known.get(key) ? `${label}: ${known.get(key)}` : "",
      ),
    ].filter(Boolean);
    const tone = known.get("tom_de_voz");
    if (tone)
      await db
        .from("ai_agents")
        .update({ tone: tone.slice(0, 300) })
        .eq("account_id", caller.accountId)
        .eq("role", "post_sale");
    const text = lines.join("\n");
    if (text.length < 40) return;
    const docs = await import("./docs.server");
    const { data: old } = await db
      .from("kb_documents")
      .select("id")
      .eq("account_id", caller.accountId)
      .eq("source_ref", PROFILE_REF)
      .limit(1)
      .maybeSingle();
    const id =
      old?.id ??
      (await docs.createDocument({
        accountId: caller.accountId,
        userId: caller.userId,
        name: "Sobre a empresa",
        source: "texto",
        sourceRef: PROFILE_REF,
        mime: "text/markdown",
      }));
    await docs.indexDocument(caller.accountId, id, "Sobre a empresa", text, "Empresa");
  } catch (err) {
    console.error(
      "[setup] perfil da empresa não sincronizou",
      err instanceof Error ? err.message : err,
    );
  }
}

/** Preenche o passo "Sua empresa" com o que veio do site, só onde ainda está vazio. */
export async function fillCompanyFromSite(caller: Caller, company: SiteCompany): Promise<string[]> {
  const db = admin();
  const [acc, known] = await Promise.all([
    db.from("accounts").select("name").eq("id", caller.accountId).single(),
    facts(caller.accountId),
  ]);
  const unnamed = !acc.data?.name?.trim() || acc.data.name === PLACEHOLDER_COMPANY;
  const { saveCompany } = await import("./tools.server");
  const patch = {
    ...(unnamed && company.name ? { name: company.name } : {}),
    ...(company.sells && !known.get("o_que_vende") ? { sells: company.sells } : {}),
    ...(company.tone && !known.get("tom_de_voz") ? { tone: company.tone } : {}),
    ...(company.policies.horario && !known.get("horario_atendimento")
      ? { hours: company.policies.horario }
      : {}),
  };
  if (!Object.keys(patch).length) return [];
  return saveCompany(caller, { ...patch, source: "site" });
}
