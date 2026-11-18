// SAC superior no servidor: macros sugeridas pela IA conforme a intenção, base de conhecimento
// que se escreve a partir do chamado resolvido e incidente em massa (agrupar e responder em lote).
import { HttpError, admin, isUuid, type Caller } from "@/backend/http.server";
import { groupSimilarTickets, type TicketGroup } from "@/features/support/incident-grouping";
import { rankMacros, renderMacro, type MacroLite } from "@/features/support/macros";
import { maskText } from "@/lib/mask-sensitive";

// ───────────────────────── macros ─────────────────────────

export interface MacroSuggestion {
  id: string;
  shortcut: string;
  title: string;
  text: string;
  missing: string[];
}

async function agentName(accountId: string, userId: string): Promise<string | null> {
  const db = admin();
  const { data: m } = await db
    .from("memberships")
    .select("display_name")
    .eq("account_id", accountId)
    .eq("user_id", userId)
    .maybeSingle();
  if (m?.display_name) return m.display_name;
  const { data: p } = await db.from("profiles").select("full_name").eq("id", userId).maybeSingle();
  return p?.full_name ?? null;
}

const MACRO_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    intent: { type: "string", description: "Intenção do cliente em 1 a 3 palavras" },
    ids: {
      type: "array",
      items: { type: "string" },
      description: "Até 3 ids de macros, da melhor para a pior",
    },
  },
  required: ["intent", "ids"],
};

export async function suggestMacros(
  caller: Caller,
  p: { conversationId?: unknown; ticketId?: unknown },
): Promise<{ intent: string | null; suggestions: MacroSuggestion[]; by: "ai" | "rule" }> {
  const db = admin();
  const { data: rows } = await db
    .from("quick_replies")
    .select("id, shortcut, title, body, intents, use_count, is_shared, created_by")
    .eq("account_id", caller.accountId)
    .limit(200);
  const macros: MacroLite[] = (rows ?? [])
    .filter((r) => r.is_shared || r.created_by === caller.userId)
    .map((r) => ({ ...r, intents: r.intents ?? [] }));
  if (macros.length === 0) return { intent: null, suggestions: [], by: "rule" };

  let contactId: string | null = null;
  let ticket: { number: number; subject: string; order_ref: string | null } | null = null;
  let lastText = "";
  let conversationId: string | null = isUuid(p.conversationId) ? p.conversationId : null;
  if (isUuid(p.ticketId)) {
    const { data: t } = await db
      .from("tickets")
      .select("number, subject, description, order_ref, contact_id, conversation_id")
      .eq("id", p.ticketId)
      .eq("account_id", caller.accountId)
      .maybeSingle();
    if (!t) throw new HttpError(404, "Chamado não encontrado", "not_found");
    ticket = { number: t.number, subject: t.subject, order_ref: t.order_ref };
    contactId = t.contact_id;
    conversationId = conversationId ?? t.conversation_id;
    lastText = `${t.subject}\n${t.description ?? ""}`;
  }
  if (conversationId) {
    const { data: conv } = await db
      .from("conversations")
      .select("contact_id")
      .eq("id", conversationId)
      .eq("account_id", caller.accountId)
      .maybeSingle();
    if (!conv) throw new HttpError(404, "Conversa não encontrada", "not_found");
    contactId = contactId ?? conv.contact_id;
    const { data: msgs } = await db
      .from("messages")
      .select("direction, body, transcript")
      .eq("conversation_id", conversationId)
      .eq("is_private", false)
      .order("created_at", { ascending: false })
      .limit(8);
    lastText = [
      lastText,
      ...(msgs ?? [])
        .reverse()
        .map(
          (m) => `${m.direction === "in" ? "Cliente" : "Equipe"}: ${m.body ?? m.transcript ?? ""}`,
        ),
    ]
      .filter(Boolean)
      .join("\n");
  }
  const { data: contact } = contactId
    ? await db
        .from("contacts")
        .select("name, email, ai_intent")
        .eq("id", contactId)
        .eq("account_id", caller.accountId)
        .maybeSingle()
    : { data: null };
  const { data: acc } = await db
    .from("accounts")
    .select("name")
    .eq("id", caller.accountId)
    .single();

  let intent: string | null = contact?.ai_intent ?? null;
  let ordered: MacroLite[] = rankMacros(macros, intent, lastText);
  let by: "ai" | "rule" = "rule";
  if (lastText.trim()) {
    try {
      const { callJson } = await import("@/backend/llm.server");
      const catalog = macros
        .slice(0, 80)
        .map(
          (m) =>
            `- id ${m.id} · ${m.title}${m.intents.length ? ` · intenções: ${m.intents.join(", ")}` : ""} · ${m.body.slice(0, 120)}`,
        )
        .join("\n");
      const r = await callJson<{ intent?: string; ids?: string[] }>(
        caller.accountId,
        "sac.macros",
        {
          system:
            "Você ajuda um atendente a escolher a resposta pronta certa. Leia a conversa, diga a intenção do cliente e escolha até 3 macros do catálogo que servem agora. Se nenhuma servir, devolva ids vazio.",
          messages: [
            {
              role: "user",
              content: `Conversa:\n${maskText(lastText).slice(-4000)}\n\nCatálogo:\n${catalog}`,
            },
          ],
          schemaName: "macros",
          schema: MACRO_SCHEMA,
          maxTokens: 300,
        },
      );
      const ids = (r.data.ids ?? []).filter((id) => macros.some((m) => m.id === id));
      intent = String(r.data.intent ?? "").slice(0, 60) || intent;
      ordered = ids.map((id) => macros.find((m) => m.id === id)!);
      by = "ai";
    } catch {
      /* sem IA: a ordem por intenção e palavras já serve */
    }
  }
  const agent = await agentName(caller.accountId, caller.userId);
  const vars = {
    contactName: contact?.name,
    contactEmail: contact?.email,
    agentName: agent,
    companyName: acc?.name,
    ticketNumber: ticket?.number,
    ticketSubject: ticket?.subject,
    orderRef: ticket?.order_ref,
  };
  return {
    intent,
    by,
    suggestions: ordered.slice(0, 3).map((m) => {
      const r = renderMacro(m.body, vars);
      return { id: m.id, shortcut: m.shortcut, title: m.title, text: r.text, missing: r.missing };
    }),
  };
}

