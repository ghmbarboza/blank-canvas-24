// Importar o que a empresa vende a partir do site: o que a leitura devolve (prévia) e o que a
// pessoa confirma. Puro: servidor, tela e testes usam os mesmos tipos e o mesmo schema.
import { z } from "zod";

export const MAX_ITEMS = 200;

export const SOURCES = [
  "shopify",
  "woocommerce",
  "vtex",
  "dados_da_pagina",
  "paginas_de_produto",
  "leitura_por_ia",
  "vazio",
] as const;
export type SiteSource = (typeof SOURCES)[number];

export const SOURCE_LABEL: Record<SiteSource, string> = {
  shopify: "lista de produtos da loja (Shopify)",
  woocommerce: "lista de produtos da loja (WooCommerce)",
  vtex: "lista de produtos da loja (VTEX)",
  dados_da_pagina: "dados de produto publicados na página",
  paginas_de_produto: "páginas de produto do site",
  leitura_por_ia: "leitura das páginas do site",
  vazio: "nada encontrado",
};

const text = (max: number) =>
  z
    .string()
    .transform((s) => s.replace(/\s+/g, " ").trim().slice(0, max) || null)
    .nullable()
    .catch(null);

export const siteItemSchema = z.object({
  name: z
    .string()
    .transform((s) => s.replace(/\s+/g, " ").trim().slice(0, 120))
    .refine((s) => s.length >= 2, "nome curto demais"),
  description: text(400),
  price: z.number().finite().min(0).max(9_999_999).nullable().catch(null),
  category: text(60),
  url: text(500),
  image: text(500),
  kind: z.enum(["product", "service"]).catch("product"),
});
export type SiteItem = z.infer<typeof siteItemSchema>;

export const POLICY_KEYS = ["troca", "entrega", "garantia", "horario", "contato"] as const;
export type PolicyKey = (typeof POLICY_KEYS)[number];

export const POLICY_LABEL: Record<PolicyKey, string> = {
  troca: "Troca e devolução",
  entrega: "Entrega",
  garantia: "Garantia",
  horario: "Horário de atendimento",
  contato: "Contato",
};

export const siteCompanySchema = z.object({
  name: text(120),
  sells: text(400),
  tone: text(200),
  policies: z
    .object({
      troca: text(600),
      entrega: text(600),
      garantia: text(600),
      horario: text(300),
      contato: text(300),
    })
    .catch({ troca: null, entrega: null, garantia: null, horario: null, contato: null }),
});
export type SiteCompany = z.infer<typeof siteCompanySchema>;

export const EMPTY_COMPANY: SiteCompany = {
  name: null,
  sells: null,
  tone: null,
  policies: { troca: null, entrega: null, garantia: null, horario: null, contato: null },
};

export interface SitePreview {
  /** endereço final lido (depois dos redirecionamentos) */
  url: string;
  source: SiteSource;
  items: SiteItem[];
  company: SiteCompany;
  /** quantas páginas foram lidas */
  pages: number;
  /** avisos em linguagem simples (limite atingido, site sem texto, leitura parcial) */
  notes: string[];
  /** veio pouco ou nada: o site monta tudo no navegador ou bloqueia a leitura */
  thin: boolean;
}

/** O que a tela manda para gravar: os itens marcados e o que aproveitar da empresa. */
export const confirmSchema = z.object({
  url: z.string().min(4).max(500),
  items: z.array(siteItemSchema).max(MAX_ITEMS),
  company: siteCompanySchema.optional(),
  /** gravar o resumo e as políticas na base de conhecimento */
  saveKnowledge: z.boolean().default(true),
  /** preencher o passo "Sua empresa" com o que veio do site (só campos ainda vazios) */
  fillCompany: z.boolean().default(false),
});
export type ConfirmInput = z.infer<typeof confirmSchema>;

export interface ConfirmResult {
  created: number;
  updated: number;
  knowledge: boolean;
  company: string[];
}
