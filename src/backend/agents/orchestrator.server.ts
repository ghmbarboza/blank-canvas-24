// Orquestrador da equipe de IA. Uma conversa tem um agente ativo por vez; a recepção identifica
// a intenção e passa (route_to) com resumo; a passagem para humano dá dono e prazo à conversa.
// Feed-the-LLM: o modelo recebe ficha do CRM, base, catálogo e histórico e decide; a trava confere.
import { admin } from "@/backend/http.server";
import { searchKb } from "@/backend/support/kb-search.server";
import { checkReply, needsHuman, withinBusinessHours } from "@/backend/support/agent-logic";
import { agentSettingsV2, agentStyle, type AgentRole } from "@/features/agents/catalog";
import type { Tables } from "@/integrations/supabase/types";

import { asksIfRobot, startsWithGreeting, stripRepeatedGreeting, toneHints } from "./humanize";
import { kbQuery } from "./kb-query";
import { callTools } from "./llm-tools.server";
import { momentLines } from "./moment.server";
import {
  buildSystemPrompt,
  controlTools,
  humanDueAt,
  internalToolSpecs,
  isTerminal,
  MAX_ROUTE_HOPS,
  MAX_TOOL_STEPS,
  pickActiveAgent,
  pickHumanOwner,
  resolveRoute,
  type AgentLite,
} from "./orchestrator-logic";
import { implementedTools, runTool, type ToolCtx } from "./tools.server";
import { resultText, sanitizeSchema, type Attachment, type ToolSpec, type Turn } from "./tool-loop";
import type { VoiceCall } from "./voice-playbook";

export type AgentRow = Tables<"ai_agents">;
export type ToolRow = Tables<"agent_tools">;

export interface TurnOutcome {
  action: "reply" | "handoff" | "route";
  reply: string;
  reason: string;
  summary: string;
  routeTo: string | null;
  confidence: number;
  toolsCalled: string[];
  sources: string[];
  costUsd: number;
  model: string;
}

export interface TurnInput {
  accountId: string;
  company: string;
  agent: AgentRow;
  tools: ToolRow[];
  roster: AgentLite[];
  history: Turn[];
  contactText: string;
  contactId: string | null;
  conversationId: string | null;
  platform: string | null;
  greeted: boolean;
  collected: Record<string, string>;
  surveyPending: boolean;
  handoffSummary: string | null;
  dryRun: boolean;
  failTool: string | null;
  runId: string | null;
  evalRunId: string | null;
  tz: string;
  /** Só na voz: ligação recebida ou feita por nós. */
  call?: VoiceCall | null;
}

export async function loadTeam(
  accountId: string,
): Promise<{ agents: AgentRow[]; tools: ToolRow[] }> {
  const db = admin();
  const [{ data: agents }, { data: tools }] = await Promise.all([
    db.from("ai_agents").select("*").eq("account_id", accountId),
    db.from("agent_tools").select("*").eq("account_id", accountId).eq("enabled", true),
  ]);
  return { agents: agents ?? [], tools: tools ?? [] };
}

export function lite(a: AgentRow): AgentLite {
  return {
    id: a.id,
    name: a.name,
    role: a.role as AgentRole,
    status: a.status as AgentLite["status"],
    channels: a.channels ?? [],
    is_entry: a.is_entry,
    priority: a.priority,
  };
}

/** Base e catálogo carregados ANTES de chamar o modelo (o modelo pode buscar mais com kb_search). */
export async function preloadContext(accountId: string, question: string) {
  const db = admin();
  const [kb, { data: products }] = await Promise.all([
    searchKb(accountId, question, { query: kbQuery(question) || question.slice(0, 500) }).catch(
      () => [],
    ),
    db
      .from("products")
      .select("name, price, billing, description")
      .eq("account_id", accountId)
      .eq("active", true)
      .order("position")
      .limit(60),
  ]);
  return {
    kb: kb.map((k) => ({
      title: k.title,
      body: k.body_md,
    })),
    products: (products ?? []).map((p) => ({ ...p, price: Number(p.price) })),
  };
}

function nowLabel(tz: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: tz,
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}

