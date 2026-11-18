import { z } from "zod";

import { PURCHASE_KEY, isoDay, purchaseDateOf, todayIso } from "@/features/posvenda/moment";

import type { ContactDraft } from "./api";
import {
  LIFECYCLE_LABEL,
  isLifecycle,
  normalizePhone,
  onlyDigits,
  sourceLabel,
  type ContactRow,
} from "./types";

export const CSV_HEADERS = [
  "nome",
  "telefone",
  "email",
  "empresa",
  "cargo",
  "cidade",
  "tags",
  "data_compra",
] as const;
type CsvHeader = (typeof CSV_HEADERS)[number];

// Excel em português salva com ";". Detecta pelo cabeçalho.
function detectDelimiter(firstLine: string): string {
  const semis = (firstLine.match(/;/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  return semis > commas ? ";" : ",";
}

// Parser com aspas (RFC 4180): campo entre aspas pode ter delimitador e quebra de linha.
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, "");
  const delimiter = detectDelimiter(clean.split(/\r?\n/, 1)[0] ?? "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && clean[i + 1] === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/^e-mail$/, "email")
    .replace(
      /^(data[ _](da[ _])?(ultima[ _])?compra|ultima[ _]compra|comprou[ _]em)$/,
      "data_compra",
    );
}

const rowSchema = z
  .object({
    nome: z.string().trim().max(160, "Nome muito longo"),
    telefone: z.string().trim(),
    email: z.union([z.literal(""), z.string().trim().email("E-mail inválido")]),
    empresa: z.string().trim().max(160),
    cargo: z.string().trim().max(120),
    cidade: z.string().trim().max(120),
    tags: z.string(),
    data_compra: z.string().trim(),
  })
  .refine((r) => r.nome || r.telefone || r.email, {
    message: "Linha sem nome, telefone nem e-mail",
  })
  .refine((r) => !r.telefone || onlyDigits(r.telefone).length >= 8, {
    message: "Telefone inválido",
  })
  .refine((r) => !r.data_compra || isoDay(r.data_compra) !== null, {
    message: "Data da compra inválida (use dia/mês/ano, ex.: 05/11/2026)",
  })
  .refine((r) => !r.data_compra || (isoDay(r.data_compra) ?? "") <= todayIso(), {
    message: "Data da compra no futuro",
  });

export interface ParsedImport {
  missingHeaders: CsvHeader[];
  valid: ContactDraft[];
  invalid: Array<{ line: number; message: string }>;
  preview: Array<Record<CsvHeader, string>>;
}

export function buildImport(text: string): ParsedImport {
  const [header, ...body] = parseCsv(text);
  const cols = (header ?? []).map(normalizeHeader);
  const indexOf = (h: CsvHeader) => cols.indexOf(h);
  const identity: CsvHeader[] = ["nome", "telefone", "email"];
  const missingHeaders = identity.every((h) => indexOf(h) === -1) ? identity : [];
  const records = body.map((cells) => {
    const rec = {} as Record<CsvHeader, string>;
    for (const h of CSV_HEADERS) {
      const idx = indexOf(h);
      rec[h] = idx >= 0 ? (cells[idx] ?? "").trim() : "";
    }
    return rec;
  });

  const valid: ContactDraft[] = [];
  const invalid: ParsedImport["invalid"] = [];
  records.forEach((rec, i) => {
    const parsed = rowSchema.safeParse(rec);
    if (!parsed.success) {
      invalid.push({ line: i + 2, message: parsed.error.issues[0]?.message ?? "Linha inválida" });
      return;
    }
    const r = parsed.data;
    // Com data da compra a linha já entra como cliente, com origem de importação: quem comprou
    // antes não recebe boas-vindas atrasada, mas o prazo de garantia e a recompra passam a contar.
    const purchase = isoDay(r.data_compra);
    valid.push({
      ...(purchase
        ? { lifecycle: "customer", source: "import_csv", custom: { [PURCHASE_KEY]: purchase } }
        : { source: "csv" }),
      name: r.nome || null,
      phone: normalizePhone(r.telefone),
      email: r.email ? r.email.toLowerCase() : null,
      company: r.empresa || null,
      job_title: r.cargo || null,
      city: r.cidade || null,
      tags: r.tags
        .split(/[|;,]/)
        .map((t) => t.trim())
        .filter(Boolean),
    });
  });
  return { missingHeaders, valid, invalid, preview: records.slice(0, 5) };
}

// Aspas quando preciso e apóstrofo antes de =, +, - e @ (o Excel executaria como fórmula).
function escapeCell(raw: string): string {
  const v = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return /[",;\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function contactsToCsv(rows: ContactRow[]): string {
  const header = [
    ...CSV_HEADERS,
    "temperatura",
    "score",
    "ciclo",
    "origem",
    "intencao",
    "proximo_passo",
  ];
  const lines = rows.map((c) =>
    [
      c.name ?? "",
      c.phone ?? "",
      c.email ?? "",
      c.company ?? "",
      c.job_title ?? "",
      c.city ?? "",
      c.tags.join("|"),
      purchaseDateOf(c.custom) ?? "",
      c.temperature ?? "",
      c.score === null ? "" : String(c.score),
      isLifecycle(c.lifecycle) ? LIFECYCLE_LABEL[c.lifecycle] : c.lifecycle,
      c.source ? sourceLabel(c.source) : "",
      c.ai_intent ?? "",
      c.ai_next_step ?? "",
    ]
      .map(escapeCell)
      .join(","),
  );
  return [header.join(","), ...lines].join("\r\n");
}

export function downloadText(filename: string, content: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob(["\uFEFF", content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const CSV_TEMPLATE = `${CSV_HEADERS.join(",")}\r\n`;
