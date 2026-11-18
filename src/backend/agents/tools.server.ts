// Ferramentas internas que o modelo chama (tool calling), mais as ações da Composio.
// Toda chamada é registrada em agent_tool_calls. Na avaliação (dryRun) o que muda algo fora da
// conversa é simulado, e a ferramenta marcada como "falhando" falha de propósito.
import { admin } from "@/backend/http.server";
import { searchKb } from "@/backend/support/kb-search.server";
import { offerSlots, resolveSlotChoice } from "@/backend/support/agent-scheduling";
import { agentSettingsV2, internalTool } from "@/features/agents/catalog";

import { healthScore } from "./health";
import { kbQuery } from "./kb-query";
import { checkSurveyScore } from "./humanize";
import type { ToolCall } from "./tool-loop";

export interface ToolCtx {
  accountId: string;
  agentId: string | null;
  agentSettings: unknown;
  conversationId: string | null;
  contactId: string | null;
  runId: string | null;
  evalRunId: string | null;
  dryRun: boolean;
  failTool: string | null;
  /** Última fala do cliente (confere a nota da pesquisa). */
  lastCustomerText: string;
  /** Ações da Composio ligadas neste agente. */
  composioSlugs: Set<string>;
}

export interface ToolOutcome {
  ok: boolean;
  data: unknown;
  error: string | null;
}

class ToolError extends Error {}

const need = (v: unknown, what: string): string => {
  const s = typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
  if (!s) throw new ToolError(`falta ${what}`);
  return s;
};

async function simulatedOrReal(
  ctx: ToolCtx,
  simulated: unknown,
  real: () => Promise<unknown>,
): Promise<unknown> {
  return ctx.dryRun ? simulated : real();
}

function requireContact(ctx: ToolCtx): string {
  if (!ctx.contactId) throw new ToolError("esta conversa não tem cliente identificado");
  return ctx.contactId;
}

async function identifyContact(ctx: ToolCtx) {
  if (!ctx.contactId) return { ficha: "cliente ainda não identificado" };
  const db = admin();
  const [{ data: c }, { data: deals }, { data: tickets }] = await Promise.all([
    db
      .from("contacts")
      .select(
        "name, email, phone, company, lifecycle, score, temperature, ai_summary, ai_next_step, tags",
      )
      .eq("id", ctx.contactId)
      .maybeSingle(),
    db
      .from("deals")
      .select("title, value, status, pipeline_stages(name)")
      .eq("contact_id", ctx.contactId)
      .eq("status", "open")
      .limit(5),
    db
      .from("tickets")
      .select("number, subject, status, priority")
      .eq("contact_id", ctx.contactId)
      .in("status", ["open", "pending", "waiting_customer"])
      .limit(5),
  ]);
  return { cliente: c, negocios_abertos: deals ?? [], chamados_abertos: tickets ?? [] };
}

async function kbSearch(ctx: ToolCtx, args: Record<string, unknown>) {
  const q = need(args["query"], "o que procurar").slice(0, 300);
  const rows = await searchKb(ctx.accountId, q, { query: kbQuery(q) || q });
  return rows.length
    ? rows.map((r) => ({ titulo: r.title, texto: r.body_md.slice(0, 1500) }))
    : { nada_encontrado: `nenhum artigo da base fala de "${q}"` };
}

async function openTicket(ctx: ToolCtx, args: Record<string, unknown>) {
  const subject = need(args["subject"], "o título").slice(0, 200);
  const description = String(args["description"] ?? "").slice(0, 4000);
  const priority = ["low", "normal", "high", "urgent"].includes(String(args["priority"]))
    ? String(args["priority"])
    : "normal";
  return simulatedOrReal(ctx, { simulado: true, numero: 0 }, async () => {
    const { data, error } = await admin()
      .from("tickets")
      .insert({
        account_id: ctx.accountId,
        subject,
        description,
        priority,
        source: "conversation",
        contact_id: ctx.contactId,
        conversation_id: ctx.conversationId,
      } as never)
      .select("number")
      .single();
    if (error) throw new ToolError(`não abriu o chamado: ${error.message}`);
    return { aberto: true, numero: (data as { number: number }).number };
  });
}

