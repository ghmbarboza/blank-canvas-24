// Agente de IA que responde na conversa. Arquitetura "a IA recebe o contexto primeiro":
// busca na base de conhecimento + catálogo + histórico → o LLM compõe → a trava só confere.
import { admin } from "@/backend/http.server";
import { callJson } from "@/backend/llm.server";
import { searchKb } from "@/backend/support/kb-search.server";

import {
  agentSettings,
  checkReply,
  needsHuman,
  withinBusinessHours,
  type AgentSettings,
} from "./agent-logic";
import {
  offerSlots,
  resolveSlotChoice,
  schedulingPrompt,
  type OfferedSlot,
} from "./agent-scheduling";
import { sendToConversation } from "./channel-send.server";

export interface AgentDecision {
  action: "reply" | "handoff" | "skip";
  reply: string;
  reason: string;
  confidence: number;
  sources: { kind: string; title: string }[];
  problems: string[];
  /** A IA escolheu um horário da agenda oferecida: o servidor marca antes de responder. */
  booking?: OfferedSlot | null;
  /** Os outros horários oferecidos (para sugerir se o escolhido acabou de ser ocupado). */
  offered?: OfferedSlot[];
}

interface LlmOut {
  action: "reply" | "handoff" | "book";
  reply: string;
  handoff_summary?: string;
  confidence: number;
  used_sources?: string[];
  book_slot?: string;
}

const SCHEMA = {
  type: "object",
  properties: {
    action: {
      type: "string",
      enum: ["reply", "handoff", "book"],
      description:
        "reply responde; handoff passa para humano; book marca a reunião no horário book_slot",
    },
    book_slot: {
      type: "string",
      description: "Código do horário escolhido pelo cliente (ex.: H2), só com action=book",
    },
    reply: {
      type: "string",
      description: "Mensagem para o cliente (curta, natural, em português do Brasil)",
    },
    handoff_summary: {
      type: "string",
      description: "Resumo para o atendente quando action=handoff",
    },
    confidence: {
      type: "number",
      description: "0 a 1: quão seguro está de que a resposta está certa e completa",
    },
    used_sources: {
      type: "array",
      items: { type: "string" },
      description: "Títulos dos artigos/produtos usados",
    },
  },
  required: ["action", "reply", "confidence"],
};

export async function loadAgentSettings(
  accountId: string,
): Promise<{ settings: AgentSettings; tz: string; businessHours: unknown; name: string }> {
  const { data } = await admin()
    .from("accounts")
    .select("name, timezone, settings")
    .eq("id", accountId)
    .single();
  const s = (data?.settings ?? {}) as Record<string, unknown>;
  return {
    settings: agentSettings(s["ai_agent"]),
    tz: data?.timezone ?? "America/Sao_Paulo",
    businessHours: s["business_hours"],
    name: data?.name ?? "",
  };
}

async function context(accountId: string, question: string) {
  const db = admin();
  const [kb, { data: products }] = await Promise.all([
    searchKb(accountId, question, { limit: 5 }).catch(() => []),
    db
      .from("products")
      .select("name, price, billing, description, kind")
      .eq("account_id", accountId)
      .eq("active", true)
      .order("position")
      .limit(60),
  ]);
  return {
    kb: (kb ?? []) as { title: string; body_md: string; category: string | null }[],
    products: products ?? [],
  };
}

/** Horários livres da página escolhida nas configurações do agente (vazio se agendamento desligado). */
async function agendaFor(s: AgentSettings): Promise<OfferedSlot[] | null> {
  if (!s.scheduling_enabled || !s.booking_slug) return null;
  try {
    const { freeSlots } = await import("@/backend/booking.server");
    return offerSlots((await freeSlots(s.booking_slug)).slots, 6);
  } catch (err) {
    console.error("[agente] agenda indisponível", err);
    return null;
  }
}