export async function macroUsed(caller: Caller, id: unknown) {
  if (!isUuid(id)) return { ok: false };
  const db = admin();
  const { data } = await db
    .from("quick_replies")
    .select("use_count")
    .eq("id", id)
    .eq("account_id", caller.accountId)
    .maybeSingle();
  if (data)
    await db
      .from("quick_replies")
      .update({ use_count: data.use_count + 1 })
      .eq("id", id)
      .eq("account_id", caller.accountId);
  return { ok: true };
}

// ───────────────────────── base que se escreve sozinha ─────────────────────────

function slugify(s: string): string {
  return (
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "artigo"
  );
}

const KB_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    useful: {
      type: "boolean",
      description:
        "true se a solução serve para outros clientes; false se foi caso único ou não houve solução",
    },
    title: { type: "string", description: "Pergunta que o cliente faria, curta" },
    category: { type: "string" },
    body_md: {
      type: "string",
      description:
        "Artigo em markdown simples: o problema em uma frase e o passo a passo da solução. Sem nome nem dado do cliente.",
    },
  },
  required: ["useful", "title", "category", "body_md"],
};

/** Chamado resolvido sem artigo vira rascunho sugerido pela IA (o gestor aprova). */
export async function draftArticleFromTicket(
  ticketId: string,
): Promise<{ skipped?: string; articleId?: string }> {
  const db = admin();
  const { data: t } = await db
    .from("tickets")
    .select("id, account_id, number, subject, description, category, kb_article_id, status")
    .eq("id", ticketId)
    .maybeSingle();
  if (!t) return { skipped: "chamado removido" };
  if (t.kb_article_id) return { skipped: "chamado já tem artigo" };
  const { data: existing } = await db
    .from("kb_articles")
    .select("id")
    .eq("source_ticket_id", t.id)
    .maybeSingle();
  if (existing) return { skipped: "rascunho já criado" };
  const { searchKb } = await import("@/backend/support/kb-search.server");
  const top = (await searchKb(t.account_id, t.subject, { limit: 1 }).catch(() => []))[0];
  // RRF: perto de 2/61 só quando o artigo está no topo do texto e do vetor ao mesmo tempo
  if (top && top.score >= 0.03) return { skipped: `artigo parecido já existe: ${top.title}` };
  const { data: ev } = await db
    .from("ticket_events")
    .select("body, is_public, author_user_id, meta")
    .eq("ticket_id", t.id)
    .eq("kind", "comment")
    .order("created_at", { ascending: true })
    .limit(60);
  const teamReplies = (ev ?? []).filter((e) => e.author_user_id && e.body);
  if (teamReplies.length === 0) return { skipped: "sem resposta da equipe para aprender" };
  const history = (ev ?? [])
    .filter((e) => e.body)
    .map(
      (e) =>
        `${e.author_user_id ? (e.is_public ? "Equipe" : "Nota interna") : "Cliente"}: ${e.body}`,
    )
    .join("\n");
  const { callJson } = await import("@/backend/llm.server");
  const r = await callJson<{
    useful?: boolean;
    title?: string;
    category?: string;
    body_md?: string;
  }>(t.account_id, "kb.draft", {
    system:
      "Você escreve artigos curtos para a central de ajuda a partir de um chamado já resolvido. Escreva para o cliente leigo, em português do Brasil, sem dados pessoais. Se o chamado não ensina nada reaproveitável, marque useful=false.",
    messages: [
      {
        role: "user",
        content: `Chamado #${t.number}: ${t.subject}\nCategoria: ${t.category ?? "-"}\nDescrição: ${t.description ?? "-"}\n\nHistórico:\n${history.slice(0, 12_000)}`,
      },
    ],
    schemaName: "artigo",
    schema: KB_SCHEMA,
    maxTokens: 1200,
  });
  if (!r.data.useful || !r.data.title || !r.data.body_md)
    return { skipped: "IA achou que não vale artigo" };
  const title = maskText(r.data.title).slice(0, 200);
  let slug = slugify(title);
  const { data: clash } = await db
    .from("kb_articles")
    .select("id")
    .eq("account_id", t.account_id)
    .eq("slug", slug)
    .maybeSingle();
  if (clash) slug = `${slug.slice(0, 70)}-${t.number}`;
  const { data: art, error } = await db
    .from("kb_articles")
    .insert({
      account_id: t.account_id,
      title,
      slug,
      category: String(r.data.category ?? t.category ?? "").slice(0, 80) || null,
      body_md: maskText(r.data.body_md).slice(0, 20_000),
      visibility: "public",
      status: "draft",
      ai_suggested: true,
      source_ticket_id: t.id,
    })
    .select("id")
    .single();
  if (error?.code === "23505") return { skipped: "rascunho já criado" };
  if (error) throw new Error(`não deu para gravar o rascunho: ${error.message}`);
  const { data: mgrs } = await db
    .from("memberships")
    .select("user_id")
    .eq("account_id", t.account_id)
    .eq("is_active", true)
    .in("role", ["owner", "admin", "manager"])
    .limit(10);
  for (const m of mgrs ?? [])
    await db.rpc("notify_user", {
      _account: t.account_id,
      _user: m.user_id,
      _kind: "kb_suggestion",
      _title: "Artigo sugerido pela IA",
      _body: `A partir do chamado #${t.number}: ${title}`,
      _link: "/atendimento/base?sugeridos=1",
    });
  return { articleId: art.id };
}

