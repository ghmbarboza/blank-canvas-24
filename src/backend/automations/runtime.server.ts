// Executor das automações: monta os fatos do contato, roda o motor puro (engine.ts) e aplica as ações.
import { admin } from "@/backend/http.server";
import { publicFetch } from "@/backend/net-guard.server";
import type { JobPayloads } from "@/backend/jobs/contract";
import {
  DEFAULT_EXIT,
  DEFAULT_GUARDS,
  EMPTY_FACTS,
  EXIT_LABEL,
  OUTREACH,
  checkExit,
  isStaleStep,
  planStep,
  startOfDay,
  type ExitRules,
  type Facts,
  type Graph,
  type Guards,
  type StepAction,
} from "@/features/automations/engine";
import {
  addDays,
  avaliacoesOf,
  fillReviewLink,
  formatDay,
  hasReviewLinkVar,
  prazosOf,
  purchaseDateOf,
  todayIso,
  withReview,
} from "@/features/posvenda/moment";
import { dailyCapOf } from "@/features/posvenda/rules";
import type { Json, Tables } from "@/integrations/supabase/types";

type Automation = Tables<"automations">;
type Run = Tables<"automation_runs">;
type Contact = Tables<"contacts">;

const MAX_HOPS = 25;

async function enqueue<K extends keyof JobPayloads>(
  accountId: string,
  kind: K,
  payload: JobPayloads[K],
  runAt?: Date,
  dedupe?: string,
) {
  const { error } = await admin().rpc("enqueue_job", {
    _account: accountId,
    _kind: kind,
    _payload: payload as unknown as Json,
    ...(runAt ? { _run_at: runAt.toISOString() } : {}),
    ...(dedupe ? { _dedupe: dedupe } : {}),
  });
  if (error) throw new Error(`enqueue ${kind}: ${error.message}`);
}

export function scheduleStep(
  accountId: string,
  runId: string,
  seq: number,
  at: Date,
  wake = false,
) {
  return enqueue(
    accountId,
    "automation.step",
    { run_id: runId, seq, ...(wake ? { wake: true } : {}) },
    at,
    wake ? `auto:wake:${runId}:${seq}` : `auto:${runId}:${seq}`,
  );
}

async function log(
  run: Pick<Run, "id" | "account_id" | "automation_id" | "contact_id">,
  nodeId: string | null,
  nodeType: string | null,
  status: string,
  message: string,
  data: Record<string, unknown> = {},
) {
  await admin()
    .from("automation_logs")
    .insert({
      account_id: run.account_id,
      automation_id: run.automation_id,
      run_id: run.id,
      contact_id: run.contact_id,
      node_id: nodeId,
      node_type: nodeType,
      status,
      message: message.slice(0, 500),
      data: data as Json,
    });
}

// ------------------------------------------------------------------ fatos do contato

async function eventSince(
  accountId: string,
  contactId: string,
  types: string[],
  since: string,
): Promise<boolean> {
  const { count } = await admin()
    .from("domain_events")
    .select("id", { count: "exact", head: true })
    .eq("account_id", accountId)
    .in("type", types)
    .gte("created_at", since)
    .contains("payload", { contact_id: contactId });
  return (count ?? 0) > 0;
}

