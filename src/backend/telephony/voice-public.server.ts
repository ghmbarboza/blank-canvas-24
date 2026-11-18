// Webhooks públicos da ElevenLabs: início de conversa (contexto do CRM), ferramentas do agente
// e pós-chamada. Início e ferramentas usam o segredo da conta; pós-chamada usa HMAC.
import { HttpError, admin, isUuid, json } from "@/backend/http.server";
import { verifyElevenWebhook } from "@/backend/providers/elevenlabs.server";
import { detectSpokenOptOut, toE164 } from "@/features/telephony/lib";

import { accountContext, afterCallEnded, findContactByPhone, recordOptOut } from "./core.server";
import { assertToolSecret, crmVariables, postCallSecret } from "./voice.server";

function accountFrom(req: Request): string {
  const a = new URL(req.url).searchParams.get("a");
  if (!isUuid(a)) throw new HttpError(400, "Conta ausente", "bad_account");
  return a;
}

// ───────────────────────── início da conversa ─────────────────────────
export async function handleInit(req: Request): Promise<Response> {
  const accountId = accountFrom(req);
  await assertToolSecret(accountId, req.headers.get("x-nexus-tool-secret"));
  const agentRowId = new URL(req.url).searchParams.get("g");
  const body = (await req.json().catch(() => ({}))) as {
    caller_id?: string;
    called_number?: string;
    conversation_id?: string;
    agent_id?: string;
  };
  const db = admin();
  const caller = toE164(body.caller_id);
  const contact = await findContactByPhone(accountId, caller);
  const { data: agent } = isUuid(agentRowId)
    ? await db
        .from("voice_agents")
        .select("id, name")
        .eq("id", agentRowId)
        .eq("account_id", accountId)
        .maybeSingle()
    : { data: null };
  const vars = await crmVariables(accountId, contact?.id ?? null, agent?.name ?? "Assistente");
  if (body.conversation_id) {
    const { data: existing } = await db
      .from("calls")
      .select("id")
      .eq("el_conversation_id", body.conversation_id)
      .eq("account_id", accountId)
      .maybeSingle();
    if (!existing) {
      const { data: num } = await db
        .from("phone_numbers")
        .select("id")
        .eq("account_id", accountId)
        .eq("number", toE164(body.called_number) ?? "")
        .maybeSingle();
      await db.from("calls").insert({
        account_id: accountId,
        direction: "inbound",
        from_number: caller,
        to_number: toE164(body.called_number),
        contact_id: contact?.id ?? null,
        voice_agent_id: agent?.id ?? null,
        phone_number_id: num?.id ?? null,
        status: "in_progress",
        answered_at: new Date().toISOString(),
        el_conversation_id: body.conversation_id,
      });
    }
  }
  return json({
    type: "conversation_initiation_client_data",
    dynamic_variables: { ...vars, caller_phone: caller ?? "" },
  });
}

// ───────────────────────── ferramentas do agente ─────────────────────────
type ToolBody = Record<string, string | undefined>;

async function contactFor(accountId: string, b: ToolBody) {
  if (isUuid(b["contact_id"])) {
    const { data } = await admin()
      .from("contacts")
      .select("id, name, phone, owner_user_id, email")
      .eq("id", b["contact_id"])
      .eq("account_id", accountId)
      .maybeSingle();
    if (data) return data;
  }
  return findContactByPhone(accountId, b["caller_phone"] ?? b["system__caller_id"] ?? null);
}