/** Um turno de um agente: laço de ferramentas até respond / route_to / handoff_to_human. */
/** Prompt, ferramentas e contexto de UM agente numa rodada. Os dois motores usam o mesmo. */
export async function prepareAgent(
  input: TurnInput,
  a: AgentRow,
  shared?: { ctxData: Awaited<ReturnType<typeof preloadContext>> },
  engine?: "sdk" | "voz",
) {
  const settings = agentSettingsV2(a.settings);
  const style = agentStyle(a.style);
  const mine = input.tools.filter((t) => t.agent_id === a.id);
  const internal = mine.filter((t) => t.kind === "internal").map((t) => t.slug);
  const composioRows = mine.filter((t) => t.kind === "composio");
  const userTexts = input.history
    .filter((t) => t.role === "user")
    .map((t) => (t as { content: string }).content);
  const lastUser = userTexts[userTexts.length - 1] ?? "";
  const ctxData =
    shared?.ctxData ?? (await preloadContext(input.accountId, userTexts.slice(-3).join("\n")));
  const roster = input.roster
    .filter((r) => r.id !== a.id && r.status === "active" && r.role !== "supervisor")
    .map((r) => ({ name: r.name, role: r.role }));

  const system = buildSystemPrompt({
    company: input.company,
    agent: {
      name: a.name,
      role: a.role as AgentRole,
      persona: a.persona,
      tone: a.tone,
      goal: a.goal,
      instructions: a.instructions,
    },
    settings,
    style,
    tone: toneHints(userTexts),
    greeted: input.greeted,
    roster,
    contact: input.contactText,
    kb: ctxData.kb,
    products: ctxData.products,
    // quem recebe a passagem lê o resumo; no SDK a passagem traz a conversa inteira
    handoffSummary: a.id === input.agent.id ? input.handoffSummary : null,
    collected: input.collected,
    surveyPending: input.surveyPending,
    channel: input.platform,
    call: input.call ?? null,
    now: nowLabel(input.tz),
    ...(engine ? { engine } : {}),
  });
  const available = implementedTools();
  if (!settings.booking_slug)
    ["availability", "book", "reschedule"].forEach((s) => available.delete(s));
  const composioSpecs: ToolSpec[] = composioRows.map((t) => {
    const cfg = (t.config ?? {}) as {
      description?: string;
      name?: string;
      input_parameters?: unknown;
    };
    return {
      name: t.slug,
      description: `${cfg.name ?? t.slug}: ${cfg.description ?? ""}`.slice(0, 900),
      parameters: sanitizeSchema(cfg.input_parameters),
    };
  });
  const toolCtx: ToolCtx = {
    accountId: input.accountId,
    agentId: a.id,
    agentSettings: a.settings,
    conversationId: input.conversationId,
    contactId: input.contactId,
    runId: input.runId,
    evalRunId: input.evalRunId,
    dryRun: input.dryRun,
    failTool: input.failTool,
    lastCustomerText: lastUser,
    composioSlugs: new Set(composioRows.map((t) => t.slug)),
  };
  return {
    settings,
    system,
    roster,
    ctxData,
    toolCtx,
    mine,
    internalSpecs: internalToolSpecs(internal, available),
    composioSpecs,
  };
}

export async function runAgentTurn(input: TurnInput): Promise<TurnOutcome> {
  const a = input.agent;
  const prep = await prepareAgent(input, a);
  const { system, roster, ctxData, toolCtx } = prep;
  const tools = [...controlTools(roster), ...prep.internalSpecs, ...prep.composioSpecs];

  const turns: Turn[] = [...input.history];
  const called: string[] = [];
  let cost = 0;
  let model = "";
  for (let step = 0; step < MAX_TOOL_STEPS; step += 1) {
    // A busca na base JÁ foi feita para esta mensagem antes de chamar o modelo (preloadContext) e
    // os trechos estão no contexto. Deixar kb_search disponível fazia o modelo buscar de novo, duas
    // vezes, antes de responder: três idas ao modelo e 7 s (medido em 18/11). Com trechos na mão a
    // busca sai da lista; sem nenhum trecho, o modelo pode buscar UMA vez com outras palavras.
    const kbSearches = called.filter((name) => name === "kb_search").length;
    const allowKbSearch = ctxData.kb.length === 0 && kbSearches === 0;
    const stepTools = allowKbSearch ? tools : tools.filter((t) => t.name !== "kb_search");
    const r = await callTools(input.accountId, input.dryRun ? "agent_eval" : "agent_team", {
      system,
      turns,
      tools: stepTools,
      maxTokens: 1500,
    });
    cost += r.costUsd;
    model = r.model;
    if (!r.calls.length) {
      // modelo respondeu em texto sem ferramenta: vale como resposta
      return finish({ action: "reply", reply: r.text, confidence: 0.5 }, called, cost, model);
    }
    const terminal = r.calls.find((c) => isTerminal(c.name));
    if (terminal) {
      const g = terminal.args;
      if (terminal.name === "respond")
        return finish(
          {
            action: "reply",
            reply: String(g["reply"] ?? ""),
            confidence: Number(g["confidence"] ?? 0.5),
            sources: Array.isArray(g["used_sources"])
              ? (g["used_sources"] as unknown[]).map(String)
              : [],
          },
          called,
          cost,
          model,
        );
      if (terminal.name === "route_to")
        return finish(
          {
            action: "route",
            reply: "",
            routeTo: String(g["agent"] ?? ""),
            reason: String(g["reason"] ?? "intenção identificada"),
            summary: String(g["summary"] ?? ""),
            confidence: 1,
          },
          called,
          cost,
          model,
        );
      return finish(
        {
          action: "handoff",
          reply: String(g["message_to_customer"] ?? "") || a.handoff_message,
          reason: String(g["reason"] ?? "o agente pediu humano"),
          summary: String(g["summary"] ?? ""),
          confidence: 1,
        },
        called,
        cost,
        model,
      );
    }
    turns.push({ role: "assistant_tools", text: r.text, calls: r.calls, raw: r.raw });
    const results = [];
    for (const c of r.calls) {
      called.push(c.name);
      const out = await runTool(toolCtx, c);
      results.push({
        id: c.id,
        name: c.name,
        content: out.ok ? resultText(out.data) : `ERRO: ${out.error}`,
        isError: !out.ok,
      });
    }
    turns.push({ role: "tool_results", results });
  }
  return finish(
    {
      action: "handoff",
      reply: a.handoff_message,
      reason: "a IA não fechou a resposta em 5 passos",
      confidence: 0,
    },
    called,
    cost,
    model,
  );

  function finish(
    o: Partial<TurnOutcome> & Pick<TurnOutcome, "action" | "reply" | "confidence">,
    tc: string[],
    c: number,
    m: string,
  ): TurnOutcome {
    let out: TurnOutcome = {
      reason: "",
      summary: "",
      routeTo: null,
      sources: [],
      ...o,
      toolsCalled: tc,
      costUsd: c,
      model: m,
    };
    if (out.action === "reply") {
      let reply = stripRepeatedGreeting(out.reply.trim(), input.greeted);
      const guard = checkReply(
        reply,
        ctxData.products.map((p) => p.price),
      );
      if (!guard.ok || out.confidence < 0.4) {
        out = {
          ...out,
          action: "handoff",
          reply: a.handoff_message,
          reason: guard.ok ? "baixa confiança na resposta" : `trava: ${guard.problems.join("; ")}`,
          summary: out.summary || `A IA ia responder: "${reply.slice(0, 300)}"`,
        };
      } else {
        if (!reply) reply = a.handoff_message;
        out = { ...out, reply, reason: out.reason || "respondido pelo agente" };
      }
    }
    return out;
  }
}