export async function buildFacts(run: Run, contact: Contact): Promise<Facts> {
  const db = admin();
  const since = run.enrolled_at;
  const { data: convs } = await db.from("conversations").select("id").eq("contact_id", contact.id);
  const convIds = (convs ?? []).map((c) => c.id);
  const replied = convIds.length
    ? ((
        await db
          .from("messages")
          .select("id", { count: "exact", head: true })
          .in("conversation_id", convIds)
          .eq("direction", "in")
          .gte("created_at", since)
      ).count ?? 0) > 0
    : false;
  const [opened, clicked, meetingEv, unsubEv] = await Promise.all([
    eventSince(contact.account_id, contact.id, ["email.opened", "email.clicked"], since),
    eventSince(contact.account_id, contact.id, ["email.clicked"], since),
    eventSince(contact.account_id, contact.id, ["meeting.scheduled"], since),
    eventSince(contact.account_id, contact.id, ["email.unsubscribed"], since),
  ]);
  const meetingRow =
    ((
      await db
        .from("events")
        .select("id", { count: "exact", head: true })
        .eq("contact_id", contact.id)
        .gte("created_at", since)
        .neq("status", "canceled")
    ).count ?? 0) > 0;
  const lost = run.deal_id
    ? (await db.from("deals").select("status").eq("id", run.deal_id).maybeSingle()).data?.status ===
      "lost"
    : ((
        await db
          .from("deals")
          .select("id", { count: "exact", head: true })
          .eq("contact_id", contact.id)
          .eq("status", "lost")
          .gte("updated_at", since)
      ).count ?? 0) > 0;
  const email = contact.email?.toLowerCase() ?? "";
  const supp = email
    ? ((
        await db
          .from("suppressions")
          .select("id", { count: "exact", head: true })
          .eq("account_id", contact.account_id)
          .eq("channel", "email")
          .eq("address", email)
          .in("reason", ["unsubscribe", "complaint"])
      ).count ?? 0) > 0
    : false;
  return {
    ...EMPTY_FACTS,
    replied_since_enroll: replied,
    email_opened: opened,
    email_clicked: clicked,
    meeting_scheduled: meetingEv || meetingRow,
    customer: contact.lifecycle === "customer",
    unsubscribed: unsubEv || supp,
    deal_lost: lost,
    score: contact.score,
    lifecycle: contact.lifecycle,
    temperature: contact.temperature,
    tags: contact.tags ?? [],
    fields: {
      ...((contact.custom as Record<string, unknown>) ?? {}),
      lifecycle: contact.lifecycle,
      source: contact.source,
      city: contact.city,
    },
  };
}

async function sentThisWeek(contactId: string): Promise<number> {
  const { count } = await admin()
    .from("automation_logs")
    .select("id", { count: "exact", head: true })
    .eq("contact_id", contactId)
    .eq("status", "ok")
    .in("node_type", OUTREACH)
    .gte("created_at", new Date(Date.now() - 7 * 86_400_000).toISOString());
  return count ?? 0;
}

/** WhatsApp que as automações da conta já mandaram hoje (teto do dia, edição de pós-venda). */
async function whatsappSentToday(accountId: string, tz: string): Promise<number> {
  const { count } = await admin()
    .from("automation_logs")
    .select("id", { count: "exact", head: true })
    .eq("account_id", accountId)
    .eq("status", "ok")
    .eq("node_type", "whatsapp")
    .gte("created_at", startOfDay(new Date(), tz).toISOString());
  return count ?? 0;
}

const SURVEY_NAME = "Pesquisa de pós-venda";

/**
 * Link da pesquisa de satisfação (NPS que já existe) para este contato. Usa a pesquisa permanente
 * "Pesquisa de pós-venda" da conta (cria na primeira vez). null = o contato já respondeu.
 */