async function freeSlots(
  accountId: string,
  ownerId: string | null,
  preference: string | undefined,
) {
  const ctx = await accountContext(accountId);
  const db = admin();
  const now = new Date();
  const until = new Date(now.getTime() + 7 * 86_400_000);
  let q = db
    .from("events")
    .select("starts_at, ends_at")
    .eq("account_id", accountId)
    .neq("status", "canceled")
    .gte("ends_at", now.toISOString())
    .lte("starts_at", until.toISOString());
  if (ownerId) q = q.eq("owner_user_id", ownerId);
  const { data: busy } = await q;
  const fmt = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: ctx.timezone,
  });
  const hourOf = (d: Date) =>
    Number(
      new Intl.DateTimeFormat("en-US", {
        hour: "2-digit",
        hour12: false,
        timeZone: ctx.timezone,
      }).format(d),
    ) % 24;
  const dayOf = (d: Date) =>
    new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: ctx.timezone }).format(d);
  const pref = (preference ?? "").toLowerCase();
  const out: { start_iso: string; human: string }[] = [];
  const cursor = new Date(Math.ceil(now.getTime() / 1_800_000) * 1_800_000 + 3_600_000);
  while (cursor < until && out.length < 4) {
    const h = hourOf(cursor);
    const wd = dayOf(cursor);
    const workday = !["Sat", "Sun"].includes(wd);
    const prefOk = pref.includes("manh") ? h < 12 : pref.includes("tard") ? h >= 13 : true;
    const end = new Date(cursor.getTime() + 30 * 60_000);
    const clash = (busy ?? []).some(
      (e) => new Date(e.starts_at) < end && new Date(e.ends_at) > cursor,
    );
    if (workday && h >= 9 && h < 18 && prefOk && !clash) {
      out.push({ start_iso: cursor.toISOString(), human: fmt.format(cursor) });
      cursor.setTime(cursor.getTime() + 2 * 3_600_000);
    } else cursor.setTime(cursor.getTime() + 30 * 60_000);
  }
  return out;
}

// Rótulo de cada ação na ficha e no registro da ligação.
const ACTION_LABEL: Record<string, string> = {
  identify_contact: "consultou a ficha",
  kb_search: "consultou a base",
  open_ticket: "abriu chamado",
  create_ticket: "abriu chamado",
  create_deal: "criou negócio",
  update_deal: "registrou qualificação",
  score_lead: "pontuou o lead",
  enroll_sequence: "inscreveu em sequência",
  availability: "consultou horários",
  slots: "consultou horários",
  book: "agendou",
  reschedule: "remarcou",
  get_invoices: "consultou faturas",
  asaas_create_charge: "gerou cobrança",
  promise_to_pay: "registrou promessa de pagamento",
  health_score: "consultou a saúde do cliente",
  create_task: "criou tarefa",
  save_fields: "atualizou a ficha",
  record_survey: "registrou pesquisa",
  flag: "sinalizou",
  notify_manager: "avisou o gestor",
  handoff_to_human: "pediu retorno de uma pessoa",
  send_whatsapp: "enviou WhatsApp",
  route_to_queue: "passou para a fila",
  request_callback: "agendou retorno",
};
// Só leitura: entra no registro da ligação, mas não polui a linha do tempo da ficha.
const READ_ONLY = new Set([
  "identify_contact",
  "kb_search",
  "availability",
  "slots",
  "get_invoices",
  "health_score",
  "crm_lookup",
]);
const CALL_KEYS = new Set(["contact_id", "caller_phone", "conversation_id", "system__caller_id"]);

/** Ficha para a ação: a do contato, ou um lead novo pelo telefone (toda ação fica numa ficha). */
async function ensureContact(
  accountId: string,
  contact: Awaited<ReturnType<typeof contactFor>>,
  b: ToolBody,
) {
  if (contact) return contact;
  const phone = toE164(b["caller_phone"] ?? b["system__caller_id"] ?? null);
  if (!phone) return null;
  const { data } = await admin()
    .from("contacts")
    .insert({
      account_id: accountId,
      phone,
      source: "ligacao",
      lifecycle: "lead",
      name: b["nome"] ?? null,
    })
    .select("id, name, phone, owner_user_id, email")
    .single();
  return data;
}

