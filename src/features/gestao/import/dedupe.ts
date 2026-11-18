// Deduplicação do importador: junta linhas repetidas da própria planilha e decide, contra o que já
// existe na conta, o que é novo e o que só completa um cadastro. Função pura (o servidor busca os
// existentes e chama esta função; a prévia e a gravação usam o mesmo plano).
import type { ImportRecord } from "./mapping";

export interface PlannedContact {
  key: string; // "email:..." | "phone:..." | "line:N"
  lines: number[];
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
  companyKey: string | null;
  action: "create" | "update";
  existingId: string | null;
  /** Campos que a importação vai preencher num cadastro existente (só os vazios). */
  fills: string[];
}

export interface PlannedCompany {
  key: string; // "cnpj:..." | "name:..."
  lines: number[];
  name: string;
  cnpj: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  industry: string | null;
  custom: Record<string, string>;
  action: "create" | "update";
  existingId: string | null;
}

export interface PlannedDeal {
  line: number;
  title: string;
  value: number | null;
  stage: string | null;
  pipeline: string | null;
  status: "open" | "won" | "lost" | null;
  expected_close_date: string | null;
  external_id: string | null;
  custom: Record<string, string>;
  contactKey: string | null;
  companyKey: string | null;
}

export interface ExistingContact {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  city: string | null;
  company_id: string | null;
}

export interface ExistingCompany {
  id: string;
  name: string;
  cnpj: string | null;
}

export interface Existing {
  contacts: ExistingContact[];
  companies: ExistingCompany[];
}

export interface ImportPlan {
  contacts: PlannedContact[];
  companies: PlannedCompany[];
  deals: PlannedDeal[];
  skipped: { line: number; reason: string }[];
  warnings: { line: number; message: string }[];
  totals: {
    rows: number;
    contactsNew: number;
    contactsUpdated: number;
    mergedInFile: number;
    companiesNew: number;
    companiesExisting: number;
    deals: number;
    skipped: number;
  };
}

/** Variações de telefone que podem estar gravadas (com e sem 55, com +). */
export function phoneVariants(phone: string): string[] {
  const set = new Set<string>([phone, `+${phone}`]);
  if (phone.startsWith("55") && phone.length >= 12) {
    set.add(phone.slice(2));
    set.add(`+${phone}`);
  }
  return [...set];
}

export function canonicalPhone(raw: string | null): string | null {
  if (!raw) return null;
  let d = raw.replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  return d || null;
}

function companyKeyOf(c: { cnpj: string | null; name: string | null }): string | null {
  if (c.cnpj) return `cnpj:${c.cnpj}`;
  const n = (c.name ?? "").trim().toLowerCase();
  return n ? `name:${n}` : null;
}

function firstNonEmpty<T>(a: T | null, b: T | null): T | null {
  return a ?? b;
}