async function surveyLink(accountId: string, contactId: string): Promise<string | null> {
  const db = admin();
  let { data: survey } = await db
    .from("nps_surveys")
    .select("id")
    .eq("account_id", accountId)
    .eq("name", SURVEY_NAME)
    .neq("status", "closed")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!survey) {
    const created = await db
      .from("nps_surveys")
      .insert({
        account_id: accountId,
        name: SURVEY_NAME,
        channel: "whatsapp",
        status: "sent",
        sent_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (created.error) throw new Error(`Pesquisa: ${created.error.message}`);
    survey = created.data;
  }
  const { data: prior } = await db
    .from("nps_responses")
    .select("token, answered_at")
    .eq("survey_id", survey.id)
    .eq("contact_id", contactId)
    .maybeSingle();
  if (prior?.answered_at) return null;
  let token = prior?.token ?? null;
  if (!token) {
    const row = await db
      .from("nps_responses")
      .insert({ account_id: accountId, survey_id: survey.id, contact_id: contactId })
      .select("token")
      .single();
    if (row.error) throw new Error(`Pesquisa: ${row.error.message}`);
    token = row.data.token;
    const { count } = await db
      .from("nps_responses")
      .select("id", { count: "exact", head: true })
      .eq("survey_id", survey.id);
    await db
      .from("nps_surveys")
      .update({ sent_count: count ?? 0 })
      .eq("id", survey.id);
  }
  const { appBaseUrl } = await import("@/backend/http.server");
  return `${appBaseUrl()}/nps/${token}`;
}

// ------------------------------------------------------------------ variáveis e ações

export function fillVars(text: string, c: Contact, ownerName: string | null): string {
  const first = (c.name ?? "").trim().split(/\s+/)[0] ?? "";
  const map: Record<string, string> = {
    nome: c.name ?? "",
    primeiro_nome: first,
    empresa: c.company ?? "",
    email: c.email ?? "",
    telefone: c.phone ?? "",
    cidade: c.city ?? "",
    vendedor: ownerName ?? "",
  };
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (m, k: string) => map[k.toLowerCase()] ?? m);
}

const POSVENDA_VAR = /\{\{\s*(link_avaliacao|fim_garantia)\s*\}\}/i;

/** Variáveis de pós-venda: link de avaliação no Google e data em que a garantia do cliente vence. */
async function fillPosvendaVars(
  text: string,
  accountId: string,
  contact: Contact,
): Promise<{ text: string; askedReview: boolean }> {
  const { data } = await admin()
    .from("accounts")
    .select("settings")
    .eq("id", accountId)
    .maybeSingle();
  const google = avaliacoesOf(data?.settings).google_url;
  const purchase = purchaseDateOf(contact.custom);
  const end = purchase
    ? formatDay(addDays(purchase, prazosOf(data?.settings).garantia_dias))
    : "o fim do prazo";
  const asked = hasReviewLinkVar(text) && Boolean(google);
  const out = fillReviewLink(text, google).replace(/\{\{\s*fim_garantia\s*\}\}/gi, end);
  return { text: out, askedReview: asked };
}

/** "Pedimos avaliação em dd/mm" no registro do cliente, quando a mensagem saiu com o link. */
async function logReviewRequest(contact: Contact) {
  const today = todayIso();
  const custom = withReview(contact.custom, {
    id: `pedido-${today}`,
    kind: "pedido",
    at: today,
    via: "regra",
  });
  const { error } = await admin()
    .from("contacts")
    .update({ custom: custom as Json })
    .eq("id", contact.id);
  if (error) console.error("[posvenda] pedido de avaliação não registrado", error.message);
}

function escapeHtml(s: string) {
  return s.replace(
    /[&<>"']/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!,
  );
}

export function textToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map(
      (p) =>
        `<p style="margin:0 0 14px;line-height:1.55">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`,
    )
    .join("");
}

async function ownerName(userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const { data } = await admin()
    .from("profiles")
    .select("full_name")
    .eq("id", userId)
    .maybeSingle();
  return data?.full_name ?? null;
}