/** Toda ação da IA na ligação: atividade na ficha (para o responsável) e item no registro da ligação. */
async function recordVoiceAction(
  accountId: string,
  tool: string,
  b: ToolBody,
  contact: { id: string; owner_user_id: string | null } | null,
  ok: boolean,
  result: string,
) {
  const db = admin();
  const label = ACTION_LABEL[tool] ?? tool;
  const args = Object.entries(b)
    .filter(([k, v]) => !CALL_KEYS.has(k) && v)
    .map(([k, v]) => `${k}: ${String(v).slice(0, 200)}`)
    .join("\n");
  const convId = b["conversation_id"] ?? "";
  const jobs: PromiseLike<unknown>[] = [];
  if (contact && !READ_ONLY.has(tool))
    jobs.push(
      db.from("activities").insert({
        account_id: accountId,
        contact_id: contact.id,
        type: "ai",
        title: `IA na ligação ${ok ? label : `tentou: ${label} (falhou)`}`,
        body: [args, `Resultado: ${result.slice(0, 500)}`].filter(Boolean).join("\n\n"),
        user_id: contact.owner_user_id,
        done_at: new Date().toISOString(),
      }),
    );
  if (convId) {
    const { data: call } = await db
      .from("calls")
      .select("id, metadata")
      .eq("account_id", accountId)
      .eq("el_conversation_id", convId)
      .maybeSingle();
    if (call) {
      const meta = (call.metadata ?? {}) as { actions?: unknown[] };
      const actions = [
        ...(meta.actions ?? []),
        { tool, label, ok, at: new Date().toISOString(), resumo: result.slice(0, 300) },
      ];
      jobs.push(
        db
          .from("calls")
          .update({
            metadata: { ...meta, actions } as never,
            ...(contact ? { contact_id: contact.id } : {}),
          })
          .eq("id", call.id),
      );
    }
  }
  await Promise.all(jobs);
}

/** A IA já fez esta ação nesta ligação? (calls.metadata.actions) */
async function callAlreadyDid(
  accountId: string,
  conversationId: string | undefined,
  tools: string[],
): Promise<boolean> {
  if (!conversationId) return false;
  const { data } = await admin()
    .from("calls")
    .select("metadata")
    .eq("account_id", accountId)
    .eq("el_conversation_id", conversationId)
    .maybeSingle();
  const actions = ((data?.metadata ?? {}) as { actions?: { tool?: string; ok?: boolean }[] })
    .actions;
  return (actions ?? []).some((a) => a.ok && tools.includes(a.tool ?? ""));
}

/** Ferramenta da equipe (a mesma do texto) executada pela voz: mesmo runTool, mesmo registro. */
async function runTeamTool(
  accountId: string,
  tool: string,
  b: ToolBody,
  contact: { id: string; owner_user_id: string | null } | null,
  voiceAgentRowId: string | null,
): Promise<{ ok: boolean; text: string }> {
  const db = admin();
  const { data: team } = voiceAgentRowId
    ? await db
        .from("ai_agents")
        .select("id, settings")
        .eq("account_id", accountId)
        .eq("voice_agent_id", voiceAgentRowId)
        .limit(1)
        .maybeSingle()
    : { data: null };
  const args = Object.fromEntries(Object.entries(b).filter(([k]) => !CALL_KEYS.has(k)));
  if (tool === "handoff_to_human") {
    // uma vez por ligação: a ElevenLabs reenvia a ferramenta assíncrona e criava tarefa em dobro
    if (
      await callAlreadyDid(accountId, b["conversation_id"], [
        "handoff_to_human",
        "request_callback",
      ])
    )
      return {
        ok: true,
        text: "Já registrado nesta ligação: a equipe retorna pelo WhatsApp ou por ligação neste número.",
      };
    const reason = String(args["reason"] ?? "pediu para falar com uma pessoa").slice(0, 200);
    const summary = String(args["summary"] ?? "").slice(0, 600);
    if (contact)
      await db.from("activities").insert({
        account_id: accountId,
        contact_id: contact.id,
        type: "task",
        title: `Retornar ligação: ${reason}`,
        body: summary || null,
        user_id: contact.owner_user_id,
        due_at: new Date(Date.now() + 2 * 3_600_000).toISOString(),
      });
    const { notifyManagers } = await import("@/backend/agents/tools.server");
    await notifyManagers(
      accountId,
      "Ligação pede retorno de uma pessoa",
      `${reason}. ${summary}`,
      contact ? `/contatos/${contact.id}` : null,
    );
    return {
      ok: true,
      text: "Registrado: a equipe foi avisada e tem uma tarefa de retorno. Diga que uma pessoa retorna pelo WhatsApp ou por ligação neste número, em horário comercial.",
    };
  }
  const { runTool } = await import("@/backend/agents/tools.server");
  const out = await runTool(
    {
      accountId,
      agentId: team?.id ?? null,
      agentSettings: team?.settings ?? {},
      conversationId: null,
      contactId: contact?.id ?? null,
      runId: null,
      evalRunId: null,
      dryRun: false,
      failTool: null,
      lastCustomerText: "",
      composioSlugs: new Set(),
    } as never,
    { id: crypto.randomUUID(), name: tool, args },
  );
  return out.ok
    ? { ok: true, text: JSON.stringify(out.data ?? { ok: true }).slice(0, 3000) }
    : {
        ok: false,
        text: `Não deu certo: ${out.error ?? "erro"}. Diga a verdade e ofereça que a equipe retorne.`,
      };
}