async function createDeal(ctx: ToolCtx, args: Record<string, unknown>) {
  const contactId = ctx.dryRun ? ctx.contactId : requireContact(ctx);
  const title = need(args["title"], "o nome do negócio").slice(0, 160);
  const value = Math.max(0, Number(args["value"]) || 0);
  return simulatedOrReal(ctx, { simulado: true, criado: true }, async () => {
    const db = admin();
    const { data: pipe } = await db
      .from("pipelines")
      .select("id, pipeline_stages(id, position, kind)")
      .eq("account_id", ctx.accountId)
      .order("is_default", { ascending: false })
      .order("position")
      .limit(1)
      .maybeSingle();
    const stages = (
      (pipe?.pipeline_stages ?? []) as { id: string; position: number; kind: string }[]
    )
      .filter((s) => s.kind === "open")
      .sort((a, b) => a.position - b.position);
    if (!pipe || !stages[0]) throw new ToolError("a conta ainda não tem funil de vendas");
    const { data: open } = await db
      .from("deals")
      .select("id, title")
      .eq("contact_id", contactId!)
      .eq("status", "open")
      .limit(1)
      .maybeSingle();
    if (open) return { ja_existe: true, negocio: open.title };
    const { error } = await db.from("deals").insert({
      account_id: ctx.accountId,
      pipeline_id: pipe.id,
      stage_id: stages[0].id,
      contact_id: contactId,
      title,
      value,
      source: "ai_agent",
    } as never);
    if (error) throw new ToolError(`não criou o negócio: ${error.message}`);
    return { criado: true };
  });
}

async function scoreLead(ctx: ToolCtx) {
  const contactId = requireContact(ctx);
  return simulatedOrReal(ctx, { simulado: true }, async () => {
    const { classifyContact } = await import("@/backend/ai/classify.server");
    const r = await classifyContact(ctx.accountId, contactId);
    return r
      ? { pontuacao: r.score, temperatura: r.temperature, proximo_passo: r.next_step }
      : { sem_conversa: true };
  });
}

async function enrollSequence(ctx: ToolCtx, args: Record<string, unknown>) {
  const name = need(args["sequence_name"], "o nome da cadência");
  const db = admin();
  const { data: list } = await db
    .from("automations")
    .select("id, account_id, graph, reentry, name")
    .eq("account_id", ctx.accountId)
    .eq("kind", "sequence")
    .eq("status", "active")
    .ilike("name", `%${name.replace(/[%_]/g, "")}%`)
    .limit(1);
  const a = list?.[0];
  if (!a) throw new ToolError(`não existe cadência ativa chamada "${name}"`);
  const contactId = ctx.dryRun ? "" : requireContact(ctx);
  return simulatedOrReal(ctx, { simulado: true, cadencia: a.name }, async () => {
    const { enroll } = await import("@/backend/automations/runtime.server");
    const r = await enroll(a as never, [contactId], { source: "ai_agent" });
    return { cadencia: a.name, inscrito: r.enrolled > 0, ja_estava: r.skipped > 0 };
  });
}

async function agenda(ctx: ToolCtx) {
  const s = agentSettingsV2(ctx.agentSettings);
  if (!s.booking_slug) throw new ToolError("o agente não tem página de agendamento escolhida");
  const { freeSlots } = await import("@/backend/booking.server");
  return { slug: s.booking_slug, offered: offerSlots((await freeSlots(s.booking_slug)).slots, 6) };
}

async function availability(ctx: ToolCtx) {
  const { offered } = await agenda(ctx);
  return offered.length
    ? offered.map((o) => ({ codigo: o.code, horario: o.human }))
    : { sem_horario: "não há horários livres nos próximos dias" };
}

async function book(ctx: ToolCtx, args: Record<string, unknown>) {
  const { slug, offered } = await agenda(ctx);
  const choice = resolveSlotChoice(args["slot"], offered);
  if (!choice)
    throw new ToolError("esse horário não está na agenda livre; consulte availability de novo");
  return simulatedOrReal(ctx, { simulado: true, marcado: choice.human }, async () => {
    const { bookForContact } = await import("@/backend/booking.server");
    await bookForContact({
      slug,
      start: choice.start,
      contactId: requireContact(ctx),
      source: "Equipe de IA",
      note: "Marcada pela IA na conversa.",
    });
    return { marcado: choice.human, link: "o convite com o link chega por mensagem" };
  });
}

async function reschedule(ctx: ToolCtx, args: Record<string, unknown>) {
  const contactId = requireContact(ctx);
  const db = admin();
  const { data: m } = await db
    .from("meetings")
    .select("*")
    .eq("account_id", ctx.accountId)
    .eq("contact_id", contactId)
    .eq("status", "scheduled")
    .gte("scheduled_start", new Date().toISOString())
    .order("scheduled_start")
    .limit(1)
    .maybeSingle();
  if (!m) throw new ToolError("o cliente não tem reunião futura marcada");
  const { rescheduleSlots } = await import("@/backend/booking.server");
  const start = typeof args["start"] === "string" ? args["start"] : "";
  if (!start) {
    const { slots } = await rescheduleSlots(m as never);
    return {
      atual: m.scheduled_start,
      livres: offerSlots(slots, 6).map((o) => ({ inicio: o.start, horario: o.human })),
    };
  }
  return simulatedOrReal(ctx, { simulado: true, remarcado: start }, async () => {
    const { manageUrl } = await import("@/backend/meetings.server");
    const { rescheduleByGuest } = await import("@/backend/meeting-manage.server");
    const token = (await manageUrl(m.id, m.scheduled_end)).split("/reuniao/")[1] ?? "";
    await rescheduleByGuest(token, start);
    return { remarcado: start };
  });
}