function systemPrompt(
  name: string,
  s: AgentSettings,
  kb: { title: string; body_md: string }[],
  products: { name: string; price: number; billing: string; description: string | null }[],
  agenda: OfferedSlot[] | null,
) {
  const billing: Record<string, string> = {
    one_time: "avulso",
    monthly: "por mês",
    yearly: "por ano",
  };
  return [
    `Você é ${s.persona} da empresa ${name}. Tom: ${s.tone}.`,
    "Responda só com base no CONTEXTO abaixo e no histórico. Se a resposta não estiver no contexto, ou se o cliente pedir uma pessoa, reclamar, quiser cancelar ou estiver irritado, use action=handoff.",
    "Nunca invente preço, prazo, desconto, condição ou promessa. Preços só os do catálogo. Não diga que é humano.",
    "Mensagens curtas como no WhatsApp: 1 a 3 frases, sem markdown, no máximo uma pergunta por vez.",
    s.rules ? `Regras da empresa:\n${s.rules}` : "",
    "CONTEXTO — Base de conhecimento:",
    kb.length
      ? kb.map((a, i) => `[${i + 1}] ${a.title}\n${a.body_md.slice(0, 1800)}`).join("\n\n")
      : "(nenhum artigo encontrado para esta pergunta)",
    "CONTEXTO — Catálogo:",
    products.length
      ? products
          .map(
            (p) =>
              `- ${p.name}: R$ ${Number(p.price).toFixed(2).replace(".", ",")} ${billing[p.billing] ?? ""}${p.description ? ` — ${p.description.slice(0, 160)}` : ""}`,
          )
          .join("\n")
      : "(sem catálogo)",
    agenda ? schedulingPrompt(agenda) : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

// Decide a resposta. `history` vem em ordem cronológica; a última fala é do cliente.
export async function decide(
  accountId: string,
  history: { role: "user" | "assistant"; content: string }[],
  meta: { name: string; settings: AgentSettings },
): Promise<AgentDecision> {
  const last = [...history].reverse().find((m) => m.role === "user")?.content ?? "";
  const human = needsHuman(last);
  if (human) {
    return {
      action: "handoff",
      reply: meta.settings.handoff_message,
      reason: human,
      confidence: 1,
      sources: [],
      problems: [],
    };
  }
  const [ctx, agenda] = await Promise.all([
    context(
      accountId,
      history
        .filter((m) => m.role === "user")
        .slice(-3)
        .map((m) => m.content)
        .join("\n"),
    ),
    agendaFor(meta.settings),
  ]);
  const { data } = await callJson<LlmOut>(accountId, "agent_reply", {
    system: systemPrompt(meta.name, meta.settings, ctx.kb, ctx.products, agenda),
    messages: history.slice(-16),
    schemaName: "agent_reply",
    schema: SCHEMA,
    maxTokens: 1500,
  });
  // a trava confere: só marca um código que foi oferecido; fora disso vira humano
  const booking = data.action === "book" ? resolveSlotChoice(data.book_slot, agenda ?? []) : null;
  if (data.action === "book" && !booking)
    return {
      action: "handoff",
      reply: meta.settings.handoff_message,
      reason: "a IA tentou marcar um horário fora da agenda oferecida",
      confidence: data.confidence ?? 0,
      sources: [],
      problems: ["horário fora da agenda"],
    };
  const used = (data.used_sources ?? []).map((u) => u.toLowerCase());
  const mentions = (title: string) =>
    used.some((u) => u.includes(title.toLowerCase()) || title.toLowerCase().includes(u));
  const sources = [
    ...ctx.kb
      .filter((a) => used.length === 0 || mentions(a.title))
      .map((a) => ({ kind: "kb", title: a.title })),
    ...ctx.products
      .filter((p) => mentions(p.name))
      .map((p) => ({ kind: "product", title: p.name })),
  ];
  if (data.action === "handoff") {
    return {
      action: "handoff",
      reply: meta.settings.handoff_message,
      reason: data.handoff_summary ?? "o modelo preferiu passar para humano",
      confidence: data.confidence ?? 0,
      sources,
      problems: [],
    };
  }
  const guard = checkReply(
    data.reply ?? "",
    ctx.products.map((p) => Number(p.price)),
  );
  if (!guard.ok || (data.confidence ?? 0) < 0.45) {
    return {
      action: "handoff",
      reply: meta.settings.handoff_message,
      reason: guard.ok ? "baixa confiança na resposta" : `trava: ${guard.problems.join("; ")}`,
      confidence: data.confidence ?? 0,
      sources,
      problems: guard.problems,
    };
  }
  return {
    action: "reply",
    reply: data.reply.trim(),
    reason: booking ? `marcar reunião ${booking.human}` : "respondido pela base",
    confidence: data.confidence ?? 0,
    sources,
    problems: [],
    booking,
    offered: agenda ?? [],
  };
}

/** Marca a reunião que a IA combinou; se o horário foi ocupado no meio, a resposta oferece outros. */
async function applyBooking(
  d: AgentDecision,
  contactId: string | null,
  s: AgentSettings,
): Promise<AgentDecision> {
  if (!d.booking) return d;
  if (!contactId)
    return { ...d, action: "handoff", reply: s.handoff_message, reason: "marcar sem contato" };
  try {
    const { bookForContact } = await import("@/backend/booking.server");
    await bookForContact({
      slug: s.booking_slug,
      start: d.booking.start,
      contactId,
      source: "IA do WhatsApp",
      note: "Marcada pela IA na conversa.",
    });
    return d;
  } catch (err) {
    console.error("[agente] não marcou", err);
    const others = (d.offered ?? []).filter((o) => o.code !== d.booking!.code).slice(0, 3);
    return {
      ...d,
      booking: null,
      reason: "horário ocupado no momento de marcar",
      reply: others.length
        ? `Esse horário acabou de ser ocupado. Tenho estes: ${others.map((o) => o.human).join("; ")}. Qual fica melhor?`
        : s.handoff_message,
      action: others.length ? "reply" : "handoff",
    };
  }
}

// Execução real numa conversa (job ai.reply).
export async function runAgentOnConversation(
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
  const { settings, tz, businessHours, name } = await loadAgentSettings(conv.account_id);
  const channel = conv.channels as unknown as { ai_enabled: boolean; provider: string } | null;
  const skip = async (reason: string) => {
    await db.from("ai_agent_runs").insert({
      account_id: conv.account_id,
      conversation_id: conv.id,
      trigger_message_id: triggerMessageId,
      status: "skipped",
      reason,
      finished_at: new Date().toISOString(),
    });
    return { skipped: reason };
  };
  if (!settings.enabled) return { skipped: "agente desligado na conta" };
  if (!channel?.ai_enabled || !conv.ai_enabled)
    return { skipped: "IA desligada no canal ou na conversa" };
  if (conv.ai_handoff_at) return { skipped: "conversa já está com humano" };
  if (conv.is_group) return { skipped: "conversa em grupo: a IA não responde" };
  if (settings.business_hours_only && !withinBusinessHours(new Date(), tz, businessHours as never))
    return skip("fora do horário configurado");

  const { data: msgs } = await db
    .from("messages")
    .select("id, direction, sender_type, type, body, transcript, is_private, created_at")
    .eq("conversation_id", conv.id)
    .order("created_at", { ascending: false })
    .limit(30);
  const list = (msgs ?? []).filter((m) => !m.is_private).reverse();
  const last = list[list.length - 1];
  if (!last || last.direction !== "in") return { skipped: "última mensagem não é do cliente" };
  const humanRecent = list.some(
    (m) => m.sender_type === "user" && Date.now() - new Date(m.created_at).getTime() < 30 * 60_000,
  );
  if (humanRecent) return skip("um atendente respondeu há menos de 30 min");
  const { count } = await db
    .from("ai_agent_runs")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conv.id)
    .eq("status", "replied")
    .gte("created_at", new Date(Date.now() - 24 * 3600_000).toISOString());
  if ((count ?? 0) >= settings.max_replies_per_conversation)
    return skip("limite diário de respostas da IA nesta conversa");

  const history = list
    .map((m) => ({
      role: (m.direction === "in" ? "user" : "assistant") as "user" | "assistant",
      content: (m.body ?? m.transcript ?? (m.type !== "text" ? `[${m.type}]` : "")).slice(0, 2000),
    }))
    .filter((m) => m.content);

  const started = Date.now();
  const { data: run } = await db
    .from("ai_agent_runs")
    .insert({
      account_id: conv.account_id,
      conversation_id: conv.id,
      trigger_message_id: triggerMessageId ?? last.id,
      status: "queued",
    })
    .select("id")
    .single();
  try {
    const d = await applyBooking(
      await decide(conv.account_id, history, { name, settings }),
      conv.contact_id,
      settings,
    );
    const sent = await sendToConversation(conv.id, {
      text: d.reply,
      senderType: "ai",
      metadata: { ai_run: run?.id, confidence: d.confidence },
    });
    if (d.action === "handoff") {
      await db
        .from("conversations")
        .update({
          ai_handoff_at: new Date().toISOString(),
          ai_handoff_reason: d.reason.slice(0, 300),
          status: "open",
        })
        .eq("id", conv.id);
      await db.from("messages").insert({
        account_id: conv.account_id,
        conversation_id: conv.id,
        direction: "out",
        sender_type: "system",
        type: "note",
        is_private: true,
        body: `IA passou para a equipe: ${d.reason}`,
        status: "sent",
      });
      if (conv.assignee_user_id) {
        await db.rpc("notify_user", {
          _account: conv.account_id,
          _user: conv.assignee_user_id,
          _kind: "ai_handoff",
          _title: "A IA passou uma conversa para você",
          _body: d.reason,
          _link: `/inbox/${conv.id}`,
        });
      }
    }
    await db
      .from("ai_agent_runs")
      .update({
        status: d.action === "handoff" ? "handoff" : "replied",
        reply_message_id: sent.messageId,
        reason: d.reason,
        confidence: d.confidence,
        sources: d.sources as never,
        latency_ms: Date.now() - started,
        finished_at: new Date().toISOString(),
      })
      .eq("id", run?.id ?? "");
    return { action: d.action, confidence: d.confidence };
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
    throw err;
  }
}
