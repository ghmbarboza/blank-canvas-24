// Atendimento: agente de IA (ai.reply), transcrição de áudio (audio.transcribe, issue #1),
// pesquisa de satisfação ao resolver (support.csat) e embeddings da base (kb.embed).
import { admin, appBaseUrl } from "@/backend/http.server";
import { onDomainEvents } from "../events.server";
import { registerJob } from "../registry.server";

// 8 s: o job ainda adia enquanto o cliente manda mensagens seguidas (janela de 8 s), então
// rajadas viram uma resposta só sem a espera longa de antes (era 20 s).
const DEFAULT_DEBOUNCE = 2;
/** Cliente ainda digitando: se a última mensagem chegou há menos que isto, espera mais um pouco. */
const BURST_MS = 1_200;
/** Espera fixa antes de responder, só para juntar mensagens em rajada (o BURST_MS cobre o resto). */
const REPLY_DELAY_MS = 1_000;
// a resposta fora do horário espera a IA (debounce de ~8 s + resposta) para não falar por cima dela
const AWAY_DELAY_MS = 45_000;

async function enqueue(
  accountId: string,
  kind: string,
  payload: Record<string, unknown>,
  runAt?: Date,
  dedupe?: string,
) {
  await admin().rpc("enqueue_job", {
    _account: accountId,
    _kind: kind,
    _payload: payload as never,
    ...(runAt ? { _run_at: runAt.toISOString() } : {}),
    ...(dedupe ? { _dedupe: dedupe } : {}),
  });
}

// Mensagem recebida → transcreve áudio e/ou agenda a resposta da IA (com espera para juntar mensagens seguidas).
onDomainEvents(async (events) => {
  const received = events.filter((e) => e.type === "message.received");
  const resolved = events.filter((e) => e.type === "ticket.resolved");
  if (received.length) {
    const accounts = [...new Set(received.map((e) => e.account_id))];
    const { data: accs } = await admin().from("accounts").select("id, settings").in("id", accounts);
    // só a mensagem inteira curta pode ser descadastro: lê os textos do lote numa consulta só
    const ids = received
      .map((e) => (e.payload as { message_id?: string }).message_id)
      .filter((x): x is string => Boolean(x));
    const { data: bodies } = ids.length
      ? await admin().from("messages").select("id, body").in("id", ids)
      : { data: [] as { id: string; body: string | null }[] };
    const { isOptOut } = await import("@/backend/support/opt-out");
    const optOutIds = new Set((bodies ?? []).filter((m) => isOptOut(m.body)).map((m) => m.id));
    const awayOn = new Set(
      (accs ?? [])
        .filter(
          (a) =>
            ((a.settings ?? {}) as { away_message?: { enabled?: boolean } }).away_message?.enabled,
        )
        .map((a) => a.id),
    );
    const agentOn = new Map(
      (accs ?? []).map((a) => {
        const ag =
          ((a.settings ?? {}) as { ai_agent?: { enabled?: boolean; debounce_seconds?: number } })
            .ai_agent ?? {};
        return [
          a.id,
          { enabled: Boolean(ag.enabled), debounce: ag.debounce_seconds ?? DEFAULT_DEBOUNCE },
        ] as const;
      }),
    );
    // equipe de IA com agente ativo também responde (o agente do SAC antigo segue onde a equipe não está)
    const { data: team } = await admin()
      .from("ai_agents")
      .select("account_id, settings")
      .in("account_id", accounts)
      .eq("status", "active")
      .neq("role", "supervisor");
    for (const t of team ?? []) {
      const debounce =
        Number((t.settings as { debounce_seconds?: number } | null)?.debounce_seconds) ||
        DEFAULT_DEBOUNCE;
      const prev = agentOn.get(t.account_id);
      agentOn.set(t.account_id, {
        enabled: true,
        debounce: prev?.enabled ? Math.min(prev.debounce, debounce) : debounce,
      });
    }
    for (const e of received) {
      const p = e.payload as { message_id?: string; type?: string };
      if (p.type === "audio" && p.message_id)
        await enqueue(
          e.account_id,
          "audio.transcribe",
          { message_id: p.message_id },
          undefined,
          `audio:${p.message_id}`,
        );
      // "SAIR" no WhatsApp/SMS: descadastra da divulgação na hora (#67)
      if (p.message_id && optOutIds.has(p.message_id))
        await enqueue(
          e.account_id,
          "inbox.optout",
          { message_id: p.message_id },
          undefined,
          `optout:${p.message_id}`,
        );
      // fora do horário: avisa o cliente se ninguém (nem a IA) responder antes (#65)
      if (e.entity_id && awayOn.has(e.account_id))
        await enqueue(
          e.account_id,
          "inbox.away",
          { conversation_id: e.entity_id },
          new Date(Date.now() + AWAY_DELAY_MS),
          `away:${e.entity_id}`,
        );
      const ag = agentOn.get(e.account_id);
      if (ag?.enabled && e.entity_id && p.type !== "audio") {
        // espera curta só para juntar mensagens mandadas em sequência; o piso antigo de 5 s somado à
        // fila de 5 s dava 14 s até o atendente COMEÇAR (medido em 18/11)
        const runAt = new Date(Date.now() + REPLY_DELAY_MS);
        await enqueue(
          e.account_id,
          "ai.reply",
          { conversation_id: e.entity_id, message_id: p.message_id ?? null },
          runAt,
          `ai.reply:${e.entity_id}`,
        );
      }
    }
  }
  for (const e of resolved) {
    if (e.entity_id)
      await enqueue(
        e.account_id,
        "support.csat",
        { ticket_id: e.entity_id },
        new Date(Date.now() + 60_000),
        `csat:${e.entity_id}`,
      );
  }
});

