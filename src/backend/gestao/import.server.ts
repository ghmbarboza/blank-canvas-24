// Importador guiado (servidor): prévia e gravação a partir do MESMO plano de deduplicação.
// O navegador manda os registros já normalizados; o servidor valida, busca o que já existe na conta
// e refaz o plano (nunca confia no plano do cliente).
import { z } from "zod";

import { admin, HttpError } from "@/backend/http.server";
import {
  planImport,
  phoneVariants,
  type Existing,
  type ExistingCompany,
  type ExistingContact,
  type ImportPlan,
} from "@/features/gestao/import/dedupe";
import { MAX_ROWS_CLIENT } from "@/features/gestao/import/limits";
import type { ImportRecord } from "@/features/gestao/import/mapping";

import {
  linkExternal,
  loadPipelines,
  mergeCustom,
  resolvePipeline,
  resolveStage,
} from "./crm-write.server";

export const MAX_IMPORT_ROWS = MAX_ROWS_CLIENT;
const CHUNK = 200;

const str = (max: number) => z.string().max(max).nullable();
const custom = z.record(z.string(), z.string().max(2000)).default({});

const recordSchema = z.object({
  line: z.number().int().min(1),
  contact: z.object({
    name: str(160),
    email: str(200),
    phone: z
      .string()
      .regex(/^\d{8,15}$/)
      .nullable(),
    phone2: z
      .string()
      .regex(/^\d{8,15}$/)
      .nullable(),
    job_title: str(120),
    city: str(120),
    tags: z.array(z.string().max(60)).max(20),
    notes: str(4000),
    external_id: str(200),
    custom,
  }),
  company: z
    .object({
      name: str(160),
      cnpj: z
        .string()
        .regex(/^\d{14}$/)
        .nullable(),
      website: str(200),
      phone: z
        .string()
        .regex(/^\d{8,15}$/)
        .nullable(),
      email: str(200),
      industry: str(120),
      custom,
    })
    .nullable(),
  deal: z
    .object({
      title: z.string().min(1).max(160),
      value: z.number().min(0).max(1e12).nullable(),
      stage: str(60),
      pipeline: str(80),
      status: z.enum(["open", "won", "lost"]).nullable(),
      expected_close_date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .nullable(),
      external_id: str(200),
      custom,
    })
    .nullable(),
  problems: z.array(z.string().max(200)).max(10),
});

export const importInputSchema = z.object({
  source: z.enum(["planilha", "rdstation", "kommo", "pipedrive", "hubspot"]),
  fileName: z.string().max(200).nullable().default(null),
  mapping: z.array(z.string().max(80)).max(200),
  records: z.array(recordSchema).min(1).max(MAX_IMPORT_ROWS),
  options: z
    .object({
      createStages: z.boolean().default(true),
      createPipelines: z.boolean().default(true),
    })
    .default({ createStages: true, createPipelines: true }),
});
export type ImportInput = z.infer<typeof importInputSchema>;

export function parseImportInput(body: unknown): ImportInput {
  const parsed = importInputSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new HttpError(
      400,
      `Planilha com dado fora do formato (${issue?.path.join(".") ?? "?"}: ${issue?.message ?? ""}). Revise e tente de novo.`,
      "bad_import",
    );
  }
  return parsed.data;
}

async function inChunks<T>(values: string[], fn: (chunk: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < values.length; i += CHUNK)
    out.push(...(await fn(values.slice(i, i + CHUNK))));
  return out;
}

async function loadExisting(accountId: string, records: ImportRecord[]): Promise<Existing> {
  const db = admin();
  const emails = [...new Set(records.map((r) => r.contact.email).filter((v): v is string => !!v))];
  const phones = [
    ...new Set(records.flatMap((r) => (r.contact.phone ? phoneVariants(r.contact.phone) : []))),
  ];
  const cnpjs = [...new Set(records.map((r) => r.company?.cnpj).filter((v): v is string => !!v))];
  const names = [
    ...new Set(records.map((r) => r.company?.name?.trim()).filter((v): v is string => !!v)),
  ];
  const sel = "id, name, email, phone, job_title, city, company_id";
  const byEmail = await inChunks<ExistingContact>(emails, async (c) => {
    const { data, error } = await db
      .from("contacts")
      .select(sel)
      .eq("account_id", accountId)
      .in("email", c);
    if (error) throw new HttpError(500, `Leitura de contatos: ${error.message}`, "db");
    return data ?? [];
  });
  const byPhone = await inChunks<ExistingContact>(phones, async (c) => {
    const { data, error } = await db
      .from("contacts")
      .select(sel)
      .eq("account_id", accountId)
      .in("phone", c);
    if (error) throw new HttpError(500, `Leitura de contatos: ${error.message}`, "db");
    return data ?? [];
  });
  const coCnpj = await inChunks<ExistingCompany>(cnpjs, async (c) => {
    const { data, error } = await db
      .from("companies")
      .select("id, name, cnpj")
      .eq("account_id", accountId)
      .in("cnpj", c);
    if (error) throw new HttpError(500, `Leitura de empresas: ${error.message}`, "db");
    return data ?? [];
  });
  const coName = await inChunks<ExistingCompany>(names, async (c) => {
    // ilike em lote não existe no PostgREST; o nome exato cobre o caso comum e a comparação final
    // (sem caixa) é feita no plano.
    const variants = [...new Set(c.flatMap((n) => [n, n.toUpperCase(), n.toLowerCase()]))];
    const { data, error } = await db
      .from("companies")
      .select("id, name, cnpj")
      .eq("account_id", accountId)
      .in("name", variants);
    if (error) throw new HttpError(500, `Leitura de empresas: ${error.message}`, "db");
    return data ?? [];
  });
  const uniq = <T extends { id: string }>(xs: T[]) => [
    ...new Map(xs.map((x) => [x.id, x])).values(),
  ];
  return { contacts: uniq([...byEmail, ...byPhone]), companies: uniq([...coCnpj, ...coName]) };
}