async function getInvoices(ctx: ToolCtx) {
  if (!ctx.contactId) return { cobrancas: [] };
  const { data } = await admin()
    .from("payments")
    .select("description, amount, billing_type, status, due_date, invoice_url, paid_at")
    .eq("account_id", ctx.accountId)
    .eq("contact_id", ctx.contactId)
    .order("due_date", { ascending: false })
    .limit(10);
  return { cobrancas: data ?? [] };
}

async function createCharge(ctx: ToolCtx, args: Record<string, unknown>) {
  const amount = Number(args["amount"]);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000)
    throw new ToolError("valor inválido");
  const billing = args["billing_type"] === "BOLETO" ? "BOLETO" : "PIX";
  const description = need(args["description"], "a descrição").slice(0, 200);
  return simulatedOrReal(
    ctx,
    { simulado: true, link: "https://exemplo.invalid/cobranca" },
    async () => {
      const contactId = requireContact(ctx);
      const { data: c } = await admin()
        .from("contacts")
        .select("name, email, phone, custom")
        .eq("id", contactId)
        .maybeSingle();
      const doc =
        String(args["document"] ?? "") ||
        String(
          ((c?.custom ?? {}) as Record<string, unknown>)["cpf"] ??
            ((c?.custom ?? {}) as Record<string, unknown>)["cnpj"] ??
            "",
        );
      if (!doc.replace(/\D/g, ""))
        throw new ToolError("preciso do CPF ou CNPJ do cliente para gerar a cobrança");
      const { createCharges } = await import("@/backend/commerce.server");
      const r = await createCharges({
        accountId: ctx.accountId,
        dealId: null,
        proposalId: null,
        contactId,
        customer: {
          name: c?.name ?? "Cliente",
          document: doc,
          email: c?.email ?? null,
          phone: c?.phone ?? null,
        },
        billingType: billing,
        oneTime: amount,
        monthly: 0,
        yearly: 0,
        description,
        dueDays: Math.max(1, Math.min(30, Number(args["due_days"]) || 3)),
      });
      return { cobrancas: r };
    },
  );
}

async function createActivity(ctx: ToolCtx, title: string, dueHours: number, body: string | null) {
  const contactId = requireContact(ctx);
  const db = admin();
  const { data: c } = await db
    .from("contacts")
    .select("owner_user_id")
    .eq("id", contactId)
    .maybeSingle();
  const { error } = await db.from("activities").insert({
    account_id: ctx.accountId,
    contact_id: contactId,
    type: "task",
    title: title.slice(0, 200),
    body,
    due_at: new Date(Date.now() + dueHours * 3600_000).toISOString(),
    user_id: c?.owner_user_id ?? null,
  } as never);
  if (error) throw new ToolError(`não criou a tarefa: ${error.message}`);
}

async function promiseToPay(ctx: ToolCtx, args: Record<string, unknown>) {
  const date = need(args["date"], "a data");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ToolError("data no formato AAAA-MM-DD");
  const amount = Number(args["amount"]) || null;
  return simulatedOrReal(ctx, { simulado: true, registrado: date }, async () => {
    const hours = Math.max(
      1,
      (new Date(`${date}T12:00:00-03:00`).getTime() - Date.now()) / 3600_000 + 24,
    );
    await createActivity(
      ctx,
      `Conferir pagamento prometido para ${date.split("-").reverse().join("/")}`,
      hours,
      amount ? `Valor prometido: R$ ${amount.toFixed(2).replace(".", ",")}` : null,
    );
    return { registrado: date };
  });
}