export async function handleTool(req: Request): Promise<Response> {
  const accountId = accountFrom(req);
  await assertToolSecret(accountId, req.headers.get("x-nexus-tool-secret"));
  const url = new URL(req.url);
  const tool = url.searchParams.get("t") ?? "";
  const voiceAgentRowId = isUuid(url.searchParams.get("g")) ? url.searchParams.get("g") : null;
  const b = (await req.json().catch(() => ({}))) as ToolBody;
  const found = await contactFor(accountId, b);
  const contact = READ_ONLY.has(tool) ? found : await ensureContact(accountId, found, b);

  const { implementedTools } = await import("@/backend/agents/tools.server");
  if (tool === "handoff_to_human" || implementedTools().has(tool)) {
    const r = await runTeamTool(accountId, tool, b, contact, voiceAgentRowId);
    await recordVoiceAction(accountId, tool, b, contact, r.ok, r.text);
    return json({ result: r.text });
  }
  const res = await legacyTool(accountId, tool, b, contact);
  await recordVoiceAction(accountId, tool, b, contact, true, String(res["result"] ?? ""));
  return json(res);
}

async function legacyTool(
  accountId: string,
  tool: string,
  b: ToolBody,
  contact: Awaited<ReturnType<typeof contactFor>>,
): Promise<Record<string, unknown>> {
  const db = admin();
  const json = (x: Record<string, unknown>) => x;

  switch (tool) {
    case "crm_lookup": {
      if (!contact)
        return json({
          result: "Não encontrei este telefone no CRM. É um contato novo: pergunte o nome.",
        });
      const vars = await crmVariables(accountId, contact.id, "");
      return json({
        result: `Contato: ${contact.name ?? "sem nome"}. ${vars["crm_context"]}${vars["upcoming_meeting_human"] ? `. Próxima reunião: ${vars["upcoming_meeting_human"]}` : ""}`,
        contact_id: contact.id,
      });
    }
    case "slots": {
      const slots = await freeSlots(accountId, contact?.owner_user_id ?? null, b["preferencia"]);
      if (!slots.length)
        return json({
          result:
            "Não há horários livres nos próximos 7 dias. Ofereça que um especialista retorne.",
        });
      return json({
        result: `Horários livres: ${slots.map((s, i) => `${i + 1}) ${s.human}`).join("; ")}.`,
        slots,
      });
    }
    case "book": {
      const start = b["start_iso"] ? new Date(b["start_iso"]) : null;
      if (!start || Number.isNaN(start.getTime()) || start < new Date())
        return json({ result: "Horário inválido. Use um horário devolvido por slots." });
      let c = contact;
      if (!c) {
        const phone = toE164(b["caller_phone"] ?? null);
        const { data: created } = await db
          .from("contacts")
          .insert({
            account_id: accountId,
            name: b["nome"] ?? null,
            phone: phone?.replace("+", "") ?? null,
            email: b["email"]?.toLowerCase() ?? null,
            source: "ligacao",
          })
          .select("id, name, phone, owner_user_id, email")
          .single();
        c = created;
      } else if (b["email"] && !c.email) {
        await db.from("contacts").update({ email: b["email"].toLowerCase() }).eq("id", c.id);
      }
      if (!c)
        return json({
          result:
            "Não consegui registrar o contato. Diga que um especialista confirma por mensagem.",
        });
      const end = new Date(start.getTime() + 30 * 60_000);
      const { data: ev, error } = await db
        .from("events")
        .insert({
          account_id: accountId,
          title: `Reunião com ${c.name ?? "cliente"}`,
          starts_at: start.toISOString(),
          ends_at: end.toISOString(),
          contact_id: c.id,
          owner_user_id: c.owner_user_id,
          status: "scheduled",
          description: "Agendada pela IA de voz durante a ligação.",
        })
        .select("id")
        .single();
      if (error || !ev)
        return json({
          result: "Não consegui agendar agora. Diga que vamos confirmar por mensagem.",
        });
      await db.rpc("emit_event", {
        _account: accountId,
        _type: "meeting.scheduled",
        _entity: "event",
        _entity_id: ev.id,
        _payload: { contact_id: c.id, source: "voice" },
      });
      const ctx = await accountContext(accountId);
      const human = new Intl.DateTimeFormat("pt-BR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: ctx.timezone,
      }).format(start);
      return json({
        result: `Reunião agendada para ${human}. O convite vai por e-mail e WhatsApp.`,
        event_id: ev.id,
      });
    }
    case "create_ticket": {
      // tickets não tem coluna "channel": o insert antigo caía sempre no recuo. O open_ticket da
      // equipe numera, aplica SLA e registra igual ao texto.
      const r = await runTeamTool(
        accountId,
        "open_ticket",
        {
          subject: (b["assunto"] ?? "Chamado aberto por ligação").slice(0, 160),
          description: (b["resumo"] ?? "").slice(0, 4000),
        },
        contact,
        null,
      );
      return json({ result: r.ok ? "Chamado registrado. Um especialista vai retornar." : r.text });
    }
    case "update_deal": {
      if (!contact)
        return json({ result: "Contato não identificado; registre só o que foi dito." });
      const qual = Object.fromEntries(
        ["necessidade", "prazo", "decisor", "orcamento", "proximo_passo"]
          .filter((k) => b[k])
          .map((k) => [k, b[k]]),
      );
      const { data: deal } = await db
        .from("deals")
        .select("id, custom")
        .eq("contact_id", contact.id)
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (deal)
        await db
          .from("deals")
          .update({
            custom: { ...((deal.custom as object) ?? {}), qualificacao_voz: qual } as never,
          })
          .eq("id", deal.id);
      await db.from("activities").insert({
        account_id: accountId,
        contact_id: contact.id,
        deal_id: deal?.id ?? null,
        type: "ai",
        title: "Qualificação feita pela IA de voz",
        body: Object.entries(qual)
          .map(([k, v]) => `${k}: ${v}`)
          .join("\n"),
      });
      if (qual["proximo_passo"])
        await db
          .from("contacts")
          .update({ ai_next_step: qual["proximo_passo"] })
          .eq("id", contact.id);
      return json({ result: "Registrado no CRM." });
    }
    case "send_whatsapp": {
      if (!contact) return json({ result: "Não tenho o WhatsApp desta pessoa." });
      await db.rpc("enqueue_job", {
        _account: accountId,
        _kind: "whatsapp.send",
        _payload: {
          contact_id: contact.id,
          text: (b["mensagem"] ?? "").slice(0, 1000),
          category: "service",
        },
      });
      return json({ result: "Mensagem enviada por WhatsApp." });
    }
    case "route_to_queue":
    case "request_callback": {
      const { handleQueueTool } = await import("@/backend/routing/voice-queue.server");
      return json((await handleQueueTool(accountId, tool, b, contact)) as Record<string, unknown>);
    }
    default:
      throw new HttpError(404, "Ferramenta desconhecida", "bad_tool");
  }
}