// ───────────────────────── incidente em massa ─────────────────────────

export async function incidentSuggestions(caller: Caller): Promise<{ groups: TicketGroup[] }> {
  const since = new Date(Date.now() - 72 * 3_600_000).toISOString();
  const { data } = await admin()
    .from("tickets")
    .select("id, number, subject, description, created_at")
    .eq("account_id", caller.accountId)
    .in("status", ["open", "pending", "waiting_customer"])
    .is("incident_id", null)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(400);
  return { groups: groupSimilarTickets(data ?? []).slice(0, 10) };
}

export async function linkTickets(caller: Caller, incidentId: unknown, ticketIds: unknown) {
  if (!isUuid(incidentId)) throw new HttpError(400, "Incidente inválido", "bad_id");
  const ids = (Array.isArray(ticketIds) ? ticketIds : []).filter(isUuid).slice(0, 500);
  if (ids.length === 0) throw new HttpError(400, "Escolha os chamados", "empty");
  const { error, count } = await admin()
    .from("tickets")
    .update({ incident_id: incidentId }, { count: "exact" })
    .eq("account_id", caller.accountId)
    .in("id", ids);
  if (error) throw new HttpError(400, error.message, "link");
  return { linked: count ?? 0 };
}

const STATUS_TEXT: Record<string, string> = {
  investigating: "Investigando",
  identified: "Causa encontrada",
  monitoring: "Corrigido, em observação",
  resolved: "Resolvido",
};