async function health(ctx: ToolCtx) {
  if (!ctx.contactId) return { sem_cliente: true };
  const db = admin();
  const [{ data: t }, { data: cs }, { data: nps }, { data: pays }, { data: c }] = await Promise.all(
    [
      db
        .from("tickets")
        .select("priority")
        .eq("contact_id", ctx.contactId)
        .in("status", ["open", "pending", "waiting_customer"]),
      db
        .from("csat_responses")
        .select("score")
        .eq("contact_id", ctx.contactId)
        .not("score", "is", null)
        .limit(10),
      db
        .from("agent_survey_answers")
        .select("score")
        .eq("contact_id", ctx.contactId)
        .eq("kind", "nps")
        .order("created_at", { ascending: false })
        .limit(1),
      db
        .from("payments")
        .select("status, due_date")
        .eq("contact_id", ctx.contactId)
        .eq("status", "overdue"),
      db.from("contacts").select("last_interaction_at").eq("id", ctx.contactId).maybeSingle(),
    ],
  );
  const scores = (cs ?? []).map((x) => Number(x.score)).filter(Number.isFinite);
  return healthScore({
    openTickets: (t ?? []).length,
    urgentTickets: (t ?? []).filter((x) => x.priority === "urgent").length,
    avgCsat: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
    lastNps: nps?.[0] ? Number(nps[0].score) : null,
    overduePayments: (pays ?? []).length,
    daysSinceLastContact: c?.last_interaction_at
      ? Math.floor((Date.now() - new Date(c.last_interaction_at).getTime()) / 86_400_000)
      : null,
  });
}

const CONTACT_COLUMNS = new Set(["email", "company", "job_title", "city", "phone", "name"]);

async function saveFields(ctx: ToolCtx, args: Record<string, unknown>) {
  const fields = (
    args["fields"] && typeof args["fields"] === "object" ? args["fields"] : {}
  ) as Record<string, unknown>;
  const allowed = new Set(agentSettingsV2(ctx.agentSettings).form_fields.map((f) => f.key));
  const accepted: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields)) {
    const val = String(v ?? "")
      .trim()
      .slice(0, 300);
    if (!val || !allowed.has(k)) continue;
    if (k === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(val)) continue;
    accepted[k] = val;
  }
  if (!Object.keys(accepted).length)
    throw new ToolError("nenhum campo do formulário com valor válido");
  return simulatedOrReal(ctx, { simulado: true, gravados: Object.keys(accepted) }, async () => {
    const contactId = requireContact(ctx);
    const db = admin();
    const { data: c } = await db
      .from("contacts")
      .select("custom")
      .eq("id", contactId)
      .maybeSingle();
    const patch: Record<string, unknown> = {};
    const custom = { ...((c?.custom ?? {}) as Record<string, unknown>) };
    for (const [k, v] of Object.entries(accepted)) {
      if (CONTACT_COLUMNS.has(k)) patch[k] = k === "email" ? v.toLowerCase() : v;
      else if (k.startsWith("custom.")) custom[k.slice(7)] = v;
    }
    const { error } = await db
      .from("contacts")
      .update({ ...patch, custom } as never)
      .eq("id", contactId);
    if (error) throw new ToolError(`não gravou: ${error.message}`);
    if (ctx.conversationId) {
      const { data: st } = await db
        .from("agent_conversation_state")
        .select("collected")
        .eq("conversation_id", ctx.conversationId)
        .maybeSingle();
      await db.from("agent_conversation_state").upsert(
        {
          conversation_id: ctx.conversationId,
          account_id: ctx.accountId,
          collected: {
            ...((st?.collected ?? {}) as Record<string, unknown>),
            ...accepted,
          } as never,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "conversation_id" },
      );
    }
    return { gravados: Object.keys(accepted) };
  });
}

async function recordSurvey(ctx: ToolCtx, args: Record<string, unknown>) {
  const kind = args["kind"] === "csat" ? "csat" : "nps";
  const check = checkSurveyScore(kind, Number(args["score"]), ctx.lastCustomerText);
  if (!check.ok) throw new ToolError(`não registrei: ${check.reason}`);
  return simulatedOrReal(ctx, { simulado: true, nota: check.score }, async () => {
    const db = admin();
    await db.from("agent_survey_answers").insert({
      account_id: ctx.accountId,
      conversation_id: ctx.conversationId,
      contact_id: ctx.contactId,
      agent_id: ctx.agentId,
      kind,
      score: check.score,
      comment: typeof args["comment"] === "string" ? args["comment"].slice(0, 2000) : null,
    });
    if (ctx.conversationId)
      await db.from("agent_conversation_state").upsert(
        {
          conversation_id: ctx.conversationId,
          account_id: ctx.accountId,
          survey: { answered_at: new Date().toISOString(), kind, score: check.score },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "conversation_id" },
      );
    return { nota: check.score };
  });
}