export async function createTask(accountId: string, p: JobPayloads["task.create"]) {
  const db = admin();
  let userId = p.user_id ?? null;
  if (!userId && p.contact_id)
    userId =
      (await db.from("contacts").select("owner_user_id").eq("id", p.contact_id).maybeSingle()).data
        ?.owner_user_id ?? null;
  if (!userId) {
    const { data: m } = await db
      .from("memberships")
      .select("user_id, role")
      .eq("account_id", accountId)
      .eq("is_active", true)
      .in("role", ["owner", "admin", "manager"])
      .limit(1);
    userId = m?.[0]?.user_id ?? null;
  }
  if (!userId) throw new Error("Ninguém para receber a tarefa");
  const due = new Date(Date.now() + Math.max(0, p.due_in_minutes ?? 0) * 60_000).toISOString();
  const { data, error } = await db
    .from("activities")
    .insert({
      account_id: accountId,
      contact_id: p.contact_id ?? null,
      deal_id: p.deal_id ?? null,
      user_id: userId,
      type: p.type,
      title: p.title.slice(0, 200),
      due_at: due,
    })
    .select("id")
    .single();
  if (error) throw new Error(`Tarefa: ${error.message}`);
  return { activity_id: data.id, user_id: userId };
}

async function targetDeal(run: Run): Promise<{ id: string } | null> {
  if (run.deal_id) return { id: run.deal_id };
  const { data } = await admin()
    .from("deals")
    .select("id")
    .eq("contact_id", run.contact_id)
    .eq("status", "open")
    .order("updated_at", { ascending: false })
    .limit(1);
  return data?.[0] ?? null;
}

