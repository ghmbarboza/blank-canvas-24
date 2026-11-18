// "Pergunte ao Nexus": o gestor pergunta em linguagem natural; o modelo usa ferramentas de LEITURA
// (RPCs agregadas existentes, chamadas com a sessão do próprio gestor, então a RLS vale) e a busca de
// conversas com filtros fixos. Nunca SQL livre. Resposta com número, fonte e link.
import { createClient } from "@supabase/supabase-js";

import { admin, HttpError, type Caller } from "@/backend/http.server";
import type { Database } from "@/integrations/supabase/types";

import { ANSWER, askSystem, askTools, conversationQuery, READ_TOOLS, safeLinks } from "./ask-logic";
import { callTools } from "./llm-tools.server";
import { resultText, type Turn } from "./tool-loop";

const MAX_STEPS = 5;

function userClient(token: string) {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new HttpError(500, "Configuração do banco ausente", "env");
  return createClient<Database>(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
  });
}

async function searchConversations(
  token: string,
  accountId: string,
  args: Record<string, unknown>,
  today: string,
) {
  const q = conversationQuery(args, today);
  const db = userClient(token);
  let base = db
    .from("conversations")
    .select("id, title, status, last_message_preview, last_message_at", { count: "exact" })
    .eq("account_id", accountId)
    .gte("last_message_at", `${q.from}T00:00:00-03:00`)
    .lte("last_message_at", `${q.to}T23:59:59-03:00`)
    .order("last_message_at", { ascending: false })
    .limit(20);
  if (q.status !== "any") base = base.eq("status", q.status);
  if (q.text) {
    // texto pode estar em qualquer mensagem: busca nas mensagens e filtra as conversas
    const { data: hits } = await db
      .from("messages")
      .select("conversation_id")
      .eq("account_id", accountId)
      .ilike("body", `%${q.text}%`)
      .gte("created_at", `${q.from}T00:00:00-03:00`)
      .lte("created_at", `${q.to}T23:59:59-03:00`)
      .limit(1000);
    const ids = [...new Set((hits ?? []).map((h) => h.conversation_id))];
    if (!ids.length)
      return { total: 0, periodo: q, onde: "mensagens das conversas visíveis para você" };
    base = base.in("id", ids.slice(0, 300));
  }
  const { data, count, error } = await base;
  if (error) throw new Error(error.message);
  let rows = data ?? [];
  if (q.unanswered) {
    const { data: last } = await db
      .from("messages")
      .select("conversation_id, direction, created_at")
      .in(
        "conversation_id",
        rows.map((r) => r.id),
      )
      .eq("is_private", false)
      .order("created_at", { ascending: false })
      .limit(400);
    const lastDir = new Map<string, string>();
    for (const m of last ?? [])
      if (!lastDir.has(m.conversation_id)) lastDir.set(m.conversation_id, m.direction);
    rows = rows.filter((r) => lastDir.get(r.id) === "in");
  }
  return {
    total: q.unanswered ? rows.length : (count ?? rows.length),
    periodo: q,
    conversas: rows.map((r) => ({
      titulo: r.title,
      situacao: r.status,
      ultima: r.last_message_preview?.slice(0, 140) ?? null,
      quando: r.last_message_at,
      link: `/inbox/${r.id}`,
    })),
  };
}

export async function askNexus(caller: Caller, token: string, question: string) {
  const q = question.trim().slice(0, 2000);
  if (!q) throw new HttpError(400, "Escreva a pergunta", "empty");
  const { data: account } = await admin()
    .from("accounts")
    .select("name, timezone")
    .eq("id", caller.accountId)
    .single();
  const tz = account?.timezone ?? "America/Sao_Paulo";
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
  const isManager = ["owner", "admin", "manager"].includes(caller.role);
  const tools = askTools(isManager);
  const turns: Turn[] = [{ role: "user", content: q }];
  const used: string[] = [];
  let created: Record<string, unknown> | null = null;
  const db = userClient(token);
  for (let step = 0; step < MAX_STEPS; step += 1) {
    const r = await callTools(caller.accountId, "ask_nexus", {
      system: askSystem(account?.name ?? "", today),
      turns,
      tools,
      maxTokens: 1500,
    });
    const final = r.calls.find((c) => c.name === ANSWER.name);
    if (final || !r.calls.length) {
      const answer =
        String(final?.args["answer"] ?? r.text ?? "").trim() ||
        "Não consegui responder com os dados disponíveis.";
      const links = safeLinks(final?.args["links"]);
      await admin()
        .from("nexus_questions")
        .insert({
          account_id: caller.accountId,
          user_id: caller.userId,
          question: q,
          answer: answer.slice(0, 8000),
          used: used as never,
          links: links as never,
        });
      return { answer, links, used, created };
    }
    turns.push({ role: "assistant_tools", text: r.text, calls: r.calls, raw: r.raw });
    const results = [];
    for (const c of r.calls) {
      used.push(c.name);
      let content: string;
      let isError = false;
      const started = Date.now();
      try {
        const read = READ_TOOLS[c.name];
        if (read) {
          const call = read.rpc(caller.accountId, c.args, today);
          const { data, error } = await db.rpc(call.fn as never, call.args as never);
          if (error) throw new Error(error.message);
          content = resultText({ fonte: `${call.fn}`, parametros: call.args, dados: data }, 6000);
        } else if (c.name === "buscar_conversas") {
          content = resultText(
            await searchConversations(token, caller.accountId, c.args, today),
            6000,
          );
        } else if (c.name === "criar_agente" && isManager) {
          const { draftAgentFromText } = await import("./eval.server");
          const d = await draftAgentFromText(
            caller.accountId,
            caller.userId,
            String(c.args["description"] ?? q),
          );
          created = {
            agentId: d.agentId,
            name: d.name,
            cases: d.suite.cases,
            estimate: d.estimate,
          };
          content = resultText({
            criado: d.name,
            papel: d.role,
            ferramentas: d.tools,
            casos_de_teste: d.suite.cases,
            custo_estimado_da_avaliacao_usd: d.estimate.usd,
            proximo_passo: "rodar a avaliação na Equipe de IA; o agente só liga com 90% ou mais",
            link: "/equipe-ia",
          });
        } else throw new Error(`ferramenta ${c.name} indisponível`);
      } catch (err) {
        isError = true;
        content = `ERRO: ${err instanceof Error ? err.message : String(err)}`;
      }
      await admin()
        .from("agent_tool_calls")
        .insert({
          account_id: caller.accountId,
          kind: "read",
          tool: c.name,
          args: c.args as never,
          ok: !isError,
          error: isError ? content.slice(0, 500) : null,
          latency_ms: Date.now() - started,
        });
      results.push({ id: c.id, name: c.name, content, isError });
    }
    turns.push({ role: "tool_results", results });
  }
  return {
    answer: "A pergunta pediu dados demais de uma vez. Tente uma pergunta mais específica.",
    links: [],
    used,
    created,
  };
}
