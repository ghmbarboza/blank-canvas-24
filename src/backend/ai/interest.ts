// Interesse do lead no catálogo (parte pura, testada no vitest). A IA aponta itens pelo NÚMERO
// da lista, nunca por id inventado; aqui o número vira o produto real. Fora da lista, confiança
// inválida ou repetido é descartado.
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

const BILLING_LABEL: Record<string, string> = {
  one_time: "avulso",
  monthly: "por mês",
  yearly: "por ano",
};

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

export function normalizeScore(
  score: unknown,
  temperature: unknown,
): { score: number; temperature: "hot" | "warm" | "cold" } {
  const s = Math.max(0, Math.min(100, Math.round(Number(score) || 0)));
  const t =
    temperature === "hot" || temperature === "warm" || temperature === "cold"
      ? temperature
      : s >= 70
        ? "hot"
        : s >= 35
          ? "warm"
          : "cold";
  return { score: s, temperature: t };
}
