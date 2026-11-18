// Importador guiado: reconhece de onde veio a planilha (RD Station CRM, Kommo, Pipedrive, HubSpot ou
// planilha comum), sugere o destino de cada coluna e transforma as linhas em registros normalizados.
import { excelSerialToDate } from "./xlsx";

export type ImportSource = "planilha" | "rdstation" | "kommo" | "pipedrive" | "hubspot";

export const SOURCE_LABEL: Record<ImportSource, string> = {
  planilha: "Planilha (CSV ou Excel)",
  rdstation: "RD Station CRM",
  kommo: "Kommo",
  pipedrive: "Pipedrive",
  hubspot: "HubSpot",
};

export type TargetField =
  | "ignore"
  | "contact.name"
  | "contact.first_name"
  | "contact.last_name"
  | "contact.email"
  | "contact.phone"
  | "contact.phone2"
  | "contact.job_title"
  | "contact.city"
  | "contact.tags"
  | "contact.notes"
  | "contact.external_id"
  | "company.name"
  | "company.cnpj"
  | "company.website"
  | "company.phone"
  | "company.email"
  | "company.industry"
  | "deal.title"
  | "deal.value"
  | "deal.stage"
  | "deal.pipeline"
  | "deal.status"
  | "deal.expected_close_date"
  | "deal.external_id"
  | `custom.contact.${string}`
  | `custom.company.${string}`
  | `custom.deal.${string}`;

export const TARGET_LABEL: Record<string, string> = {
  ignore: "Não importar",
  "contact.name": "Contato: nome completo",
  "contact.first_name": "Contato: primeiro nome",
  "contact.last_name": "Contato: sobrenome",
  "contact.email": "Contato: e-mail",
  "contact.phone": "Contato: telefone",
  "contact.phone2": "Contato: outro telefone",
  "contact.job_title": "Contato: cargo",
  "contact.city": "Contato: cidade",
  "contact.tags": "Contato: etiquetas",
  "contact.notes": "Contato: observações",
  "contact.external_id": "Contato: código no sistema antigo",
  "company.name": "Empresa: nome",
  "company.cnpj": "Empresa: CNPJ",
  "company.website": "Empresa: site",
  "company.phone": "Empresa: telefone",
  "company.email": "Empresa: e-mail",
  "company.industry": "Empresa: setor",
  "deal.title": "Negócio: título",
  "deal.value": "Negócio: valor",
  "deal.stage": "Negócio: etapa",
  "deal.pipeline": "Negócio: funil",
  "deal.status": "Negócio: situação (ganho/perdido)",
  "deal.expected_close_date": "Negócio: previsão de fechamento",
  "deal.external_id": "Negócio: código no sistema antigo",
};

export function targetLabel(t: string, customLabels: Record<string, string> = {}): string {
  if (t.startsWith("custom.")) return customLabels[t] ?? `Campo personalizado: ${t.split(".")[2]}`;
  return TARGET_LABEL[t] ?? t;
}