/** Atualização do incidente: grava, publica na página de status e responde todos os chamados ligados. */
export async function postIncidentUpdate(caller: Caller, body: Record<string, unknown>) {
  if (!isUuid(body["incidentId"])) throw new HttpError(400, "Incidente inválido", "bad_id");
  const status = String(body["status"] ?? "");
  if (!STATUS_TEXT[status]) throw new HttpError(400, "Situação inválida", "status");
  const text = String(body["body"] ?? "")
    .trim()
    .slice(0, 4000);
  if (!text) throw new HttpError(400, "Escreva a mensagem para os clientes", "empty");
  const notify = body["notify"] !== false;
  const resolveTickets = body["resolveTickets"] === true;
  const db = admin();
  const { data: inc } = await db
    .from("incidents")
    .select("id, title, is_public")
    .eq("id", body["incidentId"] as string)
    .eq("account_id", caller.accountId)
    .maybeSingle();
  if (!inc) throw new HttpError(404, "Incidente não encontrado", "not_found");
  await db
    .from("incidents")
    .update({
      status,
      resolved_at: status === "resolved" ? new Date().toISOString() : null,
      public_summary: text.slice(0, 2000),
    })
    .eq("id", inc.id)
    .eq("account_id", caller.accountId);

  let notified = 0;
  let failed = 0;
  if (notify) {
    const { data: tickets } = await db
      .from("tickets")
      .select("id, number, subject, conversation_id, contacts(id, email)")
      .eq("account_id", caller.accountId)
      .eq("incident_id", inc.id)
      .in("status", ["open", "pending", "waiting_customer"])
      .limit(500);
    const { sendToConversation } = await import("@/backend/support/channel-send.server");
    for (const t of tickets ?? []) {
      const contact = t.contacts as unknown as { id: string; email: string | null } | null;
      try {
        await db.from("ticket_events").insert({
          account_id: caller.accountId,
          ticket_id: t.id,
          kind: "comment",
          body: text,
          is_public: true,
          author_user_id: caller.userId,
          meta: { channel: "incident", incident_id: inc.id },
        });
        if (t.conversation_id) {
          await sendToConversation(t.conversation_id, { text, senderType: "system" });
        } else if (contact?.email) {
          const escape = (s: string) =>
            s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
          await db.rpc("enqueue_job", {
            _account: caller.accountId,
            _kind: "email.send",
            _payload: {
              to_email: contact.email,
              to_contact_id: contact.id,
              subject: `Re: [#${t.number}] ${t.subject}`,
              html: `<div style="font-family:sans-serif;font-size:14px;line-height:1.5">${escape(text).replace(/\n/g, "<br>")}</div>`,
              text,
              category: "transactional",
              from_user_id: caller.userId,
            },
          });
        }
        if (resolveTickets)
          await db
            .from("tickets")
            .update({ status: "resolved" })
            .eq("id", t.id)
            .eq("account_id", caller.accountId);
        notified++;
      } catch {
        failed++;
      }
    }
  }
  await db.from("incident_updates").insert({
    account_id: caller.accountId,
    incident_id: inc.id,
    status,
    body: text,
    is_public: inc.is_public,
    notified,
    author_user_id: caller.userId,
  });
  return { notified, failed };
}