export function planImport(records: ImportRecord[], existing: Existing): ImportPlan {
  const skipped: ImportPlan["skipped"] = [];
  const warnings: ImportPlan["warnings"] = [];
  const contacts = new Map<string, PlannedContact>();
  const companies = new Map<string, PlannedCompany>();
  const deals: PlannedDeal[] = [];
  let mergedInFile = 0;

  // índices dos existentes
  const byEmail = new Map<string, ExistingContact>();
  const byPhone = new Map<string, ExistingContact>();
  for (const c of existing.contacts) {
    if (c.email) byEmail.set(c.email.toLowerCase(), c);
    const p = canonicalPhone(c.phone);
    if (p) byPhone.set(p, c);
  }
  const coByCnpj = new Map<string, ExistingCompany>();
  const coByName = new Map<string, ExistingCompany>();
  for (const c of existing.companies) {
    if (c.cnpj) coByCnpj.set(c.cnpj, c);
    coByName.set(c.name.trim().toLowerCase(), c);
  }
  // aliases: o mesmo contato pode ser achado por e-mail numa linha e por telefone em outra
  const alias = new Map<string, string>();

  for (const r of records) {
    for (const p of r.problems) warnings.push({ line: r.line, message: p });
    const hasContact = Boolean(r.contact.name || r.contact.email || r.contact.phone);
    if (!hasContact && !r.company && !r.deal) {
      skipped.push({ line: r.line, reason: r.problems[0] ?? "Linha vazia" });
      continue;
    }

    // empresa
    let companyKey: string | null = null;
    if (r.company) {
      companyKey = companyKeyOf(r.company);
      if (companyKey) {
        const prev = companies.get(companyKey);
        if (prev) {
          prev.lines.push(r.line);
          prev.website = firstNonEmpty(prev.website, r.company.website);
          prev.phone = firstNonEmpty(prev.phone, r.company.phone);
          prev.email = firstNonEmpty(prev.email, r.company.email);
          prev.industry = firstNonEmpty(prev.industry, r.company.industry);
          prev.custom = { ...r.company.custom, ...prev.custom };
        } else {
          const ex =
            (r.company.cnpj ? coByCnpj.get(r.company.cnpj) : undefined) ??
            coByName.get((r.company.name ?? "").trim().toLowerCase());
          companies.set(companyKey, {
            key: companyKey,
            lines: [r.line],
            name: r.company.name ?? ex?.name ?? "Empresa sem nome",
            cnpj: r.company.cnpj,
            website: r.company.website,
            phone: r.company.phone,
            email: r.company.email,
            industry: r.company.industry,
            custom: r.company.custom,
            action: ex ? "update" : "create",
            existingId: ex?.id ?? null,
          });
        }
      }
    }

    // contato
    let contactKey: string | null = null;
    if (hasContact) {
      const keys = [
        r.contact.email ? `email:${r.contact.email}` : null,
        r.contact.phone ? `phone:${r.contact.phone}` : null,
      ].filter((k): k is string => Boolean(k));
      const resolved = keys.map((k) => alias.get(k) ?? (contacts.has(k) ? k : null)).find(Boolean);
      contactKey = resolved ?? keys[0] ?? `line:${r.line}`;
      const prev = contacts.get(contactKey);
      if (prev) {
        mergedInFile += 1;
        prev.lines.push(r.line);
        prev.name = firstNonEmpty(prev.name, r.contact.name);
        prev.email = firstNonEmpty(prev.email, r.contact.email);
        prev.phone = firstNonEmpty(prev.phone, r.contact.phone);
        prev.phone2 = firstNonEmpty(prev.phone2, r.contact.phone2);
        prev.job_title = firstNonEmpty(prev.job_title, r.contact.job_title);
        prev.city = firstNonEmpty(prev.city, r.contact.city);
        prev.notes = firstNonEmpty(prev.notes, r.contact.notes);
        prev.external_id = firstNonEmpty(prev.external_id, r.contact.external_id);
        prev.companyKey = firstNonEmpty(prev.companyKey, companyKey);
        prev.tags = [...new Set([...prev.tags, ...r.contact.tags])];
        prev.custom = { ...r.contact.custom, ...prev.custom };
      } else {
        const ex =
          (r.contact.email ? byEmail.get(r.contact.email) : undefined) ??
          (r.contact.phone ? byPhone.get(r.contact.phone) : undefined);
        contacts.set(contactKey, {
          key: contactKey,
          lines: [r.line],
          name: r.contact.name,
          email: r.contact.email,
          phone: r.contact.phone,
          phone2: r.contact.phone2,
          job_title: r.contact.job_title,
          city: r.contact.city,
          tags: r.contact.tags,
          notes: r.contact.notes,
          external_id: r.contact.external_id,
          custom: r.contact.custom,
          companyKey,
          action: ex ? "update" : "create",
          existingId: ex?.id ?? null,
          fills: [],
        });
      }
      for (const k of keys) alias.set(k, contactKey);
    }

    if (r.deal)
      deals.push({
        line: r.line,
        ...r.deal,
        contactKey,
        companyKey,
      });
  }

  // o que a atualização preenche (só campo vazio no cadastro atual)
  const exById = new Map(existing.contacts.map((c) => [c.id, c]));
  for (const c of contacts.values()) {
    if (c.action !== "update" || !c.existingId) continue;
    const ex = exById.get(c.existingId);
    if (!ex) continue;
    const fills: string[] = [];
    if (!ex.name && c.name) fills.push("nome");
    if (!ex.email && c.email) fills.push("e-mail");
    if (!ex.phone && c.phone) fills.push("telefone");
    if (!ex.job_title && c.job_title) fills.push("cargo");
    if (!ex.city && c.city) fills.push("cidade");
    if (!ex.company_id && c.companyKey) fills.push("empresa");
    if (c.tags.length) fills.push("etiquetas");
    c.fills = fills;
  }

  const contactList = [...contacts.values()];
  const companyList = [...companies.values()];
  return {
    contacts: contactList,
    companies: companyList,
    deals,
    skipped,
    warnings,
    totals: {
      rows: records.length,
      contactsNew: contactList.filter((c) => c.action === "create").length,
      contactsUpdated: contactList.filter((c) => c.action === "update").length,
      mergedInFile,
      companiesNew: companyList.filter((c) => c.action === "create").length,
      companiesExisting: companyList.filter((c) => c.action === "update").length,
      deals: deals.length,
      skipped: skipped.length,
    },
  };
}
