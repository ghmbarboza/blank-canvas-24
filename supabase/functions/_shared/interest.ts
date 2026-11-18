// Interesse do lead no catálogo: a IA aponta itens por NÚMERO da lista (nunca por id inventado) e aqui
// o número vira o produto real. Item fora da lista, confiança inválida ou repetido é descartado.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";

export interface CatalogItem {
  ref: number;
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  price: number;
  billing: string;
  keywords: string[];
}

export interface RawInterest {
  item: unknown;
  confidence: unknown;
  evidence?: unknown;
}

export interface Interest {
  product_id: string;
  confidence: number;
  evidence: string | null;
}

const MAX_CATALOG = 80;

export async function loadCatalog(db: SupabaseClient, accountId: string): Promise<CatalogItem[]> {
  const { data } = await db
    .from("products")
    .select("id, name, description, category, price, billing, keywords")
    .eq("account_id", accountId)
    .eq("active", true)
    .order("position")
    .order("name")
    .limit(MAX_CATALOG);
  return (data ?? []).map((p, i) => ({
    ...p,
    ref: i + 1,
    price: Number(p.price) || 0,
    keywords: p.keywords ?? [],
  }));
}

const BILLING_LABEL: Record<string, string> = {
  one_time: "avulso",
  monthly: "por mês",
  yearly: "por ano",
};

// Catálogo em texto compacto para o prompt.
export function catalogPrompt(catalog: CatalogItem[]): string {
  return catalog
    .map((p) => {
      const extra = [
        p.category,
        p.keywords.length ? `termos: ${p.keywords.join(", ")}` : null,
        p.description,
      ]
        .filter(Boolean)
        .join(" · ");
      return `${p.ref}. ${p.name} — R$ ${p.price.toFixed(2)} ${BILLING_LABEL[p.billing] ?? ""}${extra ? ` (${extra.slice(0, 220)})` : ""}`;
    })
    .join("\n");
}

export function mapInterests(raw: unknown, catalog: CatalogItem[]): Interest[] {
  if (!Array.isArray(raw)) return [];
  const byRef = new Map(catalog.map((p) => [p.ref, p]));
  const seen = new Set<string>();
  const out: Interest[] = [];
  for (const r of raw as RawInterest[]) {
    const ref = typeof r?.item === "number" ? r.item : Number.parseInt(String(r?.item ?? ""), 10);
    const product = byRef.get(ref);
    if (!product || seen.has(product.id)) continue;
    const conf = Math.round(Number(r.confidence));
    if (!Number.isFinite(conf)) continue;
    seen.add(product.id);
    out.push({
      product_id: product.id,
      confidence: Math.max(0, Math.min(100, conf)),
      evidence:
        typeof r.evidence === "string" && r.evidence.trim()
          ? r.evidence.trim().slice(0, 400)
          : null,
    });
  }
  return out;
}

// Grava o que a IA viu sem atropelar o que o vendedor marcou à mão.
export async function saveInterests(
  db: SupabaseClient,
  accountId: string,
  contactId: string,
  interests: Interest[],
): Promise<number> {
  if (!interests.length) return 0;
  const { data: manual } = await db
    .from("contact_interests")
    .select("product_id")
    .eq("contact_id", contactId)
    .eq("source", "manual");
  const keep = new Set((manual ?? []).map((m) => m.product_id));
  const rows = interests
    .filter((i) => !keep.has(i.product_id))
    .map((i) => ({ account_id: accountId, contact_id: contactId, source: "ai", ...i }));
  if (!rows.length) return interests.length;
  const { error } = await db
    .from("contact_interests")
    .upsert(rows, { onConflict: "contact_id,product_id" });
  if (error) throw new Error(`interesse: ${error.message}`);
  return interests.length;
}