export function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Sinônimos por destino (já normalizados). Ordem importa: o primeiro destino que casar vence.
const SYNONYMS: [TargetField, string[]][] = [
  [
    "contact.email",
    [
      "email",
      "e mail",
      "email comercial",
      "e mail comercial",
      "email pessoal",
      "person email",
      "person email work",
      "email address",
      "endereco de email",
      "emails",
      "email do contato",
    ],
  ],
  [
    "contact.phone",
    [
      "telefone",
      "celular",
      "whatsapp",
      "phone",
      "mobile",
      "mobile phone",
      "person phone",
      "person phone mobile",
      "telefone comercial",
      "telefone celular",
      "fone",
      "telefones",
      "phone number",
      "telefone do contato",
      "celular do contato",
    ],
  ],
  [
    "contact.phone2",
    ["telefone 2", "telefone residencial", "outro telefone", "person phone home", "phone 2"],
  ],
  ["contact.first_name", ["primeiro nome", "first name", "nome proprio"]],
  ["contact.last_name", ["sobrenome", "last name", "ultimo nome"]],
  [
    "contact.name",
    [
      "nome",
      "nome completo",
      "name",
      "contato",
      "nome do contato",
      "person name",
      "full name",
      "contact name",
      "cliente",
      "contato principal",
      "nome do contato principal",
    ],
  ],
  ["contact.job_title", ["cargo", "job title", "funcao", "person job title", "titulo", "posicao"]],
  ["contact.city", ["cidade", "city", "municipio", "localidade"]],
  [
    "contact.tags",
    ["tags", "etiquetas", "tag", "labels", "marcadores", "deal labels", "person labels"],
  ],
  ["contact.notes", ["observacoes", "observacao", "notas", "notes", "anotacoes", "comentarios"]],
  ["contact.external_id", ["id do contato", "contact id", "person id", "record id", "id"]],
  ["company.cnpj", ["cnpj", "cpf cnpj", "documento", "cnpj da empresa"]],
  [
    "company.name",
    [
      "empresa",
      "company",
      "organizacao",
      "organization",
      "organization name",
      "nome da empresa",
      "company name",
      "razao social",
      "conta",
    ],
  ],
  [
    "company.website",
    [
      "site",
      "website",
      "url",
      "dominio",
      "organization website",
      "company domain name",
      "site da empresa",
    ],
  ],
  ["company.industry", ["setor", "segmento", "industry", "ramo", "organization industry"]],
  [
    "deal.title",
    [
      "negociacao",
      "nome da negociacao",
      "titulo do negocio",
      "deal title",
      "deal name",
      "oportunidade",
      "negocio",
      "lead title",
      "deal",
      "nome do lead",
      "lead",
    ],
  ],
  [
    "deal.value",
    [
      "valor",
      "valor total",
      "valor unico",
      "amount",
      "deal value",
      "venda",
      "orcamento",
      "valor da negociacao",
      "receita",
    ],
  ],
  [
    "deal.stage",
    ["etapa", "etapa do funil", "fase", "stage", "deal stage", "status do lead", "estagio"],
  ],
  ["deal.pipeline", ["funil", "funil de vendas", "pipeline", "deal pipeline"]],
  ["deal.status", ["status", "situacao", "deal status", "ganho perdido", "resultado"]],
  [
    "deal.expected_close_date",
    [
      "previsao de fechamento",
      "data prevista",
      "expected close date",
      "close date",
      "deal expected close date",
      "data de fechamento prevista",
    ],
  ],
  ["deal.external_id", ["id da negociacao", "deal id", "id do lead", "lead id"]],
];

// Assinaturas de exportação: colunas que só aparecem naquele CRM.
const SIGNATURES: [ImportSource, string[]][] = [
  ["pipedrive", ["person name", "organization name", "deal title", "person email", "deal value"]],
  [
    "hubspot",
    ["record id", "first name", "last name", "lifecycle stage", "contact owner", "create date"],
  ],
  [
    "kommo",
    [
      "nome do lead",
      "status do lead",
      "id do lead",
      "telefone comercial",
      "e mail comercial",
      "funil",
    ],
  ],
  [
    "rdstation",
    [
      "nome da negociacao",
      "etapa",
      "funil de vendas",
      "valor unico",
      "fonte",
      "qualificacao",
      "responsavel",
    ],
  ],
];

// No export de negociações do RD Station CRM, "Nome" é o nome da negociação e o contato vem em
// "Contatos"; no Kommo, "Nome do lead" é o negócio. Estas regras valem antes dos sinônimos.
const SOURCE_OVERRIDES: Partial<Record<ImportSource, Record<string, TargetField>>> = {
  rdstation: {
    nome: "deal.title",
    contatos: "contact.name",
    contato: "contact.name",
    estado: "deal.status",
    "valor unico": "deal.value",
    "email do contato": "contact.email",
    "telefone do contato": "contact.phone",
  },
  kommo: {
    "contato principal": "contact.name",
    "empresa do contato": "company.name",
    orcamento: "deal.value",
  },
  pipedrive: {
    "deal status": "deal.status",
    "organization name": "company.name",
  },
};

export function detectSource(headers: string[]): ImportSource {
  const norm = new Set(headers.map(normalizeHeader));
  let best: ImportSource = "planilha";
  let bestHits = 1;
  for (const [src, sig] of SIGNATURES) {
    const hits = sig.filter((s) => norm.has(s)).length;
    if (hits > bestHits) {
      best = src;
      bestHits = hits;
    }
  }
  return best;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function looksLike(values: string[], test: (v: string) => boolean): boolean {
  const filled = values
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, 30);
  if (filled.length === 0) return false;
  return filled.filter(test).length / filled.length >= 0.7;
}

export interface CustomFieldDef {
  entity: "contact" | "company" | "deal";
  key: string;
  label: string;
}

/**
 * Sugere o destino de cada coluna: primeiro pelo nome (sinônimos e campos personalizados da
 * conta), depois pelo conteúdo (e-mail, telefone, CNPJ). Cada destino é usado uma vez só.
 */