// ───────────────────────── pós-chamada ─────────────────────────
type Collected = Record<string, { value?: unknown; rationale?: string }>;

function collectedValue(dc: Collected | undefined, key: string): string {
  const v = dc?.[key]?.value;
  return v === null || v === undefined ? "" : String(v).trim();
}

/**
 * A ligação termina dentro da ficha: lead criado se não havia, coleta aplicada ao contato,
 * atividade com resumo para o responsável, tarefa de retorno quando pedida e saída da lista.
 */
async function applyCallToContact(
  accountId: string,
  call: { id: string; contact_id: string | null; direction: string },
  external: string | null,
  answered: boolean,
  analysis: NonNullable<PostCall["data"]>["analysis"],
) {
  const db = admin();
  let contactId = call.contact_id;
  if (!contactId && external && answered) {
    const found = await findContactByPhone(accountId, external);
    contactId =
      found?.id ??
      (
        await db
          .from("contacts")
          .insert({ account_id: accountId, phone: external, source: "ligacao", lifecycle: "lead" })
          .select("id")
          .single()
      ).data?.id ??
      null;
    if (contactId) await db.from("calls").update({ contact_id: contactId }).eq("id", call.id);
  }
  if (!contactId) return;
  const { data: contact } = await db
    .from("contacts")
    .select("owner_user_id, custom")
    .eq("id", contactId)
    .single();
  const dc = analysis?.data_collection_results as Collected | undefined;
  const interesse = collectedValue(dc, "interesse");
  const proximo = collectedValue(dc, "proximo_passo");
  const fields = Object.fromEntries(
    Object.keys(dc ?? {})
      .filter((k) => k.startsWith("campo_") && collectedValue(dc, k))
      .map((k) => [k.slice(6), collectedValue(dc, k)]),
  );
  await db
    .from("contacts")
    .update({
      ...(analysis?.transcript_summary
        ? { ai_summary: analysis.transcript_summary.slice(0, 2000) }
        : {}),
      ...(interesse ? { ai_intent: interesse.slice(0, 300) } : {}),
      ...(proximo ? { ai_next_step: proximo.slice(0, 300) } : {}),
      ...(Object.keys(fields).length
        ? { custom: { ...((contact?.custom as object) ?? {}), ...fields } as never }
        : {}),
    })
    .eq("id", contactId);
  const lines = [
    analysis?.transcript_summary ?? (answered ? "Ligação atendida, sem resumo." : "Não atendeu."),
    interesse && `Interesse: ${interesse}`,
    proximo && `Próximo passo: ${proximo}`,
    collectedValue(dc, "objecao") && `Objeção: ${collectedValue(dc, "objecao")}`,
    ...Object.entries(fields).map(([k, v]) => `${k}: ${v}`),
  ].filter(Boolean);
  await db.from("activities").insert({
    account_id: accountId,
    contact_id: contactId,
    type: "call",
    title: `Ligação da IA de voz (${call.direction === "outbound" ? "feita" : "recebida"})${answered ? "" : " · não atendida"}`,
    body: lines.join("\n"),
    user_id: contact?.owner_user_id ?? null,
    done_at: new Date().toISOString(),
  });
  const callActions = (
    ((await db.from("calls").select("metadata").eq("id", call.id).single()).data?.metadata ??
      {}) as { actions?: { tool?: string; ok?: boolean }[] }
  ).actions;
  const returnAlready = (callActions ?? []).some(
    (a) => a.ok && ["handoff_to_human", "request_callback"].includes(a.tool ?? ""),
  );
  if (collectedValue(dc, "quer_retorno") === "true" && !returnAlready) {
    const quando = collectedValue(dc, "horario_retorno");
    await db.from("activities").insert({
      account_id: accountId,
      contact_id: contactId,
      type: "task",
      title: `Retornar ligação${quando ? ` (${quando})` : ""}`,
      body: [proximo, analysis?.transcript_summary].filter(Boolean).join("\n\n") || null,
      user_id: contact?.owner_user_id ?? null,
      due_at: new Date(Date.now() + 24 * 3_600_000).toISOString(),
    });
  }
  if (collectedValue(dc, "pediu_para_nao_ligar") === "true")
    await recordOptOut(accountId, external, "ia_de_voz");
}