registerJob("ai.reply", async (job) => {
  const p = job.payload as { conversation_id?: string; message_id?: string | null };
  if (!p.conversation_id) throw new Error("payload sem conversa");
  // Chegou mensagem nova depois do agendamento? Espera o cliente terminar de digitar.
  const { data: last } = await admin()
    .from("messages")
    .select("created_at, direction")
    .eq("conversation_id", p.conversation_id)
    .eq("is_private", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (last && last.direction === "in" && Date.now() - new Date(last.created_at).getTime() < BURST_MS) {
    await enqueue(job.account_id!, "ai.reply", p, new Date(Date.now() + BURST_MS));
    return { postponed: true };
  }
  // equipe de IA ativa assume; sem ela, o agente do SAC de sempre (comportamento antigo intacto)
  const { teamIsActive, runTeamOnConversation } =
    await import("@/backend/agents/orchestrator.server");
  if (await teamIsActive(job.account_id!)) {
    const r = await runTeamOnConversation(p.conversation_id, p.message_id ?? null);
    // canal que nenhum agente da equipe cobre: o agente do SAC antigo (se ligado) segue atendendo
    if (r["skipped"] !== "nenhum agente ativo atende este canal") return r;
  }
  const { runAgentOnConversation } = await import("@/backend/support/agent.server");
  return runAgentOnConversation(p.conversation_id, p.message_id ?? null);
});

registerJob("conversation.csat", async (job) => {
  const p = job.payload as { conversation_id?: string };
  if (!p.conversation_id) throw new Error("payload sem conversa");
  const { sendConversationCsat } = await import("@/backend/support/conversation-csat.server");
  return sendConversationCsat(p.conversation_id);
});

registerJob("inbox.optout", async (job) => {
  const p = job.payload as { message_id?: string };
  if (!p.message_id) throw new Error("payload sem mensagem");
  const { handleOptOut } = await import("@/backend/support/opt-out.server");
  return handleOptOut(p.message_id);
});

registerJob("inbox.away", async (job) => {
  const p = job.payload as { conversation_id?: string };
  if (!p.conversation_id) throw new Error("payload sem conversa");
  const { sendAwayIfNeeded } = await import("@/backend/support/away.server");
  return sendAwayIfNeeded(p.conversation_id);
});

registerJob("audio.transcribe", async (job) => {
  const p = job.payload as { message_id?: string };
  const db = admin();
  const { data: msg } = await db
    .from("messages")
    .select("id, account_id, conversation_id, media_url, transcript, type")
    .eq("id", p.message_id ?? "")
    .maybeSingle();
  if (!msg || msg.transcript || !msg.media_url) return { skipped: "sem áudio ou já transcrito" };
  const url = msg.media_url.startsWith("http")
    ? msg.media_url
    : (await db.storage.from("media").createSignedUrl(msg.media_url, 900)).data?.signedUrl;
  if (!url) throw new Error("arquivo de áudio indisponível");
  const { transcribeUrl } = await import("@/backend/ai/transcribe.server");
  const r = await transcribeUrl(msg.account_id, url);
  if (!r) return { skipped: "sem transcrição: nem Deepgram nem a IA embutida" };
  await db
    .from("messages")
    .update({ transcript: r.text || "(áudio sem fala reconhecível)" })
    .eq("id", msg.id);
  await db.from("usage_ledger").insert({
    account_id: msg.account_id,
    kind: "transcription_min",
    quantity: Math.max(1, Math.ceil(r.duration / 60)),
    unit: "min",
    cost_usd: (Math.max(r.duration, 30) / 60) * (r.provider === "deepgram" ? 0.0092 : 0.006),
    meta: { provider: r.provider },
    ref_table: "messages",
    ref_id: msg.id,
  });
  // Áudio transcrito também pode ser respondido pela IA.
  const { data: acc } = await db
    .from("accounts")
    .select("settings")
    .eq("id", msg.account_id)
    .single();
  const ag = ((acc?.settings ?? {}) as { ai_agent?: { enabled?: boolean } }).ai_agent;
  const { teamIsActive } = await import("@/backend/agents/orchestrator.server");
  if ((ag?.enabled || (await teamIsActive(msg.account_id))) && r.text)
    await enqueue(
      msg.account_id,
      "ai.reply",
      { conversation_id: msg.conversation_id, message_id: msg.id },
      new Date(Date.now() + 5_000),
      `ai.reply:${msg.conversation_id}`,
    );
  return { chars: r.text.length, seconds: r.duration, provider: r.provider };
});

registerJob("support.csat", async (job) => {
  const p = job.payload as { ticket_id?: string };
  const db = admin();
  const { data: t } = await db
    .from("tickets")
    .select(
      "id, account_id, number, subject, status, contact_id, conversation_id, contacts(name, email)",
    )
    .eq("id", p.ticket_id ?? "")
    .maybeSingle();
  if (!t || !["resolved", "closed"].includes(t.status) || !t.contact_id)
    return { skipped: "chamado sem contato ou reaberto" };
  const { data: existing } = await db
    .from("csat_responses")
    .select("id")
    .eq("ticket_id", t.id)
    .maybeSingle();
  if (existing) return { skipped: "já enviada" };
  const contact = t.contacts as unknown as { name: string | null; email: string | null } | null;
  const { data: row, error } = await db
    .from("csat_responses")
    .insert({
      account_id: t.account_id,
      ticket_id: t.id,
      contact_id: t.contact_id,
      channel: contact?.email ? "email" : "conversation",
    })
    .select("token")
    .single();
  if (error || !row) throw new Error(error?.message ?? "falha ao criar pesquisa");
  const link = `${appBaseUrl()}/csat/${row.token}`;
  const first = contact?.name?.split(" ")[0] ?? "";
  const text = `Oi${first ? `, ${first}` : ""}! Seu chamado #${t.number} (${t.subject}) foi resolvido. Como foi o atendimento? Leva 10 segundos: ${link}`;
  if (contact?.email) {
    await enqueue(t.account_id, "email.send", {
      to_email: contact.email,
      to_contact_id: t.contact_id,
      subject: `Como foi o atendimento do chamado #${t.number}?`,
      html: `<p>${text.replace(link, `<a href="${link}">avaliar o atendimento</a>`)}</p>`,
      text,
      category: "transactional",
    });
    return { sent: "email" };
  }
  if (t.conversation_id) {
    const { sendToConversation } = await import("@/backend/support/channel-send.server");
    try {
      await sendToConversation(t.conversation_id, { text, senderType: "system" });
      return { sent: "conversation" };
    } catch (err) {
      return {
        skipped: `sem canal disponível: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
  return { skipped: "contato sem e-mail nem conversa" };
});

registerJob("kb.embed", async (job) => {
  const p = job.payload as { article_id?: string };
  const db = admin();
  // Só o artigo da conta do trabalho (S10): id de outra conta não vira embedding aqui.
  const { data: a } = await db
    .from("kb_articles")
    .select("id, account_id, title, category, body_md, updated_at")
    .eq("id", p.article_id ?? "")
    .eq("account_id", job.account_id ?? "")
    .maybeSingle();
  if (!a) return { skipped: "artigo removido" };
  const { chunkArticle } = await import("@/backend/support/kb-chunks");
  const { embedMany, vectorLiteral } = await import("@/backend/llm.server");
  const parts = chunkArticle({ title: a.title, category: a.category, body: a.body_md });
  // lotes de 32: um pedido por lote, e o vetor de cada trecho na ordem
  const vectors: ({ vector: number[]; model: string } | null)[] = [];
  for (let i = 0; i < parts.length; i += 32) {
    const batch = parts.slice(i, i + 32);
    const v = await embedMany(a.account_id, batch);
    vectors.push(...(v ?? batch.map(() => null)));
  }
  const model = vectors.find((v) => v)?.model ?? null;
  // com a IA embutida no ar, vetor faltando é falha passageira (limite, tempo): a fila tenta de novo
  if (vectors.some((v) => !v) && process.env["LOVABLE_API_KEY"])
    throw new Error("embedding falhou em algum trecho: tentar de novo");
  // editaram o artigo enquanto a IA lia: não grava texto velho, refaz com o novo
  const { data: now } = await db
    .from("kb_articles")
    .select("updated_at")
    .eq("id", a.id)
    .maybeSingle();
  if (!now) return { skipped: "artigo removido" };
  if (now.updated_at !== a.updated_at) {
    await db.rpc("enqueue_job", {
      _account: a.account_id,
      _kind: "kb.embed",
      _payload: { article_id: a.id } as never,
      _dedupe: `kb.embed:${a.id}:${now.updated_at}`,
    });
    return { skipped: "artigo mudou durante a leitura: refeito com o texto novo" };
  }
  // troca os trechos de uma vez: sem vetor, o trecho ainda serve à busca por texto
  await db.from("kb_chunks").delete().eq("article_id", a.id);
  const { error } = await db.from("kb_chunks").insert(
    parts.map((content, idx) => ({
      account_id: a.account_id,
      article_id: a.id,
      idx,
      content,
      embedding: vectors[idx] ? vectorLiteral(vectors[idx]!.vector) : null,
      embedding_model: vectors[idx]?.model ?? null,
    })),
  );
  if (error) throw new Error(`trechos: ${error.message}`);
  await db
    .from("kb_articles")
    .update({
      chunk_count: parts.length,
      embedding_model: model,
      embedded_at: model ? new Date().toISOString() : null,
    } as never)
    .eq("id", a.id);
  const withVector = vectors.filter(Boolean).length;
  return model
    ? { chunks: parts.length, vectors: withVector, model }
    : { chunks: parts.length, vectors: 0, skipped: "sem IA de embedding: busca por texto" };
});

// Referenciado em handlers.server.ts para o módulo não ser descartado no build.
export const registered = true;
