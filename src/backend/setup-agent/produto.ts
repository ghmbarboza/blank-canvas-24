// Produto ou serviço que a Nexa cadastra no catálogo quando aprende um preço.
// O catálogo é a única fonte de preço do agente: a trava barra qualquer valor que não esteja nele.

export interface ProdutoInput {
  name: string;
  price: number;
  kind: "product" | "service";
  billing: "one_time" | "monthly" | "yearly";
  description: string | null;
}

const BILLING: Record<string, ProdutoInput["billing"]> = {
  unico: "one_time",
  avulso: "one_time",
  mensal: "monthly",
  anual: "yearly",
};

const MAX_PRICE = 10_000_000;

/** "R$ 1.234,56", "250", 180 → número em reais; null se não for um preço válido. */
export function parsePreco(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 && v < MAX_PRICE ? v : null;
  if (typeof v !== "string") return null;
  const t = v.replace(/R\$|\s/g, "");
  if (!/^\d[\d.,]*$/.test(t)) return null;
  // vírgula é o decimal em pt-BR; ponto sozinho com 1–2 casas no fim também é decimal
  const normal = t.includes(",")
    ? t.replace(/\./g, "").replace(",", ".")
    : /\.\d{1,2}$/.test(t)
      ? t
      : t.replace(/\./g, "");
  const n = Number(normal);
  return Number.isFinite(n) && n >= 0 && n < MAX_PRICE ? Math.round(n * 100) / 100 : null;
}

/** Valida os argumentos da ferramenta cadastrar_produto. Lança erro com mensagem curta. */
export function parseProduto(a: Record<string, unknown>): ProdutoInput {
  const name = typeof a["nome"] === "string" ? a["nome"].trim().slice(0, 120) : "";
  if (name.length < 2) throw new Error("faltou o nome do produto ou serviço");
  const price = parsePreco(a["preco"]);
  if (price === null) throw new Error("preço inválido: use só o número em reais, ex.: 250");
  const kind = a["tipo"] === "produto" ? "product" : "service";
  const billing = BILLING[String(a["cobranca"] ?? "unico")] ?? "one_time";
  const desc = typeof a["descricao"] === "string" ? a["descricao"].trim().slice(0, 1000) : "";
  return { name, price, kind, billing, description: desc || null };
}
