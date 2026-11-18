// Nós da automação ligados à equipe de IA (P10): "chamar agente de IA" e "ação num app conectado".
import { admin } from "@/backend/http.server";

import { executeAction } from "./composio.server";
import { lite, loadTeam, runAgentTurn } from "./orchestrator.server";
import type { Turn } from "./tool-loop";

export { fillDeep, parseArgs } from "./automation-args";

/**
 * Põe a conversa do contato com o agente escolhido. Com "começar a conversa", o próprio agente
 * escreve a primeira mensagem a partir do objetivo (feed-the-LLM: ele recebe ficha, base e histórico).
 */
export async function automationCallAgent(p: {
  accountId: string;
  contactId: string;
  automationName: string;
  agentId: string;
  goal: string;
  startConversation: boolean;
}): Promise<string> {
  const db = admin();
  const { agents, tools } = await loadTeam(p.accountId);
  const agent = agents.find((a) => a.id === p.agentId);
  if (!agent) return "Agente não existe mais: pulado";
  if (agent.status !== "active") return `${agent.name} está desligado: pulado`;
  const { data: conv } = await db
    .from("conversations")
    .select("id, ai_handoff_at, channels(platform)")
    .eq("account_id", p.accountId)
    .eq("contact_id", p.contactId)
    .neq("status", "closed")
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (!conv) return "Contato sem conversa aberta: pulado";
  if (conv.ai_handoff_at) return "A conversa está com uma pessoa da equipe: pulado";
  await db.from("conversations").update({ ai_enabled: true }).eq("id", conv.id);
  await db.from("agent_conversation_state").upsert(
    {
      conversation_id: conv.id,
      account_id: p.accountId,
      agent_id: agent.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "conversation_id" },
  );
  await db.from("agent_handoffs").insert({
    account_id: p.accountId,
    conversation_id: conv.id,
    to_agent_id: agent.id,
    kind: "agent",
    reason: `automação: ${p.automationName}`.slice(0, 500),
    summary: p.goal.slice(0, 2000),
  });
  if (!p.startConversation) {
    // o cliente falou por último e ninguém respondeu: o agente responde agora
    const { data: last } = await db
      .from("messages")
      .select("direction")
      .eq("conversation_id", conv.id)
      .eq("is_private", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (last?.direction === "in")
      await db.rpc("enqueue_job", {
        _account: p.accountId,
        _kind: "ai.reply",
        _payload: { conversation_id: conv.id } as never,
        _dedupe: `ai.reply:${conv.id}`,
      });
    return `Conversa entregue a ${agent.name}`;
  }
  const { data: account } = await db
    .from("accounts")
    .select("name, timezone")
    .eq("id", p.accountId)
    .single();
  const { data: msgs } = await db
    .from("messages")
    .select("direction, body, transcript")
    .eq("conversation_id", conv.id)
    .eq("is_private", false)
    .order("created_at", { ascending: false })
    .limit(12);
  const history: Turn[] = (msgs ?? [])
    .reverse()
    .map(
      (m) =>
        ({
          role: m.direction === "in" ? "user" : "assistant",
          content: (m.body ?? m.transcript ?? "").slice(0, 1500),
        }) as Turn,
    )
    .filter((t) => (t as { content: string }).content);
  history.push({
    role: "user",
    content: `[instrução interna da automação "${p.automationName}", o cliente não vê] Comece a conversa com o cliente agora. Objetivo: ${p.goal || "retomar o contato"}. Escreva só a mensagem ao cliente.`,
  });
  const platform = (conv.channels as unknown as { platform: string } | null)?.platform ?? null;
  const out = await runAgentTurn({
    accountId: p.accountId,
    company: account?.name ?? "",
    agent,
    tools,
    roster: agents.map(lite),
    history,
    contactText: "",
    contactId: p.contactId,
    conversationId: conv.id,
    platform,
    greeted: history.some((t) => t.role === "assistant"),
    collected: {},
    surveyPending: false,
    handoffSummary: null,
    dryRun: false,
    failTool: null,
    runId: null,
    evalRunId: null,
    tz: account?.timezone ?? "America/Sao_Paulo",
  });
  if (out.action !== "reply" || !out.reply.trim())
    return `${agent.name} preferiu não escrever: ${out.reason}`;
  const { sendHumanized } = await import("./send.server");
  const { agentStyle } = await import("@/features/agents/catalog");
  await sendHumanized(conv.id, out.reply, {
    style: agentStyle(agent.style),
    voiceId: null,
    inboundExternalId: null,
    metadata: { agent_id: agent.id, agent_name: agent.name, automation: p.automationName },
  });
  return `${agent.name} começou a conversa`;
}

export async function automationComposioAction(p: {
  accountId: string;
  contactId: string;
  toolSlug: string;
  args: Record<string, unknown>;
}): Promise<string> {
  const started = Date.now();
  let ok = false;
  let error: string | null = null;
  let logId: string | null = null;
  let data: unknown = null;
  try {
    const r = await executeAction(p.accountId, p.toolSlug, p.args);
    ok = r.ok;
    error = r.error;
    logId = r.logId;
    data = r.data;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }
  await admin()
    .from("agent_tool_calls")
    .insert({
      account_id: p.accountId,
      kind: "composio",
      tool: p.toolSlug,
      args: p.args as never,
      result: (ok ? data : null) as never,
      ok,
      error: error?.slice(0, 500) ?? null,
      latency_ms: Date.now() - started,
      external_log_id: logId,
    });
  if (!ok) throw new Error(`Ação ${p.toolSlug} falhou: ${error ?? "sem detalhe"}`);
  return `Ação ${p.toolSlug} feita`;
}