interface PostCall {
  type?: string;
  data?: {
    agent_id?: string;
    conversation_id?: string;
    status?: string;
    transcript?: { role: string; message: string | null; time_in_call_secs?: number }[];
    metadata?: {
      start_time_unix_secs?: number;
      call_duration_secs?: number;
      cost?: number;
      phone_call?: { external_number?: string; agent_number?: string; direction?: string };
    };
    analysis?: {
      transcript_summary?: string;
      call_successful?: string;
      evaluation_criteria_results?: Record<string, { result?: string; rationale?: string }>;
      data_collection_results?: Record<string, { value?: unknown; rationale?: string }>;
    };
    conversation_initiation_client_data?: { dynamic_variables?: Record<string, string> };
  };
}

const FAILURE_LABEL: Record<string, { status: string; label: string }> = {
  busy: { status: "busy", label: "ocupado" },
  "no-answer": { status: "no_answer", label: "não atendeu" },
  unknown: { status: "failed", label: "não completou" },
};

/** A ligação não começou (não atendeu, ocupado, falha): fecha o registro e conta na ficha. */
async function handleCallFailure(
  accountId: string,
  d: NonNullable<PostCall["data"]> & { failure_reason?: string },
) {
  const db = admin();
  const f = FAILURE_LABEL[d.failure_reason ?? "unknown"] ?? FAILURE_LABEL["unknown"]!;
  const { data: call } = await db
    .from("calls")
    .select("id, contact_id, metadata, status")
    .eq("account_id", accountId)
    .eq("el_conversation_id", d.conversation_id ?? "")
    .maybeSingle();
  if (!call) return { ok: true, ignored: "ligação desconhecida" };
  if (call.status === "completed") return { ok: true, ignored: "já concluída" };
  await db
    .from("calls")
    .update({
      status: f.status,
      ended_at: new Date().toISOString(),
      billseconds: 0,
      disposition_reason: `A ligação ${f.label}`,
    })
    .eq("id", call.id);
  const targetId = (call.metadata as { target_id?: string } | null)?.target_id;
  if (targetId)
    await db
      .from("voice_campaign_targets")
      .update({ status: "pending", result: f.label })
      .eq("id", targetId);
  if (call.contact_id) {
    const { data: c } = await db
      .from("contacts")
      .select("owner_user_id")
      .eq("id", call.contact_id)
      .single();
    await db.from("activities").insert({
      account_id: accountId,
      contact_id: call.contact_id,
      type: "call",
      title: `Ligação da IA de voz: ${f.label}`,
      body: "Ninguém atendeu a ligação feita pela IA. Dá para tentar de novo pela ficha.",
      user_id: c?.owner_user_id ?? null,
      done_at: new Date().toISOString(),
    });
  }
  await afterCallEnded(call.id);
  return { ok: true, status: f.status };
}