export async function notifyManagers(
  accountId: string,
  title: string,
  body: string,
  link: string | null,
) {
  const db = admin();
  const { data: managers } = await db
    .from("memberships")
    .select("user_id")
    .eq("account_id", accountId)
    .eq("is_active", true)
    .in("role", ["owner", "admin", "manager"]);
  for (const m of managers ?? [])
    await db.rpc("notify_user", {
      _account: accountId,
      _user: m.user_id,
      _kind: "ai_supervisor",
      _title: title.slice(0, 200),
      _body: body.slice(0, 500),
      ...(link ? { _link: link } : {}),
    });
  return (managers ?? []).length;
}

async function flag(ctx: ToolCtx, args: Record<string, unknown>) {
  if (!ctx.conversationId && !ctx.dryRun) throw new ToolError("sem conversa para marcar");
  const kind = ["stuck", "angry", "bad_promise"].includes(String(args["kind"]))
    ? String(args["kind"])
    : "stuck";
  const detail = need(args["detail"], "o motivo").slice(0, 600);
  return simulatedOrReal(ctx, { simulado: true, marcado: kind }, async () => {
    // erro de verdade lança: o modelo recebe ERRO e não diz ao cliente que marcou
    const { openFlag } = await import("./flags.server");
    const r = await openFlag({
      account_id: ctx.accountId,
      conversation_id: ctx.conversationId!,
      kind,
      detail,
    });
    return { marcado: kind, ja_estava_aberta: !r.created };
  });
}

async function notifyManager(ctx: ToolCtx, args: Record<string, unknown>) {
  const message = need(args["message"], "o aviso");
  return simulatedOrReal(ctx, { simulado: true, avisados: 1 }, async () => ({
    avisados: await notifyManagers(
      ctx.accountId,
      "A IA pediu sua atenção",
      message,
      ctx.conversationId ? `/inbox/${ctx.conversationId}` : null,
    ),
  }));
}

type Impl = (ctx: ToolCtx, args: Record<string, unknown>) => Promise<unknown>;

const IMPL: Record<string, Impl> = {
  identify_contact: identifyContact,
  kb_search: kbSearch,
  open_ticket: openTicket,
  create_deal: createDeal,
  score_lead: scoreLead,
  enroll_sequence: enrollSequence,
  availability,
  book,
  reschedule,
  get_invoices: getInvoices,
  asaas_create_charge: createCharge,
  promise_to_pay: promiseToPay,
  health_score: health,
  create_task: async (ctx, args) => {
    const title = need(args["title"], "o título");
    return simulatedOrReal(ctx, { simulado: true, criada: true }, async () => {
      await createActivity(ctx, title, Math.max(1, Number(args["due_in_hours"]) || 24), null);
      return { criada: true };
    });
  },
  save_fields: saveFields,
  record_survey: recordSurvey,
  flag,
  notify_manager: notifyManager,
};

export function implementedTools(): Set<string> {
  return new Set(Object.keys(IMPL));
}

/** Executa uma chamada pedida pelo modelo e registra. Nunca lança: o erro volta para o modelo. */
export async function runTool(ctx: ToolCtx, call: ToolCall): Promise<ToolOutcome> {
  const started = Date.now();
  const isComposio = ctx.composioSlugs.has(call.name);
  let out: ToolOutcome;
  let logId: string | null = null;
  try {
    if (ctx.failTool && ctx.failTool === call.name)
      throw new ToolError("serviço indisponível no momento (falha simulada na avaliação)");
    if (isComposio) {
      if (ctx.dryRun) out = { ok: true, data: { simulado: true, acao: call.name }, error: null };
      else {
        const { executeAction } = await import("./composio.server");
        const r = await executeAction(ctx.accountId, call.name, call.args);
        logId = r.logId;
        out = { ok: r.ok, data: r.data, error: r.error };
      }
    } else {
      const impl = IMPL[call.name];
      if (!impl || !internalTool(call.name))
        throw new ToolError(`ferramenta ${call.name} não existe`);
      out = { ok: true, data: await impl(ctx, call.args), error: null };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    out = {
      ok: false,
      data: null,
      error: err instanceof ToolError ? msg : `falhou: ${msg.slice(0, 300)}`,
    };
  }
  await admin()
    .from("agent_tool_calls")
    .insert({
      account_id: ctx.accountId,
      agent_id: ctx.agentId,
      conversation_id: ctx.conversationId,
      run_id: ctx.runId,
      eval_run_id: ctx.evalRunId,
      kind: isComposio ? "composio" : "internal",
      tool: call.name.slice(0, 120),
      args: call.args as never,
      result: (out.ok ? out.data : null) as never,
      ok: out.ok,
      error: out.error,
      dry_run: ctx.dryRun,
      latency_ms: Date.now() - started,
      external_log_id: logId,
    });
  return out;
}
