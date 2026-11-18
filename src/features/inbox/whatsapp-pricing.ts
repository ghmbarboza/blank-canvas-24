// Custo estimado do WhatsApp oficial (Meta Cloud API) em reais, por categoria de modelo.
// A Meta cobra por mensagem entregue desde 01/07/2025. Padrões = tabela da Meta EM REAIS para o
// Brasil (+55), vigente desde 01/10/2026 (consultada em 21/10/2026): marketing R$ 0,3217;
// utilidade, autenticação e atendimento R$ 0,035 por mensagem (equivalem a US$ 0,0625 e US$ 0,0068).
// Desde 01/10/2026 cada número tem 1.000 mensagens de atendimento grátis por mês. Volume alto tem
// faixas com desconto (utilidade acima de 250 mil/mês); a conta ajusta pela própria fatura.

export type WaCategory = "marketing" | "utility" | "authentication" | "service";

export interface WhatsAppPricing {
  /** Reais por mensagem entregue. */
  marketing: number;
  utility: number;
  authentication: number;
  /** Atendimento depois das mensagens grátis do mês. */
  service: number;
  /** Mensagens de atendimento grátis por número por mês. */
  service_free_monthly: number;
  /** Quando os valores foram conferidos (texto livre, ex.: "21/10/2026"). */
  reviewed_at?: string | null;
}

/** Tabela da Meta em reais para o Brasil (vigente desde 01/10/2026). */
export const META_BRL_RATES = { marketing: 0.3217, utility: 0.035, authentication: 0.035 };
export const PRICING_SOURCE_DATE = "21/10/2026";

export const DEFAULT_WA_PRICING: WhatsAppPricing = {
  marketing: META_BRL_RATES.marketing,
  utility: META_BRL_RATES.utility,
  authentication: META_BRL_RATES.authentication,
  service: META_BRL_RATES.utility,
  service_free_monthly: 1000,
  reviewed_at: null,
};

const MAX_PRICE = 10;

function price(v: unknown, fallback: number): number {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : v;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= MAX_PRICE ? n : fallback;
}

/** Lê settings.whatsapp_pricing da conta, com os padrões no que faltar ou vier quebrado. */
export function normalizePricing(raw: unknown): WhatsAppPricing {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const free = Number(r["service_free_monthly"]);
  return {
    marketing: price(r["marketing"], DEFAULT_WA_PRICING.marketing),
    utility: price(r["utility"], DEFAULT_WA_PRICING.utility),
    authentication: price(r["authentication"], DEFAULT_WA_PRICING.authentication),
    service: price(r["service"], DEFAULT_WA_PRICING.service),
    service_free_monthly:
      Number.isInteger(free) && free >= 0 ? free : DEFAULT_WA_PRICING.service_free_monthly,
    reviewed_at: typeof r["reviewed_at"] === "string" ? r["reviewed_at"] : null,
  };
}

/** Categoria do modelo como a Meta devolve (MARKETING, UTILITY, AUTHENTICATION) ou a do passo. */
export function toCategory(v: string | null | undefined): WaCategory {
  const c = (v ?? "").trim().toLowerCase();
  if (c === "marketing") return "marketing";
  if (c === "utility") return "utility";
  if (c === "authentication") return "authentication";
  return "service";
}

/**
 * Preço de UMA mensagem. Texto livre dentro da janela é atendimento (grátis até a cota do mês,
 * que não dá para garantir por envio: por isso a estimativa conta como grátis e avisa).
 */
export function unitPrice(
  pricing: WhatsAppPricing,
  category: WaCategory,
  opts: { template: boolean },
): number {
  if (!opts.template || category === "service") return 0;
  return pricing[category];
}

/** Custo total de um envio: destinatários × preço. */
export function estimateCost(
  pricing: WhatsAppPricing,
  category: WaCategory,
  recipients: number,
  opts: { template: boolean } = { template: true },
): number {
  const n = Number.isFinite(recipients) ? Math.max(0, Math.floor(recipients)) : 0;
  return Math.round(n * unitPrice(pricing, category, opts) * 100) / 100;
}

interface FlowNodeLike {
  type: string;
  config?: Record<string, unknown> | null;
}

/** Custo por contato que percorre o fluxo inteiro (soma dos passos de WhatsApp com modelo). */
export function flowCostPerContact(pricing: WhatsAppPricing, nodes: FlowNodeLike[]): number {
  const total = nodes
    .filter((n) => n.type === "whatsapp")
    .reduce((sum, n) => {
      const c = n.config ?? {};
      const template = typeof c["template_name"] === "string" && c["template_name"].trim() !== "";
      return sum + unitPrice(pricing, toCategory(c["category"] as string), { template });
    }, 0);
  return Math.round(total * 10_000) / 10_000;
}

const fmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const fmtUnit = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

export function formatBRL(v: number): string {
  return fmt.format(v);
}
/** Preço unitário com até 4 casas (R$ 0,0367). */
export function formatUnitBRL(v: number): string {
  return fmtUnit.format(v);
}