// ───────────────────────── conversa real ─────────────────────────
interface MessageRow {
  id: string;
  direction: string;
  sender_type: string;
  type: string;
  body: string | null;
  transcript: string | null;
  media_url: string | null;
  media_mime: string | null;
  media_name: string | null;
  external_id: string | null;
  created_at: string;
}

async function historyTurns(msgs: MessageRow[]): Promise<Turn[]> {
  const db = admin();
  const out: Turn[] = [];
  const recentMedia = msgs.slice(-4).map((m) => m.id);
  for (const m of msgs) {
    const text = (m.body ?? m.transcript ?? "").slice(0, 2000);
    if (m.direction === "in") {
      const attachments: Attachment[] = [];
      if (
        m.media_url &&
        recentMedia.includes(m.id) &&
        (m.type === "image" || m.type === "document")
      ) {
        const isPdf = m.type === "document" && (m.media_mime ?? "").includes("pdf");
        if (m.type === "image" || isPdf) {
          const url = m.media_url.startsWith("http")
            ? m.media_url
            : (await db.storage.from("media").createSignedUrl(m.media_url, 900)).data?.signedUrl;
          if (url)
            attachments.push({
              kind: isPdf ? "pdf" : "image",
              url,
              name: m.media_name ?? undefined,
            });
        }
      }
      const content =
        text ||
        (m.type === "audio"
          ? "[o cliente mandou um áudio sem transcrição]"
          : m.type !== "text"
            ? `[o cliente mandou ${m.type}${m.media_name ? `: ${m.media_name}` : ""}]`
            : "");
      if (content || attachments.length) out.push({ role: "user", content, attachments });
    } else if (text) out.push({ role: "assistant", content: text });
  }
  return out;
}

/**
 * Ficha do cliente para o prompt: o agente de qualquer canal sabe o mesmo que a equipe sabe.
 * Contato, negócios, chamados abertos, próximo agendamento, cobrança em aberto e o que o
 * cliente falou nos OUTROS canais (WhatsApp, Instagram, e-mail...) nos últimos 30 dias.
 */