async function applyAction(
  a: StepAction,
  run: Run,
  contact: Contact,
  automation: Automation,
): Promise<string> {
  const db = admin();
  const owner = await ownerName(contact.owner_user_id);
  const cfg = "config" in a ? a.config : {};
  const str = (k: string) => (typeof cfg[k] === "string" ? (cfg[k] as string) : "");
  switch (a.kind) {
    case "send": {
      if (a.channel === "email") {
        if (!contact.email) return "Sem e-mail: pulado";
        const body = fillVars(str("body"), contact, owner);
        await enqueue(run.account_id, "email.send", {
          to_email: contact.email,
          to_contact_id: contact.id,
          subject: fillVars(str("subject"), contact, owner),
          html: str("html") ? fillVars(str("html"), contact, owner) : textToHtml(body),
          text: body,
          category: str("category") === "transactional" ? "transactional" : "marketing",
          automation_run_id: run.id,
          template_id: str("template_id") || null,
        });
        return "E-mail enfileirado";
      }
      if (a.channel === "whatsapp") {
        const tpl = str("template_name");
        let waText = str("text") ? fillVars(str("text"), contact, owner) : null;
        // Pesquisa de satisfação: o texto leva o link pessoal de resposta ({{link_pesquisa}}).
        if (cfg["survey"] === "nps" && waText) {
          const link = await surveyLink(run.account_id, contact.id);
          if (!link) return "Já respondeu a pesquisa: pulado";
          waText = /\{\{\s*link_pesquisa\s*\}\}/i.test(waText)
            ? waText.replace(/\{\{\s*link_pesquisa\s*\}\}/gi, link)
            : `${waText} ${link}`;
        }
        // Pós-venda: {{link_avaliacao}} vira o link do Google da empresa e {{fim_garantia}} a data.
        let askedReview = false;
        if (waText && POSVENDA_VAR.test(waText)) {
          const filled = await fillPosvendaVars(waText, run.account_id, contact);
          waText = filled.text;
          askedReview = filled.askedReview;
        }
        await enqueue(run.account_id, "whatsapp.send", {
          contact_id: contact.id,
          text: waText,
          template: tpl
            ? {
                name: tpl,
                language: str("template_language") || "pt_BR",
                params: (Array.isArray(cfg["template_params"])
                  ? (cfg["template_params"] as string[])
                  : []
                ).map((p) => fillVars(p, contact, owner)),
              }
            : null,
          category:
            str("category") === "service"
              ? "service"
              : str("category") === "utility"
                ? "utility"
                : "marketing",
          automation_run_id: run.id,
        });
        if (askedReview) await logReviewRequest(contact);
        return "WhatsApp enfileirado";
      }
      if (a.channel === "sms") {
        await enqueue(run.account_id, "sms.send", {
          contact_id: contact.id,
          text: fillVars(str("text"), contact, owner),
          automation_run_id: run.id,
        });
        return "SMS enfileirado";
      }
      await enqueue(run.account_id, "voice.call", {
        contact_id: contact.id,
        voice_agent_id: str("voice_agent_id"),
        context: { automation: automation.name, goal: str("goal") },
        automation_run_id: run.id,
      });
      return "Ligação da IA enfileirada";
    }
    case "task": {
      await createTask(run.account_id, {
        contact_id: contact.id,
        deal_id: run.deal_id,
        user_id: str("user_id") || null,
        title: fillVars(str("title"), contact, owner),
        type: (["task", "call", "email", "whatsapp", "meeting"].includes(str("type"))
          ? str("type")
          : "task") as JobPayloads["task.create"]["type"],
        due_in_minutes: Number(cfg["due_in_minutes"] ?? 0),
      });
      return "Tarefa criada";
    }
    case "ticket": {
      let description = fillVars(str("description"), contact, owner);
      if (cfg["include_survey"] === true) {
        const { data: last } = await db
          .from("nps_responses")
          .select("score, comment")
          .eq("contact_id", contact.id)
          .not("answered_at", "is", null)
          .order("answered_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (last)
          description = [
            description,
            `Nota na pesquisa: ${last.score}.`,
            last.comment ? `O que o cliente escreveu: ${last.comment}` : "",
          ]
            .filter(Boolean)
            .join("\n");
      }
      const priority = ["low", "normal", "high", "urgent"].includes(str("priority"))
        ? str("priority")
        : "normal";
      const { data: ticket, error } = await db
        .from("tickets")
        .insert({
          account_id: run.account_id,
          subject: (fillVars(str("subject"), contact, owner) || "Chamado da automação").slice(
            0,
            200,
          ),
          description: description.slice(0, 4000),
          priority,
          source: "api",
          contact_id: contact.id,
          owner_user_id: contact.owner_user_id,
        } as never)
        .select("number")
        .single();
      if (error) throw new Error(`Chamado: ${error.message}`);
      return `Chamado #${(ticket as { number: number }).number} aberto`;
    }
    case "move_stage": {
      const deal = await targetDeal(run);
      if (!deal) return "Sem negócio aberto: pulado";
      const { data: stage } = await db
        .from("pipeline_stages")
        .select("id, pipeline_id")
        .eq("id", a.stage_id)
        .eq("account_id", run.account_id)
        .maybeSingle();
      if (!stage) return "Etapa não existe mais";
      await db
        .from("deals")
        .update({ stage_id: stage.id, pipeline_id: stage.pipeline_id })
        .eq("id", deal.id);
      return "Negócio movido";
    }
    case "assign": {
      const users = Array.isArray(cfg["users"]) ? (cfg["users"] as string[]) : [];
      if (users.length === 0) return "Ninguém na lista: pulado";
      const cursor = Number((automation.trigger as Record<string, unknown>)["rr_cursor"] ?? 0);
      const pick = users[cursor % users.length]!;
      await db
        .from("automations")
        .update({
          trigger: {
            ...(automation.trigger as Record<string, unknown>),
            rr_cursor: cursor + 1,
          } as Json,
        })
        .eq("id", automation.id);
      await db.from("contacts").update({ owner_user_id: pick }).eq("id", contact.id);
      await db
        .from("deals")
        .update({ owner_user_id: pick })
        .eq("contact_id", contact.id)
        .eq("status", "open");
      return "Responsável atribuído";
    }
    case "tag": {
      const tags = new Set(contact.tags ?? []);
      if (a.add) tags.add(a.tag);
      else tags.delete(a.tag);
      await db
        .from("contacts")
        .update({ tags: [...tags] })
        .eq("id", contact.id);
      contact.tags = [...tags];
      return a.add ? `Etiqueta "${a.tag}"` : `Etiqueta "${a.tag}" removida`;
    }
    case "set_field": {
      const direct = ["lifecycle", "temperature", "source", "city", "job_title"];
      if (direct.includes(a.field))
        await db
          .from("contacts")
          .update({ [a.field]: a.value as string } as never)
          .eq("id", contact.id);
      else {
        const custom = {
          ...((contact.custom as Record<string, unknown>) ?? {}),
          [a.field.replace(/^custom\./, "")]: a.value,
        };
        await db
          .from("contacts")
          .update({ custom: custom as Json })
          .eq("id", contact.id);
      }
      return "Campo preenchido";
    }
    case "ai_toggle":
      await db.from("conversations").update({ ai_enabled: a.enabled }).eq("contact_id", contact.id);
      return a.enabled ? "IA ligada nas conversas" : "IA desligada nas conversas";
    case "webhook": {
      // a URL vem do grafo que o gestor desenha: só endereço público, sem redirecionamento (R8)
      const res = await publicFetch(
        a.url,
        {
          method: "POST",
          headers: { "content-type": "application/json", "user-agent": "Vinculo-Automations/1.0" },
          body: JSON.stringify({
            automation: { id: automation.id, name: automation.name },
            contact: {
              id: contact.id,
              name: contact.name,
              email: contact.email,
              phone: contact.phone,
            },
          }),
          signal: AbortSignal.timeout(8_000),
        },
        { httpsOnly: true },
      );
      return `Webhook respondeu ${res.status}`;
    }
    case "notify": {
      const target = str("user_id") || contact.owner_user_id;
      if (!target) return "Contato sem responsável: aviso não enviado";
      await db.rpc("notify_user", {
        _account: run.account_id,
        _user: target,
        _kind: "automation",
        _title: fillVars(str("title"), contact, owner).slice(0, 200),
        _body: fillVars(str("body"), contact, owner) || `Automação: ${automation.name}`,
        _link: `/contatos/${contact.id}`,
      });
      return "Equipe avisada";
    }
    case "ai_agent": {
      const { automationCallAgent } = await import("@/backend/agents/automation.server");
      return automationCallAgent({
        accountId: run.account_id,
        contactId: contact.id,
        automationName: automation.name,
        agentId: str("agent_id"),
        goal: fillVars(str("goal"), contact, owner),
        startConversation: cfg["start_conversation"] === true,
      });
    }
    case "composio": {
      const { automationComposioAction, fillDeep, parseArgs } =
        await import("@/backend/agents/automation.server");
      return automationComposioAction({
        accountId: run.account_id,
        contactId: contact.id,
        toolSlug: str("tool_slug"),
        args: fillDeep(parseArgs(cfg["arguments"]), (t) => fillVars(t, contact, owner)) as Record<
          string,
          unknown
        >,
      });
    }
  }
}

// ------------------------------------------------------------------ passo

async function consentFor(contactId: string) {
  const cache = new Map<string, boolean>();
  const channels = ["email", "whatsapp", "sms", "voice"] as const;
  await Promise.all(
    channels.map(async (ch) => {
      const { data } = await admin().rpc("can_contact", { _contact: contactId, _channel: ch });
      cache.set(ch, data !== false);
    }),
  );
  return (ch: string) => cache.get(ch) ?? false;
}

export async function finishRun(
  run: Run,
  status: "done" | "exited" | "failed",
  reason: string | null,
) {
  await admin()
    .from("automation_runs")
    .update({
      status,
      exit_reason: reason,
      finished_at: new Date().toISOString(),
      next_at: null,
      step_seq: run.step_seq + 1,
    })
    .eq("id", run.id);
  await log(
    run,
    run.current_node,
    null,
    status === "exited" ? "exited" : status === "failed" ? "failed" : "ok",
    status === "exited"
      ? `Saiu: ${EXIT_LABEL[reason as keyof typeof EXIT_LABEL] ?? reason}`
      : status === "done"
        ? "Concluiu"
        : `Falhou: ${reason}`,
  );
}

export async function runStep(
  payload: JobPayloads["automation.step"],
): Promise<Record<string, unknown>> {
  const db = admin();
  const { data: run } = await db
    .from("automation_runs")
    .select("*")
    .eq("id", payload.run_id)
    .maybeSingle();
  if (!run) return { skipped: "inscrição não existe" };
  if (isStaleStep(payload.seq, run.step_seq, run.status))
    return { skipped: "passo antigo ou inscrição encerrada" };
  const { data: automation } = await db
    .from("automations")
    .select("*")
    .eq("id", run.automation_id)
    .single();
  if (!automation) return { skipped: "automação removida" };
  if (automation.status !== "active") {
    await db.from("automation_runs").update({ status: "paused" }).eq("id", run.id);
    return { paused: "automação não está ativa" };
  }
  const { data: contact } = await db
    .from("contacts")
    .select("*")
    .eq("id", run.contact_id)
    .maybeSingle();
  if (!contact) {
    await finishRun(run, "failed", "contato removido");
    return { failed: "contato removido" };
  }
  const { data: account } = await db
    .from("accounts")
    .select("timezone, settings")
    .eq("id", run.account_id)
    .single();
  const tz = account?.timezone || "America/Sao_Paulo";
  const dailyCap = dailyCapOf(account?.settings);
  let sentToday = dailyCap > 0 ? await whatsappSentToday(run.account_id, tz) : 0;
  const graph = automation.graph as unknown as Graph;
  const exitRules = { ...DEFAULT_EXIT, ...((automation.exit_rules ?? {}) as Partial<ExitRules>) };
  const guards = { ...DEFAULT_GUARDS, ...((automation.guards ?? {}) as Partial<Guards>) };

  let facts = await buildFacts(run, contact);
  const exit = checkExit(exitRules, facts);
  if (exit) {
    await finishRun(run, "exited", exit);
    return { exited: exit };
  }

  let nodeId = run.current_node ?? graph.start;
  // Acordado por um evento durante uma espera de tempo: só reavalia a saída, não adianta o passo.
  const pendingNode = nodeId ? graph.nodes[nodeId] : undefined;
  if (
    payload.wake &&
    run.next_at &&
    new Date(run.next_at).getTime() > Date.now() &&
    pendingNode?.type !== "wait_event"
  ) {
    return { still_waiting: run.next_at };
  }
  let context = { ...((run.context as Record<string, unknown>) ?? {}) };
  const consent = await consentFor(contact.id);
  let sent = await sentThisWeek(contact.id);

  for (let hop = 0; hop < MAX_HOPS; hop++) {
    const node = nodeId ? graph.nodes[nodeId] : undefined;
    if (!node) {
      await db
        .from("automation_runs")
        .update({ context: context as Json, current_node: null })
        .eq("id", run.id);
      await finishRun({ ...run, current_node: nodeId }, "done", null);
      return { done: true, hops: hop };
    }
    const plan = planStep(node, {
      now: new Date(),
      tz,
      runId: run.id,
      guards,
      facts,
      sentThisWeek: sent,
      consent,
      runContext: context,
      dailyCap,
      sentToday,
    });
    context = { ...context, ...plan.contextPatch };
    let message = plan.log.message;
    let status: string = plan.log.status;
    if (plan.action) {
      try {
        message = await applyAction(plan.action, run, contact, automation);
        if (plan.action.kind === "send") {
          sent += 1;
          if (plan.action.channel === "whatsapp") sentToday += 1;
        }
      } catch (err) {
        status = "failed";
        message = `Falhou: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
    await log(run, node.id, node.type, status, message);

    if (plan.status === "done") {
      await db
        .from("automation_runs")
        .update({ context: context as Json, current_node: null })
        .eq("id", run.id);
      await finishRun({ ...run, current_node: node.id }, "done", null);
      return { done: true, hops: hop + 1 };
    }
    if (plan.status === "wait") {
      const seq = run.step_seq + 1;
      await db
        .from("automation_runs")
        .update({
          status: "waiting",
          current_node: plan.next,
          next_at: plan.at.toISOString(),
          step_seq: seq,
          context: context as Json,
        })
        .eq("id", run.id);
      await scheduleStep(run.account_id, run.id, seq, plan.at);
      return { waiting_until: plan.at.toISOString(), node: plan.next };
    }
    nodeId = plan.next;
    // Ações mudam o contato (etiqueta, campo): refaz os fatos antes de uma condição.
    if (plan.action && plan.action.kind !== "send") {
      const { data: fresh } = await db.from("contacts").select("*").eq("id", contact.id).single();
      if (fresh) {
        Object.assign(contact, fresh);
        facts = await buildFacts(run, contact);
      }
    }
  }
  // Muitos passos instantâneos seguidos: continua no próximo tick.
  const seq = run.step_seq + 1;
  await db
    .from("automation_runs")
    .update({
      status: "running",
      current_node: nodeId,
      step_seq: seq,
      context: context as Json,
      next_at: new Date().toISOString(),
    })
    .eq("id", run.id);
  await scheduleStep(run.account_id, run.id, seq, new Date());
  return { continued: nodeId };
}

// ------------------------------------------------------------------ inscrição

export interface EnrollResult {
  enrolled: number;
  skipped: number;
}

export async function enroll(
  automation: Pick<Automation, "id" | "account_id" | "graph" | "reentry">,
  contactIds: string[],
  opts: {
    source: string;
    userId?: string | null;
    dealId?: string | null;
    context?: Record<string, unknown>;
  },
): Promise<EnrollResult> {
  const db = admin();
  const graph = automation.graph as unknown as Graph;
  let enrolled = 0;
  let skipped = 0;
  const unique = [...new Set(contactIds)].slice(0, 5000);
  let prior = new Set<string>();
  if (automation.reentry !== "always" && unique.length) {
    const { data } = await db
      .from("automation_runs")
      .select("contact_id, status")
      .eq("automation_id", automation.id)
      .in("contact_id", unique.slice(0, 1000));
    prior = new Set(
      (data ?? [])
        .filter(
          (r) =>
            automation.reentry === "never" || ["running", "waiting", "paused"].includes(r.status),
        )
        .map((r) => r.contact_id),
    );
  }
  for (const contactId of unique) {
    if (prior.has(contactId)) {
      skipped += 1;
      continue;
    }
    const { data, error } = await db
      .from("automation_runs")
      .insert({
        account_id: automation.account_id,
        automation_id: automation.id,
        contact_id: contactId,
        deal_id: opts.dealId ?? null,
        current_node: graph.start,
        status: "running",
        source: opts.source,
        enrolled_by: opts.userId ?? null,
        context: (opts.context ?? {}) as Json,
      })
      .select("id, account_id, automation_id, contact_id")
      .single();
    if (error) {
      skipped += 1; // já está andando (índice único) ou contato de outra conta
      continue;
    }
    enrolled += 1;
    await log(data, null, null, "entered", `Entrou (${opts.source})`);
    await scheduleStep(automation.account_id, data.id, 0, new Date());
  }
  return { enrolled, skipped };
}

/** Acorda inscrições paradas de um contato (respondeu, agendou, abriu…): a saída e as esperas reavaliam. */
export async function wakeContactRuns(contactId: string) {
  const { data } = await admin()
    .from("automation_runs")
    .select("id, account_id, step_seq")
    .eq("contact_id", contactId)
    .eq("status", "waiting");
  for (const r of data ?? []) await scheduleStep(r.account_id, r.id, r.step_seq, new Date(), true);
  return (data ?? []).length;
}

export type { Run };