export async function handlePostCall(req: Request): Promise<Response> {
  const accountId = accountFrom(req);
  const raw = await req.text();
  const secret = await postCallSecret(accountId);
  if (!secret || !verifyElevenWebhook(secret, req.headers.get("elevenlabs-signature"), raw))
    throw new HttpError(401, "Assinatura inválida", "bad_signature");
  const ev = JSON.parse(raw) as PostCall;
  if (ev.type === "call_initiation_failure" && ev.data?.conversation_id)
    return json(await handleCallFailure(accountId, ev.data));
  if (ev.type !== "post_call_transcription" || !ev.data?.conversation_id)
    return json({ ok: true, ignored: ev.type });
  const d = ev.data;
  const db = admin();
  const dir = d.metadata?.phone_call?.direction === "outbound" ? "outbound" : "inbound";
  const external = toE164(d.metadata?.phone_call?.external_number);
  const { data: agentRow } = d.agent_id
    ? await db
        .from("voice_agents")
        .select("id")
        .eq("account_id", accountId)
        .eq("elevenlabs_agent_id", d.agent_id)
        .maybeSingle()
    : { data: null };
  const convId = d.conversation_id ?? "";
  let { data: call } = await db
    .from("calls")
    .select("*")
    .eq("el_conversation_id", convId)
    .eq("account_id", accountId)
    .maybeSingle();
  if (!call) {
    const contact = await findContactByPhone(accountId, external);
    const { data: created } = await db
      .from("calls")
      .insert({
        account_id: accountId,
        direction: dir,
        from_number: dir === "inbound" ? external : toE164(d.metadata?.phone_call?.agent_number),
        to_number: dir === "inbound" ? toE164(d.metadata?.phone_call?.agent_number) : external,
        contact_id: contact?.id ?? null,
        voice_agent_id: agentRow?.id ?? null,
        el_conversation_id: convId,
        status: "in_progress",
      })
      .select("*")
      .single();
    call = created;
  }
  if (!call) throw new HttpError(500, "Não registrou a ligação", "insert");
  const turns = (d.transcript ?? []).filter((t) => t.message);
  const transcript = turns
    .map((t) => `${t.role === "agent" ? "IA" : "Cliente"}: ${t.message}`)
    .join("\n");
  const userText = turns
    .filter((t) => t.role === "user")
    .map((t) => t.message)
    .join(" ");
  const duration = d.metadata?.call_duration_secs ?? null;
  const started = d.metadata?.start_time_unix_secs
    ? new Date(d.metadata.start_time_unix_secs * 1000).toISOString()
    : call.started_at;
  const answered = turns.some((t) => t.role === "user");
  const evals = d.analysis?.evaluation_criteria_results ?? {};
  const evalVals = Object.values(evals);
  const score = evalVals.length
    ? Math.round((100 * evalVals.filter((e) => e.result === "success").length) / evalVals.length)
    : null;
  await db
    .from("calls")
    .update({
      status: answered ? "completed" : d.status === "failed" ? "failed" : "no_answer",
      started_at: started,
      answered_at: answered ? (call.answered_at ?? started) : null,
      ended_at: new Date(new Date(started).getTime() + (duration ?? 0) * 1000).toISOString(),
      duration_seconds: duration,
      billseconds: answered ? duration : 0,
      transcript: transcript || null,
      transcript_segments: turns.map((t) => ({
        speaker: t.role,
        text: t.message,
        at: t.time_in_call_secs ?? null,
      })) as never,
      summary: d.analysis?.transcript_summary ?? null,
      scorecard: evals as never,
      score,
      data_collection: (d.analysis?.data_collection_results ?? null) as never,
      cost_usd: d.metadata?.cost != null ? Number(d.metadata.cost) / 10_000 : null,
      disposition_reason: answered ? "Atendida pela IA de voz" : "O cliente não atendeu",
      voice_agent_id: call.voice_agent_id ?? agentRow?.id ?? null,
    })
    .eq("id", call.id);
  if (detectSpokenOptOut(userText)) await recordOptOut(accountId, external, "ia_de_voz");
  const targetId = (call.metadata as { target_id?: string } | null)?.target_id;
  if (targetId)
    await db
      .from("voice_campaign_targets")
      .update({
        status: answered ? "done" : "pending",
        result:
          d.analysis?.transcript_summary?.slice(0, 300) ?? (answered ? "atendida" : "não atendeu"),
      })
      .eq("id", targetId);
  await applyCallToContact(accountId, call, external, answered, d.analysis);
  await afterCallEnded(call.id);
  const ctx = await accountContext(accountId);
  if (ctx.telephony.record_calls)
    await db.rpc("enqueue_job", {
      _account: accountId,
      _kind: "call.process",
      _payload: { call_id: call.id },
      _dedupe: `call.process:${call.id}`,
    });
  return json({ ok: true });
}