async function contactFicha(contactId: string | null, conversationId?: string): Promise<string> {
  if (!contactId) return "";
  const db = admin();
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [
    { data: c },
    { data: deals },
    { data: tickets },
    { data: meetings },
    { data: pays },
    { data: others },
  ] = await Promise.all([
    db
      .from("contacts")
      .select("name, email, phone, company, lifecycle, score, temperature, ai_summary, tags")
      .eq("id", contactId)
      .maybeSingle(),
    db
      .from("deals")
      .select("title, value")
      .eq("contact_id", contactId)
      .eq("status", "open")
      .limit(3),
    db
      .from("tickets")
      .select("number, subject, status, priority")
      .eq("contact_id", contactId)
      .in("status", ["open", "pending", "waiting_customer"])
      .limit(3),
    db
      .from("meetings")
      .select("title, scheduled_start, status")
      .eq("contact_id", contactId)
      .gte("scheduled_start", new Date().toISOString())
      .neq("status", "canceled")
      .order("scheduled_start")
      .limit(2),
    db
      .from("payments")
      .select("description, amount, due_date, status")
      .eq("contact_id", contactId)
      .in("status", ["pending", "overdue"])
      .order("due_date")
      .limit(3),
    db
      .from("conversations")
      .select(
        "id, last_message_at, channels(platform), messages(body, direction, created_at, is_private)",
      )
      .eq("contact_id", contactId)
      .neq("id", conversationId ?? "00000000-0000-0000-0000-000000000000")
      .gte("last_message_at", since)
      .order("last_message_at", { ascending: false })
      // só as últimas mensagens de cada conversa (sem isso vinha a conversa inteira)
      .order("created_at", { referencedTable: "messages", ascending: false })
      .limit(6, { referencedTable: "messages" })
      .limit(3),
  ]);
  if (!c) return "";
  const date = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString("pt-BR", {
          timeZone: "America/Sao_Paulo",
          dateStyle: "short",
          timeStyle: "short",
        })
      : "";
  const otherLines = (others ?? []).flatMap((o) => {
    const platform =
      (o.channels as unknown as { platform?: string } | null)?.platform ?? "outro canal";
    const msgs = (
      (o.messages ?? []) as {
        body: string | null;
        direction: string;
        created_at: string;
        is_private: boolean;
      }[]
    )
      .filter((m) => !m.is_private && m.body)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .slice(-3);
    return msgs.length
      ? [
          `- ${platform}: ${msgs
            .map((m) => `${m.direction === "in" ? "cliente" : "nós"}: ${m.body!.slice(0, 160)}`)
            .join(" | ")}`,
        ]
      : [];
  });
  // pós-venda: em que momento o cliente está (arrependimento, garantia, renovação, risco)
  const moment = await momentLines(contactId);
  return [
    `Nome: ${c.name ?? "?"}${c.company ? ` · ${c.company}` : ""}`,
    `Estágio: ${c.lifecycle ?? "lead"}${c.temperature ? ` · ${c.temperature}` : ""}${c.score !== null ? ` · pontuação ${c.score}` : ""}`,
    c.email ? `E-mail: ${c.email}` : "",
    c.tags?.length ? `Etiquetas: ${c.tags.join(", ")}` : "",
    c.ai_summary ? `Resumo anterior: ${c.ai_summary}` : "",
    ...moment,
    deals?.length
      ? `Negócios abertos: ${deals.map((d) => `${d.title} (R$ ${Number(d.value).toFixed(0)})`).join("; ")}`
      : "",
    tickets?.length
      ? `Chamados abertos: ${tickets.map((t) => `#${t.number} ${t.subject} (${t.status}, ${t.priority})`).join("; ")}`
      : "",
    meetings?.length
      ? `Próximo agendamento: ${meetings.map((m) => `${m.title} em ${date(m.scheduled_start)}`).join("; ")}`
      : "",
    pays?.length
      ? `Cobranças em aberto: ${pays
          .map(
            (p) =>
              `${p.description ?? "cobrança"} R$ ${Number(p.amount).toFixed(2)}${p.due_date ? ` vence ${p.due_date.split("-").reverse().join("/")}` : ""}${p.status === "overdue" ? " (VENCIDA)" : ""}`,
          )
          .join("; ")}`
      : "",
    otherLines.length
      ? `O que o cliente falou em outros canais (30 dias):\n${otherLines.join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function openLoads(accountId: string) {
  const db = admin();
  const [{ data: members }, { data: convs }] = await Promise.all([
    db.from("memberships").select("user_id, role, is_active").eq("account_id", accountId),
    db
      .from("conversations")
      .select("assignee_user_id")
      .eq("account_id", accountId)
      .eq("status", "open")
      .not("assignee_user_id", "is", null)
      .limit(5000),
  ]);
  const load = new Map<string, number>();
  for (const c of convs ?? [])
    if (c.assignee_user_id) load.set(c.assignee_user_id, (load.get(c.assignee_user_id) ?? 0) + 1);
  return (members ?? []).map((m) => ({ ...m, open_conversations: load.get(m.user_id) ?? 0 }));
}

/** Passa para humano: dono, prazo, nota interna com resumo e notificação. Nunca fica sem dono. */
export async function handOffToHuman(p: {
  accountId: string;
  conversationId: string;
  agentId: string | null;
  currentAssignee: string | null;
  contactId: string | null;
  reason: string;
  summary: string;
  slaMinutes: number;
}) {
  const db = admin();
  const { data: contact } = p.contactId
    ? await db.from("contacts").select("owner_user_id").eq("id", p.contactId).maybeSingle()
    : { data: null };
  const owner = pickHumanOwner(await openLoads(p.accountId), [
    p.currentAssignee,
    contact?.owner_user_id ?? null,
  ]);
  const due = humanDueAt(new Date(), p.slaMinutes);
  await db
    .from("conversations")
    .update({
      ai_handoff_at: new Date().toISOString(),
      ai_handoff_reason: p.reason.slice(0, 300),
      status: "open",
      ...(owner ? { assignee_user_id: owner } : {}),
    })
    .eq("id", p.conversationId);
  await db.from("agent_handoffs").insert({
    account_id: p.accountId,
    conversation_id: p.conversationId,
    from_agent_id: p.agentId,
    to_user_id: owner,
    kind: "human",
    reason: p.reason.slice(0, 500),
    summary: p.summary.slice(0, 2000),
    due_at: due.toISOString(),
  });
  await db.from("messages").insert({
    account_id: p.accountId,
    conversation_id: p.conversationId,
    direction: "out",
    sender_type: "system",
    type: "note",
    is_private: true,
    body: `IA passou para a equipe: ${p.reason}${p.summary ? `\nResumo: ${p.summary}` : ""}\nResponder até ${due.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })}.`,
    status: "sent",
  });
  if (owner)
    await db.rpc("notify_user", {
      _account: p.accountId,
      _user: owner,
      _kind: "ai_handoff",
      _title: "A IA passou uma conversa para você",
      _body: (p.summary || p.reason).slice(0, 300),
      _link: `/inbox/${p.conversationId}`,
    });
  else {
    const { notifyManagers } = await import("./tools.server");
    await notifyManagers(
      p.accountId,
      "Conversa sem dono: ninguém da equipe está ativo",
      p.reason,
      `/inbox/${p.conversationId}`,
    );
    // a marcação não pode derrubar a passagem para humano, mas a falha fica no log
    const { openFlag } = await import("./flags.server");
    await openFlag({
      account_id: p.accountId,
      conversation_id: p.conversationId,
      kind: "silent_no_owner",
      detail: "A IA passou para humano e não há atendente ativo.",
    }).catch((err: unknown) =>
      console.error("[orquestrador] marcação sem dono", err instanceof Error ? err.message : err),
    );
  }
  return owner;
}

/** A equipe tem algum agente ativo? (senão, o caminho antigo do SAC continua valendo). */
/** Motor da equipe por conta: "agents_sdk" liga o piloto automático (handoff nativo, travas e
 *  aprovação humana); qualquer outro valor fica no motor clássico. */
export function engineOf(settings: unknown): "agents_sdk" | "classic" {
  const ai = ((settings ?? {}) as { ai?: { engine?: unknown } }).ai;
  return ai?.engine === "agents_sdk" ? "agents_sdk" : "classic";
}

export async function teamIsActive(accountId: string): Promise<boolean> {
  const { count } = await admin()
    .from("ai_agents")
    .select("id", { count: "exact", head: true })
    .eq("account_id", accountId)
    .eq("status", "active")
    .neq("role", "supervisor");
  return (count ?? 0) > 0;
}

export async function runTeamOnConversation(
  conversationId: string,
  triggerMessageId: string | null,
): Promise<Record<string, unknown>> {
  const db = admin();
  const { data: conv } = await db
    .from("conversations")
    .select(
      "id, account_id, ai_enabled, ai_handoff_at, status, assignee_user_id, contact_id, is_group, channels(ai_enabled, provider, platform)",
    )
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv) return { skipped: "conversa sumiu" };
  const channel = conv.channels as unknown as {
    ai_enabled: boolean;
    provider: string;
    platform: string;
  } | null;
  if (!channel?.ai_enabled || !conv.ai_enabled)
    return { skipped: "IA desligada no canal ou na conversa" };
  if (conv.ai_handoff_at) return { skipped: "conversa já está com humano" };
  // grupo de WhatsApp/Telegram: a IA não fala em grupo (várias pessoas, ninguém pediu)
  if (conv.is_group) return { skipped: "conversa em grupo: a IA não responde" };
  if (channel.platform === "email" && triggerMessageId) {
    const { data: trig } = await db
      .from("messages")
      .select("metadata")
      .eq("id", triggerMessageId)
      .maybeSingle();
    const meta = (trig?.metadata ?? {}) as { email?: { auto?: boolean } };
    if (meta.email?.auto) return { skipped: "e-mail automático (robô): a IA não responde" };
  }

  const { data: account } = await db
    .from("accounts")
    .select("name, timezone, settings")
    .eq("id", conv.account_id)
    .single();
  const tz = account?.timezone ?? "America/Sao_Paulo";
  const { agents, tools } = await loadTeam(conv.account_id);
  const { data: state } = await db
    .from("agent_conversation_state")
    .select("*")
    .eq("conversation_id", conv.id)
    .maybeSingle();
  const all = agents.map(lite);
  const first = agents.find(
    (x) => x.id === pickActiveAgent(all, channel.platform, state?.agent_id ?? null)?.id,
  );
  if (!first) return { skipped: "nenhum agente ativo atende este canal" };
  let agent: AgentRow = first;

  const skip = async (reason: string) => {
    await db.from("ai_agent_runs").insert({
      account_id: conv.account_id,
      conversation_id: conv.id,
      agent_id: agent?.id ?? null,
      trigger_message_id: triggerMessageId,
      status: "skipped",
      reason,
      finished_at: new Date().toISOString(),
    });
    return { skipped: reason };
  };
  const settings = agentSettingsV2(agent.settings);
  const bh = ((account?.settings ?? {}) as Record<string, unknown>)["business_hours"];
  if (settings.business_hours_only && !withinBusinessHours(new Date(), tz, bh as never))
    return skip("fora do horário configurado");

  const { data: msgs } = await db
    .from("messages")
    .select(
      "id, direction, sender_type, type, body, transcript, media_url, media_mime, media_name, external_id, created_at, is_private",
    )
    .eq("conversation_id", conv.id)
    .order("created_at", { ascending: false })
    .limit(30);
  const list = (msgs ?? []).filter((m) => !m.is_private).reverse() as MessageRow[];
  const last = list[list.length - 1];
  if (!last || last.direction !== "in") return { skipped: "última mensagem não é do cliente" };
  if (
    list.some(
      (m) =>
        m.sender_type === "user" && Date.now() - new Date(m.created_at).getTime() < 30 * 60_000,
    )
  )
    return skip("um atendente respondeu há menos de 30 min");
  const { count } = await db
    .from("ai_agent_runs")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conv.id)
    .eq("status", "replied")
    .gte("created_at", new Date(Date.now() - 24 * 3600_000).toISOString());
  if ((count ?? 0) >= settings.max_replies_per_conversation)
    return skip("limite diário de respostas da IA nesta conversa");

  const history = await historyTurns(list);
  const greeted =
    !!state?.greeted_at || list.some((m) => m.direction === "out" && m.sender_type === "ai");
  const contactText = await contactFicha(conv.contact_id, conv.id);
  const lastText = last.body ?? last.transcript ?? "";
  const started = Date.now();
  const { data: run } = await db
    .from("ai_agent_runs")
    .insert({
      account_id: conv.account_id,
      conversation_id: conv.id,
      agent_id: agent.id,
      trigger_message_id: triggerMessageId ?? last.id,
      status: "queued",
    })
    .select("id")
    .single();

  try {
    let outcome: TurnOutcome;
    let handoffSummary: string | null = null;
    let approvalId: string | null = null;
    // regra dura herdada do SAC: pediu gente, ameaçou reclamar ou quer cancelar → humano (o robô não insiste)
    const human = asksIfRobot(lastText) ? null : needsHuman(lastText);
    if (human) {
      outcome = {
        action: "handoff",
        reply: agent.handoff_message,
        reason: human,
        // quem assume lê o que o cliente já disse, não só o pedido de humano
        summary: list
          .filter((m) => m.direction === "in" && (m.body ?? m.transcript))
          .slice(-4)
          .map((m) => `Cliente: ${(m.body ?? m.transcript ?? "").slice(0, 300)}`)
          .join("\n")
          .slice(0, 1500),
        routeTo: null,
        confidence: 1,
        toolsCalled: [],
        sources: [],
        costUsd: 0,
        model: "",
      };
    } else if (engineOf(account?.settings) === "agents_sdk") {
      const { runSdkTurn } = await import("./sdk/engine.server");
      const sdkOut = await runSdkTurn(
        {
          accountId: conv.account_id,
          company: account?.name ?? "",
          agent,
          tools,
          roster: all,
          history,
          contactText,
          contactId: conv.contact_id,
          conversationId: conv.id,
          platform: channel.platform,
          greeted,
          collected: (state?.collected ?? {}) as Record<string, string>,
          surveyPending:
            settings.survey !== "off" &&
            !((state?.survey ?? {}) as { answered_at?: string }).answered_at,
          handoffSummary,
          dryRun: false,
          failTool: null,
          runId: run?.id ?? null,
          evalRunId: null,
          tz,
        },
        agents,
      );
      outcome = sdkOut;
      approvalId = sdkOut.approvalId ?? null;
      const next = sdkOut.answeredBy ? agents.find((x) => x.id === sdkOut.answeredBy) : undefined;
      if (next) {
        await db.from("agent_handoffs").insert({
          account_id: conv.account_id,
          conversation_id: conv.id,
          from_agent_id: agent.id,
          to_agent_id: next.id,
          kind: "agent",
          reason: "passagem dentro da rodada (Agents SDK)",
          summary: "",
        });
        agent = next;
      }
    } else {
      let hops = 0;
      for (;;) {
        outcome = await runAgentTurn({
          accountId: conv.account_id,
          company: account?.name ?? "",
          agent,
          tools,
          roster: all,
          history,
          contactText,
          contactId: conv.contact_id,
          conversationId: conv.id,
          platform: channel.platform,
          greeted,
          collected: (state?.collected ?? {}) as Record<string, string>,
          surveyPending:
            settings.survey !== "off" &&
            !((state?.survey ?? {}) as { answered_at?: string }).answered_at,
          handoffSummary,
          dryRun: false,
          failTool: null,
          runId: run?.id ?? null,
          evalRunId: null,
          tz,
        });
        if (outcome.action !== "route") break;
        const target: AgentLite | null = resolveRoute(
          outcome.routeTo,
          all,
          agent.id,
          channel.platform,
        );
        const next: AgentRow | undefined = target
          ? agents.find((x) => x.id === target.id)
          : undefined;
        if (!next || hops >= MAX_ROUTE_HOPS) {
          outcome = {
            ...outcome,
            action: "handoff",
            reply: agent.handoff_message,
            reason: `nenhum agente "${outcome.routeTo}" ativo para receber`,
          };
          break;
        }
        await db.from("agent_handoffs").insert({
          account_id: conv.account_id,
          conversation_id: conv.id,
          from_agent_id: agent.id,
          to_agent_id: next.id,
          kind: "agent",
          reason: outcome.reason.slice(0, 500),
          summary: outcome.summary.slice(0, 2000),
        });
        handoffSummary = outcome.summary;
        agent = next;
        hops += 1;
      }
    }

    const style = agentStyle(agent.style);
    const voiceId =
      last.type === "audio" && style.voice_reply !== "never" && outcome.action === "reply"
        ? (agent.voice_id ?? (await voiceOfAgent(agent.voice_agent_id)))
        : style.voice_reply === "always" && outcome.action === "reply"
          ? (agent.voice_id ?? (await voiceOfAgent(agent.voice_agent_id)))
          : null;
    const sentId = await sendHumanized(conv.id, outcome.reply, {
      style,
      voiceId,
      inboundExternalId: last.external_id,
      metadata: {
        ai_run: run?.id,
        agent_id: agent.id,
        agent_name: agent.name,
        confidence: outcome.confidence,
      },
    });
    if (outcome.action === "handoff")
      await handOffToHuman({
        accountId: conv.account_id,
        conversationId: conv.id,
        agentId: agent.id,
        currentAssignee: conv.assignee_user_id,
        contactId: conv.contact_id,
        reason: outcome.reason,
        summary: outcome.summary,
        slaMinutes: settings.human_sla_minutes,
      });
    await db.from("agent_conversation_state").upsert(
      {
        conversation_id: conv.id,
        account_id: conv.account_id,
        agent_id: agent.id,
        greeted_at:
          state?.greeted_at ??
          (greeted || startsWithGreeting(outcome.reply) || outcome.action === "reply"
            ? new Date().toISOString()
            : null),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "conversation_id" },
    );
    await db
      .from("ai_agent_runs")
      .update({
        status: approvalId
          ? "awaiting_approval"
          : outcome.action === "handoff"
            ? "handoff"
            : "replied",
        agent_id: agent.id,
        reply_message_id: sentId,
        reason: outcome.reason.slice(0, 500),
        confidence: outcome.confidence,
        sources: outcome.sources.map((t) => ({ kind: "kb", title: t })) as never,
        latency_ms: Date.now() - started,
        finished_at: new Date().toISOString(),
      })
      .eq("id", run?.id ?? "");
    return { action: outcome.action, agent: agent.name, tools: outcome.toolsCalled };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db
      .from("ai_agent_runs")
      .update({
        status: "error",
        reason: msg.slice(0, 500),
        latency_ms: Date.now() - started,
        finished_at: new Date().toISOString(),
      })
      .eq("id", run?.id ?? "");
    // a IA falhou: a conversa não pode ficar calada
    await handOffToHuman({
      accountId: conv.account_id,
      conversationId: conv.id,
      agentId: agent.id,
      currentAssignee: conv.assignee_user_id,
      contactId: conv.contact_id,
      reason: `a IA falhou ao responder (${msg.slice(0, 120)})`,
      summary: lastText.slice(0, 500),
      slaMinutes: settings.human_sla_minutes,
    }).catch(() => null);
    throw err;
  }
}

/**
 * O gestor aprovou ou recusou: a rodada do SDK retoma de onde parou e o cliente recebe a
 * resposta (ou vai para humano). No simulador (sem conversa) só devolve o texto.
 */
export async function decideApproval(
  approvalId: string,
  decision: "approve" | "reject",
  userId: string,
): Promise<{ reply: string; action: string; agent: string | null }> {
  const { resumeApproval } = await import("./sdk/engine.server");
  const { reply, outcome, conversationId } = await resumeApproval(approvalId, decision, userId);
  const db = admin();
  const { data: row } = await db
    .from("agent_approvals")
    .select("account_id, agent_id, run_id")
    .eq("id", approvalId)
    .single();
  const agentId = outcome.answeredBy ?? row?.agent_id ?? null;
  const { data: agentRow } = agentId
    ? await db
        .from("ai_agents")
        .select("name, style, handoff_message, settings")
        .eq("id", agentId)
        .single()
    : { data: null };
  if (conversationId && row) {
    const { data: conv } = await db
      .from("conversations")
      .select("assignee_user_id, contact_id")
      .eq("id", conversationId)
      .single();
    const sentId = await sendHumanized(conversationId, reply, {
      style: agentStyle(agentRow?.style),
      voiceId: null,
      inboundExternalId: null,
      metadata: {
        ai_run: row.run_id,
        agent_id: agentId,
        agent_name: agentRow?.name,
        approval: approvalId,
      },
    });
    if (outcome.action === "handoff")
      await handOffToHuman({
        accountId: row.account_id,
        conversationId,
        agentId,
        currentAssignee: conv?.assignee_user_id ?? null,
        contactId: conv?.contact_id ?? null,
        reason: outcome.reason,
        summary: outcome.summary,
        slaMinutes: agentSettingsV2(agentRow?.settings).human_sla_minutes,
      });
    if (row.run_id)
      await db
        .from("ai_agent_runs")
        .update({
          status: outcome.approvalId
            ? "awaiting_approval"
            : outcome.action === "handoff"
              ? "handoff"
              : "replied",
          reply_message_id: sentId,
          reason:
            `${decision === "approve" ? "aprovado" : "recusado"} pelo gestor; ${outcome.reason}`.slice(
              0,
              500,
            ),
          finished_at: new Date().toISOString(),
        })
        .eq("id", row.run_id);
  }
  return {
    reply,
    action: outcome.approvalId ? "awaiting_approval" : outcome.action,
    agent: agentRow?.name ?? null,
  };
}

async function voiceOfAgent(voiceAgentId: string | null): Promise<string | null> {
  if (!voiceAgentId) return null;
  const { data } = await admin()
    .from("voice_agents")
    .select("voice_id")
    .eq("id", voiceAgentId)
    .maybeSingle();
  return data?.voice_id ?? null;
}

async function sendHumanized(...args: Parameters<typeof import("./send.server").sendHumanized>) {
  const { sendHumanized: send } = await import("./send.server");
  return send(...args);
}

// ───────────────────────── simulador (tela "testar conversando") ─────────────────────────
export async function simulate(
  accountId: string,
  agentId: string,
  history: { role: "user" | "assistant"; content: string }[],
): Promise<
  TurnOutcome & {
    agent: string;
    handoffs: string[];
    engine?: "agents_sdk";
    approvalId?: string | null;
  }
> {
  const { data: account } = await admin()
    .from("accounts")
    .select("name, timezone, settings")
    .eq("id", accountId)
    .single();
  const { agents, tools } = await loadTeam(accountId);
  const found = agents.find((x) => x.id === agentId);
  if (!found) throw new Error("Agente não encontrado");
  let agent: AgentRow = found;
  // no simulador o próprio agente testado e os ativos formam a equipe
  const roster = agents.map((x) =>
    x.id === agentId ? { ...lite(x), status: "active" as const } : lite(x),
  );
  const turns: Turn[] = history
    .slice(-16)
    .map((h) => ({ role: h.role, content: h.content.slice(0, 2000) }));
  const handoffs: string[] = [];
  let summary: string | null = null;
  let out: TurnOutcome | null = null;
  if (engineOf(account?.settings) === "agents_sdk") {
    const { runSdkTurn } = await import("./sdk/engine.server");
    const r = await runSdkTurn(
      {
        accountId,
        company: account?.name ?? "",
        agent,
        tools,
        roster,
        history: turns,
        contactText: "(simulação: cliente sem ficha)",
        contactId: null,
        conversationId: null,
        platform: "whatsapp",
        greeted: history.some((h) => h.role === "assistant"),
        collected: {},
        surveyPending: false,
        handoffSummary: null,
        dryRun: true,
        failTool: null,
        runId: null,
        evalRunId: null,
        tz: account?.timezone ?? "America/Sao_Paulo",
      },
      // o simulador testa a equipe inteira antes de ligar (rascunho e pausado entram; nada sai
      // de verdade). Na conversa real só entram os ativos, que passaram na avaliação.
      agents.map((x) => (x.role !== "supervisor" ? { ...x, status: "active" } : x)),
    );
    const next = r.answeredBy ? agents.find((x) => x.id === r.answeredBy) : undefined;
    if (next) handoffs.push(`${agent.name} → ${next.name}`);
    return {
      ...r,
      agent: (next ?? agent).name,
      handoffs,
      engine: "agents_sdk" as const,
      approvalId: r.approvalId ?? null,
    };
  }
  for (let hop = 0; hop <= MAX_ROUTE_HOPS; hop += 1) {
    out = await runAgentTurn({
      accountId,
      company: account?.name ?? "",
      agent,
      tools,
      roster,
      history: turns,
      contactText: "(simulação: cliente sem ficha)",
      contactId: null,
      conversationId: null,
      platform: "whatsapp",
      greeted: history.some((h) => h.role === "assistant"),
      collected: {},
      surveyPending: false,
      handoffSummary: summary,
      dryRun: true,
      failTool: null,
      runId: null,
      evalRunId: null,
      tz: account?.timezone ?? "America/Sao_Paulo",
    });
    if (out.action !== "route") break;
    const target: AgentLite | null = resolveRoute(out.routeTo, roster, agent.id, "whatsapp");
    const next: AgentRow | undefined = target ? agents.find((x) => x.id === target.id) : undefined;
    if (!next) {
      out = {
        ...out,
        action: "handoff",
        reply: agent.handoff_message,
        reason: `nenhum agente "${out.routeTo}" ativo`,
      };
      break;
    }
    handoffs.push(`${agent.name} → ${next.name}: ${out.summary}`);
    summary = out.summary;
    agent = next;
  }
  return { ...out!, agent: agent.name, handoffs };
}