export function suggestMapping(
  headers: string[],
  sample: string[][],
  custom: CustomFieldDef[] = [],
  source: ImportSource = "planilha",
): TargetField[] {
  const used = new Set<string>();
  const result: TargetField[] = headers.map(() => "ignore");
  const norm = headers.map(normalizeHeader);
  const overrides = SOURCE_OVERRIDES[source] ?? {};

  norm.forEach((h, i) => {
    const forced = overrides[h];
    if (forced && !used.has(forced)) {
      result[i] = forced;
      used.add(forced);
      return;
    }
    if (overrides[h]) return;
    const cf = custom.find((c) => normalizeHeader(c.label) === h || c.key === h.replace(/ /g, "_"));
    if (cf) {
      const t = `custom.${cf.entity}.${cf.key}` as TargetField;
      if (!used.has(t)) {
        result[i] = t;
        used.add(t);
        return;
      }
    }
    for (const [target, syns] of SYNONYMS) {
      if (used.has(target)) continue;
      if (syns.includes(h)) {
        result[i] = target;
        used.add(target);
        return;
      }
    }
  });

  // Conteúdo: coluna sem nome reconhecido mas cheia de e-mail/telefone/CNPJ.
  headers.forEach((_, i) => {
    if (result[i] !== "ignore") return;
    const col = sample.map((r) => r[i] ?? "");
    const tryUse = (t: TargetField, ok: boolean) => {
      if (ok && !used.has(t)) {
        result[i] = t;
        used.add(t);
        return true;
      }
      return false;
    };
    if (
      tryUse(
        "contact.email",
        looksLike(col, (v) => EMAIL_RE.test(v)),
      )
    )
      return;
    if (
      tryUse(
        "company.cnpj",
        looksLike(col, (v) => v.replace(/\D/g, "").length === 14),
      )
    )
      return;
    tryUse(
      "contact.phone",
      looksLike(col, (v) => /^[\d\s()+.-]{8,20}$/.test(v) && v.replace(/\D/g, "").length >= 8),
    );
  });
  return result;
}

// ───────────────────────── normalização ─────────────────────────

export function normalizeEmail(raw: string | null | undefined): string | null {
  const v =
    (raw ?? "")
      .trim()
      .toLowerCase()
      .split(/[;,\s]+/)[0] ?? "";
  return EMAIL_RE.test(v) ? v : null;
}

/** Telefone em dígitos com DDI. Número brasileiro de 10 ou 11 dígitos ganha o 55. */
export function normalizePhone(raw: string | null | undefined): string | null {
  const first = (raw ?? "").split(/[;,/]| ou /)[0] ?? "";
  let d = first.replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length >= 11 && d.startsWith("0")) d = d.slice(1); // 0 + DDD da operadora antiga
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  if (d.length < 10 || d.length > 15) return null;
  return d;
}

export function normalizeCnpj(raw: string | null | undefined): string | null {
  const d = (raw ?? "").replace(/\D/g, "");
  return d.length === 14 ? d : null;
}

