// Importação do site ligada ao mundo real: busca com a proteção de endereço interno, IA do gateway
// e gravação no catálogo, na base de conhecimento e no passo "Sua empresa". Só servidor.
import { admin, type Caller } from "@/backend/http.server";

import { dedupeItems, nameKey } from "./extract";
import { previewSite, type AiExtract } from "./preview";
import {
  POLICY_KEYS,
  POLICY_LABEL,
  SOURCE_LABEL,
  type ConfirmInput,
  type ConfirmResult,
  type SiteCompany,
  type SiteItem,
  type SitePreview,
} from "./types";

const SITE_MAX_BYTES = 8_000_000;

function aiFor(accountId: string): AiExtract {
  return async ({ system, text, schema }) => {
    const { callJson } = await import("@/backend/llm-simple.server");
    const r = await callJson<unknown>({
      accountId,
      purpose: "site_import",
      system,
      messages: [{ role: "user", content: text }],
      schemaName: "catalogo_do_site",
      schema,
      maxTokens: 6000,
      tier: "fast",
    });
    return r.data;
  };
}

/** Lê o site e devolve a prévia (nada é gravado). */
export async function runPreview(accountId: string, url: string): Promise<SitePreview> {
  const { fetchRaw } = await import("../web.server");
  // página de loja passa fácil de 2 MB: aqui o teto é maior (o texto é cortado depois)
  return previewSite(url, {
    fetch: (u, opts) => fetchRaw(u, { ...opts, maxBytes: SITE_MAX_BYTES }),
    ai: aiFor(accountId),
  });
}

/** Texto do documento "o que a empresa vende", para o atendente consultar. */
export function knowledgeText(
  url: string,
  company: SiteCompany,
  items: readonly SiteItem[],
): string {
  const lines: string[] = [];
  if (company.name) lines.push(`Empresa: ${company.name}`);
  if (company.sells) lines.push(`O que vende: ${company.sells}`);
  lines.push(`Site: ${url}`);
  for (const k of POLICY_KEYS)
    if (company.policies[k]) lines.push(`\n${POLICY_LABEL[k]}: ${company.policies[k]}`);
  if (items.length) {
    lines.push("\nO que a empresa vende (lista lida do site):");
    for (const it of items.slice(0, 120)) {
      const price =
        it.price !== null
          ? ` (${it.price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/\s/g, " ")})`
          : "";
      const cat = it.category ? ` [${it.category}]` : "";
      lines.push(
        `• ${it.name}${cat}${price}${it.description ? `: ${it.description.slice(0, 200)}` : ""}`,
      );
    }
  }
  return lines.join("\n");
}

async function saveProducts(accountId: string, items: readonly SiteItem[]) {
  const db = admin();
  const { data: existing, error } = await db
    .from("products")
    .select("id, name")
    .eq("account_id", accountId)
    .limit(2000);
  if (error) throw new Error(`catálogo: ${error.message}`);
  const byKey = new Map((existing ?? []).map((p) => [nameKey(p.name), p.id]));
  const now = new Date().toISOString();
  const inserts = [];
  let updated = 0;
  for (const it of items) {
    const id = byKey.get(nameKey(it.name));
    if (id) {
      // reimportar atualiza: o preço só muda quando o site mostra um
      const patch = {
        ...(it.price !== null ? { price: it.price } : {}),
        ...(it.description ? { description: it.description } : {}),
        ...(it.category ? { category: it.category } : {}),
        active: true,
        updated_at: now,
      };
      const { error: e } = await db
        .from("products")
        .update(patch)
        .eq("id", id)
        .eq("account_id", accountId);
      if (e) throw new Error(`catálogo: ${e.message}`);
      updated++;
    } else {
      inserts.push({
        account_id: accountId,
        name: it.name,
        description: it.description,
        kind: it.kind,
        category: it.category,
        // sem preço no site: entra com 0, que o atendente lê como "preço sob consulta"
        price: it.price ?? 0,
        billing: "one_time",
        active: true,
      });
    }
  }
  for (let i = 0; i < inserts.length; i += 100) {
    const { error: e } = await db.from("products").insert(inserts.slice(i, i + 100));
    if (e) throw new Error(`catálogo: ${e.message}`);
  }
  return { created: inserts.length, updated };
}

async function saveKnowledge(caller: Caller, url: string, text: string, name: string | null) {
  const db = admin();
  const docs = await import("../docs.server");
  const ref = `site-resumo:${new URL(url).hostname.replace(/^www\./, "")}`;
  const title = `O que ${name ?? "a empresa"} vende (lido do site)`.slice(0, 200);
  const { data: old } = await db
    .from("kb_documents")
    .select("id")
    .eq("account_id", caller.accountId)
    .eq("source_ref", ref)
    .limit(1)
    .maybeSingle();
  const id =
    old?.id ??
    (await docs.createDocument({
      accountId: caller.accountId,
      userId: caller.userId,
      name: title,
      source: "site",
      sourceRef: ref,
      mime: "text/markdown",
    }));
  try {
    await docs.indexDocument(caller.accountId, id, title, text, "Site");
    return true;
  } catch (err) {
    await docs.failDocument(id, err instanceof Error ? err.message : String(err));
    return false;
  }
}

/** Grava o que a pessoa confirmou na prévia. Reimportar atualiza pelo nome, sem duplicar. */
export async function confirmImport(caller: Caller, input: ConfirmInput): Promise<ConfirmResult> {
  const items = dedupeItems(input.items);
  const company = input.company;
  const { created, updated } = items.length
    ? await saveProducts(caller.accountId, items)
    : { created: 0, updated: 0 };
  let knowledge = false;
  if (input.saveKnowledge && company) {
    const text = knowledgeText(input.url, company, items);
    if (text.length > 60) knowledge = await saveKnowledge(caller, input.url, text, company.name);
  }
  let filled: string[] = [];
  if (input.fillCompany && company) {
    const { fillCompanyFromSite } = await import("../company.server");
    filled = await fillCompanyFromSite(caller, company);
  }
  return { created, updated, knowledge, company: filled };
}

/** Resumo da prévia para a IA (os itens ficam na tela; aqui vão só os números e a amostra). */
export function previewSummary(p: SitePreview): string {
  const withPrice = p.items.filter((i) => i.price !== null).length;
  const sample = p.items
    .slice(0, 8)
    .map((i) => i.name)
    .join("; ");
  return [
    `Site lido: ${p.url} (${p.pages} página(s), fonte: ${SOURCE_LABEL[p.source]}).`,
    `Itens encontrados: ${p.items.length}${p.items.length ? ` (${withPrice} com preço). Amostra: ${sample}` : ""}.`,
    p.company.name ? `Nome no site: ${p.company.name}.` : "",
    p.company.sells ? `O que vende: ${p.company.sells}` : "",
    p.company.tone ? `Tom percebido: ${p.company.tone}.` : "",
    ...POLICY_KEYS.filter((k) => p.company.policies[k]).map(
      (k) => `${POLICY_LABEL[k]}: ${p.company.policies[k]}`,
    ),
    ...p.notes.map((n) => `Aviso: ${n}`),
    p.items.length
      ? "A prévia está NA TELA, com caixas para a pessoa desmarcar e o botão de confirmar. Nada foi gravado ainda. Não liste os itens no texto: diga quantos achou e peça para ela conferir e confirmar."
      : "Nada foi gravado.",
  ]
    .filter(Boolean)
    .join("\n");
}