export async function previewImport(accountId: string, input: ImportInput) {
  const records = input.records as ImportRecord[];
  const plan = planImport(records, await loadExisting(accountId, records));
  return summarizePlan(plan);
}

export function summarizePlan(plan: ImportPlan) {
  return {
    totals: plan.totals,
    warnings: plan.warnings.slice(0, 50),
    skipped: plan.skipped.slice(0, 50),
    sample: {
      contacts: plan.contacts.slice(0, 25).map((c) => ({
        name: c.name,
        email: c.email,
        phone: c.phone,
        action: c.action,
        fills: c.fills,
        lines: c.lines,
      })),
      companies: plan.companies
        .slice(0, 10)
        .map((c) => ({ name: c.name, cnpj: c.cnpj, action: c.action })),
      deals: plan.deals
        .slice(0, 10)
        .map((d) => ({ title: d.title, value: d.value, stage: d.stage, status: d.status })),
    },
  };
}

export interface ImportReport {
  contactsCreated: number;
  contactsUpdated: number;
  companiesCreated: number;
  companiesUpdated: number;
  dealsCreated: number;
  mergedInFile: number;
  skipped: number;
  errors: { line: number; message: string }[];
}

export async function commitImport(
  accountId: string,
  userId: string,
  input: ImportInput,
): Promise<{ batchId: string; report: ImportReport }> {
  const db = admin();
  const records = input.records as ImportRecord[];
  const plan = planImport(records, await loadExisting(accountId, records));
  const { data: batch, error: be } = await db
    .from("import_batches")
    .insert({
      account_id: accountId,
      source: input.source,
      file_name: input.fileName,
      status: "running",
      mapping: input.mapping,
      totals: plan.totals,
      created_by: userId,
    })
    .select("id")
    .single();
  if (be || !batch)
    throw new HttpError(500, `Não deu para registrar a importação: ${be?.message}`, "db");

  const report: ImportReport = {
    contactsCreated: 0,
    contactsUpdated: 0,
    companiesCreated: 0,
    companiesUpdated: 0,
    dealsCreated: 0,
    mergedInFile: plan.totals.mergedInFile,
    skipped: plan.totals.skipped,
    errors: [],
  };
  const origin = input.source === "planilha" ? "import" : `import:${input.source}`;
  const fail = (lines: number[], message: string) => {
    for (const line of lines.slice(0, 3))
      report.errors.push({ line, message: message.slice(0, 200) });
  };

  try {
    // empresas
    const companyIds = new Map<string, string>();
    for (const c of plan.companies) {
      if (c.existingId) {
        const { data: cur } = await db
          .from("companies")
          .select("website, phone, email, industry, cnpj, custom")
          .eq("id", c.existingId)
          .eq("account_id", accountId)
          .maybeSingle();
        const patch = {
          website: cur?.website || c.website,
          phone: cur?.phone || c.phone,
          email: cur?.email || c.email,
          industry: cur?.industry || c.industry,
          cnpj: cur?.cnpj || c.cnpj,
          custom: mergeCustom(cur?.custom, c.custom, false) as never,
        };
        const { error } = await db
          .from("companies")
          .update(patch)
          .eq("id", c.existingId)
          .eq("account_id", accountId);
        if (error) fail(c.lines, `Empresa ${c.name}: ${error.message}`);
        else report.companiesUpdated += 1;
        companyIds.set(c.key, c.existingId);
        continue;
      }
      const { data, error } = await db
        .from("companies")
        .insert({
          account_id: accountId,
          name: c.name.slice(0, 160),
          cnpj: c.cnpj,
          website: c.website,
          phone: c.phone,
          email: c.email,
          industry: c.industry,
          custom: c.custom,
          created_by: userId,
        })
        .select("id")
        .single();
      if (error || !data) fail(c.lines, `Empresa ${c.name}: ${error?.message ?? "erro"}`);
      else {
        report.companiesCreated += 1;
        companyIds.set(c.key, data.id);
      }
    }

    // contatos
    const contactIds = new Map<string, string>();
    for (const c of plan.contacts) {
      const companyId = c.companyKey ? (companyIds.get(c.companyKey) ?? null) : null;
      const companyName = c.companyKey
        ? (plan.companies.find((x) => x.key === c.companyKey)?.name ?? null)
        : null;
      if (c.existingId) {
        const { data: cur } = await db
          .from("contacts")
          .select("name, email, phone, job_title, city, company_id, company, tags, notes, custom")
          .eq("id", c.existingId)
          .eq("account_id", accountId)
          .maybeSingle();
        const patch = {
          name: cur?.name || c.name,
          email: cur?.email || c.email,
          phone: cur?.phone || c.phone,
          job_title: cur?.job_title || c.job_title,
          city: cur?.city || c.city,
          company_id: cur?.company_id ?? companyId,
          company: cur?.company || companyName,
          notes: cur?.notes || c.notes,
          tags: [...new Set([...(cur?.tags ?? []), ...c.tags])],
          custom: mergeCustom(cur?.custom, c.custom, false) as never,
        };
        const { error } = await db
          .from("contacts")
          .update(patch)
          .eq("id", c.existingId)
          .eq("account_id", accountId);
        if (error) fail(c.lines, `Contato ${c.name ?? c.email ?? ""}: ${error.message}`);
        else report.contactsUpdated += 1;
        contactIds.set(c.key, c.existingId);
        continue;
      }
      const { data, error } = await db
        .from("contacts")
        .insert({
          account_id: accountId,
          name: c.name,
          email: c.email,
          phone: c.phone,
          job_title: c.job_title,
          city: c.city,
          tags: c.tags,
          notes: c.notes,
          company_id: companyId,
          company: companyName,
          source: origin,
          custom: c.custom,
        })
        .select("id")
        .single();
      if (error || !data)
        fail(c.lines, `Contato ${c.name ?? c.email ?? ""}: ${error?.message ?? "erro"}`);
      else {
        report.contactsCreated += 1;
        contactIds.set(c.key, data.id);
        if (c.external_id && input.source !== "planilha")
          await linkExternal(
            accountId,
            "import",
            "contact",
            data.id,
            `${input.source}:${c.external_id}`,
            null,
            null,
          ).catch(() => undefined);
      }
    }

    // negócios
    if (plan.deals.length > 0) {
      const cache = await loadPipelines(accountId);
      for (const d of plan.deals) {
        try {
          if (d.external_id && input.source !== "planilha") {
            const { data: seen } = await db
              .from("external_links")
              .select("local_id")
              .eq("account_id", accountId)
              .eq("provider", "import")
              .eq("entity", "deal")
              .eq("external_id", `${input.source}:${d.external_id}`)
              .maybeSingle();
            if (seen) continue; // já importado antes: não duplica
          }
          const pipelineId = await resolvePipeline(
            accountId,
            cache,
            d.pipeline,
            input.options.createPipelines,
          );
          const stageId = await resolveStage(
            accountId,
            cache,
            pipelineId,
            d.stage,
            d.status,
            input.options.createStages,
          );
          const { data, error } = await db
            .from("deals")
            .insert({
              account_id: accountId,
              pipeline_id: pipelineId,
              stage_id: stageId,
              title: d.title,
              value: d.value ?? 0,
              contact_id: d.contactKey ? (contactIds.get(d.contactKey) ?? null) : null,
              company_id: d.companyKey ? (companyIds.get(d.companyKey) ?? null) : null,
              owner_user_id: userId,
              expected_close_date: d.expected_close_date,
              source: origin,
              custom: d.custom,
            })
            .select("id")
            .single();
          if (error || !data) throw new Error(error?.message ?? "erro");
          report.dealsCreated += 1;
          if (d.external_id && input.source !== "planilha")
            await linkExternal(
              accountId,
              "import",
              "deal",
              data.id,
              `${input.source}:${d.external_id}`,
              null,
              null,
            ).catch(() => undefined);
        } catch (err) {
          fail([d.line], `Negócio ${d.title}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    await db
      .from("import_batches")
      .update({ status: "done", report: report as never, finished_at: new Date().toISOString() })
      .eq("id", batch.id);
    await db.rpc("audit", {
      _account: accountId,
      _action: "import.done",
      _entity: "import_batch",
      _entity_id: batch.id,
      _meta: { source: input.source, ...report, errors: report.errors.length },
    });
    return { batchId: batch.id, report };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .from("import_batches")
      .update({
        status: "failed",
        error: message.slice(0, 500),
        report: report as never,
        finished_at: new Date().toISOString(),
      })
      .eq("id", batch.id);
    throw new HttpError(
      500,
      `A importação parou no meio: ${message}. O que entrou até aqui ficou registrado.`,
      "import_failed",
    );
  }
}