/** "R$ 1.234,56", "1,234.56", "1234.5" → número. */
export function parseMoney(raw: string | null | undefined): number | null {
  let v = (raw ?? "").replace(/[^\d,.-]/g, "");
  if (!v) return null;
  const lastComma = v.lastIndexOf(",");
  const lastDot = v.lastIndexOf(".");
  if (lastComma > lastDot) v = v.replace(/\./g, "").replace(",", ".");
  else v = v.replace(/,/g, "");
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

/** "31/12/2026", "2026-12-31", número de série do Excel → YYYY-MM-DD. */
export function parseDate(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  const br = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (br) {
    const y = br[3]!.length === 2 ? `20${br[3]}` : br[3]!;
    const iso = `${y}-${br[2]!.padStart(2, "0")}-${br[1]!.padStart(2, "0")}`;
    return Number.isFinite(Date.parse(iso)) ? iso : null;
  }
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return excelSerialToDate(v);
}

export function parseDealStatus(raw: string | null | undefined): "open" | "won" | "lost" | null {
  const v = normalizeHeader(raw ?? "");
  if (!v) return null;
  if (/^(ganh|vendid|won|venda realizada|fechad[oa] ganh|sucesso|1$|true$|sim$)/.test(v))
    return "won";
  if (/^(perdid|lost|perda|fechad[oa] perdid|0$|false$|nao$)/.test(v)) return "lost";
  if (/^(abert|em andamento|open|ativo)/.test(v)) return "open";
  return null;
}

export interface ImportRecord {
  line: number;
  contact: {
    name: string | null;
    email: string | null;
    phone: string | null;
    phone2: string | null;
    job_title: string | null;
    city: string | null;
    tags: string[];
    notes: string | null;
    external_id: string | null;
    custom: Record<string, string>;
  };
  company: {
    name: string | null;
    cnpj: string | null;
    website: string | null;
    phone: string | null;
    email: string | null;
    industry: string | null;
    custom: Record<string, string>;
  } | null;
  deal: {
    title: string;
    value: number | null;
    stage: string | null;
    pipeline: string | null;
    status: "open" | "won" | "lost" | null;
    expected_close_date: string | null;
    external_id: string | null;
    custom: Record<string, string>;
  } | null;
  problems: string[];
}

function clip(v: string | undefined, max: number): string | null {
  const t = (v ?? "").trim();
  return t ? t.slice(0, max) : null;
}

/** Linhas da planilha (sem o cabeçalho) → registros normalizados com os problemas de cada uma. */
export function buildRecords(rows: string[][], mapping: TargetField[]): ImportRecord[] {
  const col = (row: string[], t: string) => {
    const i = mapping.indexOf(t as TargetField);
    return i >= 0 ? (row[i] ?? "") : "";
  };
  const customs = (row: string[], entity: string) => {
    const out: Record<string, string> = {};
    mapping.forEach((t, i) => {
      if (t.startsWith(`custom.${entity}.`)) {
        const v = (row[i] ?? "").trim();
        if (v) out[t.split(".")[2]!] = v.slice(0, 2000);
      }
    });
    return out;
  };
  return rows.map((row, idx) => {
    const problems: string[] = [];
    const first = clip(col(row, "contact.first_name"), 80);
    const last = clip(col(row, "contact.last_name"), 80);
    const name =
      clip(col(row, "contact.name"), 160) ?? ([first, last].filter(Boolean).join(" ") || null);
    const rawEmail = col(row, "contact.email");
    const email = normalizeEmail(rawEmail);
    if (rawEmail.trim() && !email) problems.push("E-mail inválido, ficou de fora");
    const rawPhone = col(row, "contact.phone");
    const phone = normalizePhone(rawPhone);
    if (rawPhone.trim() && !phone) problems.push("Telefone inválido, ficou de fora");
    const companyName = clip(col(row, "company.name"), 160);
    const rawCnpj = col(row, "company.cnpj");
    const cnpj = normalizeCnpj(rawCnpj);
    if (rawCnpj.trim() && !cnpj && rawCnpj.replace(/\D/g, "").length !== 11)
      problems.push("CNPJ inválido, ficou de fora");
    const companyCustom = customs(row, "company");
    const company =
      companyName || cnpj
        ? {
            name: companyName ?? (cnpj ? `CNPJ ${cnpj}` : null),
            cnpj,
            website: clip(col(row, "company.website"), 200),
            phone: normalizePhone(col(row, "company.phone")),
            email: normalizeEmail(col(row, "company.email")),
            industry: clip(col(row, "company.industry"), 120),
            custom: companyCustom,
          }
        : null;
    const dealTitle = clip(col(row, "deal.title"), 160);
    const rawValue = col(row, "deal.value");
    const value = parseMoney(rawValue);
    if (rawValue.trim() && value === null) problems.push("Valor do negócio ilegível");
    const deal = dealTitle
      ? {
          title: dealTitle,
          value,
          stage: clip(col(row, "deal.stage"), 60),
          pipeline: clip(col(row, "deal.pipeline"), 80),
          status: parseDealStatus(col(row, "deal.status")),
          expected_close_date: parseDate(col(row, "deal.expected_close_date")),
          external_id: clip(col(row, "deal.external_id"), 200),
          custom: customs(row, "deal"),
        }
      : null;
    if (!name && !email && !phone && !company && !deal)
      problems.push("Linha sem nome, e-mail, telefone, empresa nem negócio");
    return {
      line: idx + 2,
      contact: {
        name,
        email,
        phone,
        phone2: normalizePhone(col(row, "contact.phone2")),
        job_title: clip(col(row, "contact.job_title"), 120),
        city: clip(col(row, "contact.city"), 120),
        tags: col(row, "contact.tags")
          .split(/[|;,]/)
          .map((t) => t.trim())
          .filter(Boolean)
          .slice(0, 20),
        notes: clip(col(row, "contact.notes"), 4000),
        external_id: clip(col(row, "contact.external_id"), 200),
        custom: customs(row, "contact"),
      },
      company,
      deal,
      problems,
    };
  });
}

export function isEmptyRecord(r: ImportRecord): boolean {
  return !r.contact.name && !r.contact.email && !r.contact.phone && !r.company && !r.deal;
}
