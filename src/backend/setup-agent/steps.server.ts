// Passo a passo do onboarding pela TELA (formulário e botão), sem depender da conversa com a Vi.
// Cada função faz o mesmo que a ferramenta equivalente da Vi faria, pelo mesmo caminho do banco.
import { admin, HttpError, type Caller } from "@/backend/http.server";

import { saveCompany } from "./tools.server";

const GREETING_MARK = "Na primeira mensagem da conversa, cumprimente assim:";
const TEMPLATE = "post_sale";

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Passo 1: nome, ramo, o que vende e tom de voz. */
export async function saveCompanyForm(caller: Caller, body: Record<string, unknown>) {
  const name = clean(body["name"], 120);
  const segment = clean(body["segment"], 20);
  if (name.length < 2) throw new HttpError(400, "Escreva o nome da empresa", "name");
  if (!segment) throw new HttpError(400, "Escolha o ramo da empresa", "segment");
  try {
    await saveCompany(caller, {
      name,
      segment,
      sells: clean(body["sells"], 600),
      tone: clean(body["tone"], 300),
      source: "pessoa",
    });
  } catch (err) {
    throw new HttpError(422, err instanceof Error ? err.message : String(err), "company_failed");
  }
  return { ok: true };
}

/** Passo 3: texto colado (ou pergunta e resposta) vira documento da base, já indexado. */
export async function saveKnowledgeText(caller: Caller, body: Record<string, unknown>) {
  const title = clean(body["title"], 200) || "Texto colado";
  const content = clean(body["content"], 60_000);
  if (content.length < 20)
    throw new HttpError(400, "Escreva pelo menos uma frase completa (20 letras ou mais)", "short");
  const docs = await import("./docs.server");
  const id = await docs.createDocument({
    accountId: caller.accountId,
    userId: caller.userId,
    name: title,
    source: "texto",
    mime: "text/markdown",
  });
  try {
    const r = await docs.indexDocument(caller.accountId, id, title, content, "Pós-venda");
    return { ok: true, documentId: id, chunks: r.chunks };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await docs.failDocument(id, message);
    throw new HttpError(422, message, "index_failed");
  }
}

export interface AgentStepState {
  agent: { id: string; name: string; status: string; reason: string | null } | null;
  /** perguntas de teste já escritas para o agente */
  cases: number;
  run: {
    status: string;
    passed: number;
    total: number;
    passRate: number | null;
    error: string | null;
  } | null;
  /** canais de WhatsApp conectados em que a IA responde */
  whatsappOn: number;
}

async function findPostSale(accountId: string) {
  const { data } = await admin()
    .from("ai_agents")
    .select("id, name, status, status_reason, version, instructions")
    .eq("account_id", accountId)
    .eq("role", TEMPLATE)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data;
}

/** Passo 4: o que a tela mostra (atendente, perguntas de teste, última avaliação). */
export async function agentStepState(caller: Caller): Promise<AgentStepState> {
  const db = admin();
  const agent = await findPostSale(caller.accountId);
  const wa = await db
    .from("channels")
    .select("id", { head: true, count: "exact" })
    .eq("account_id", caller.accountId)
    .eq("platform", "whatsapp")
    .eq("status", "connected")
    .eq("ai_enabled", true);
  if (!agent) return { agent: null, cases: 0, run: null, whatsappOn: wa.count ?? 0 };
  const [cases, run] = await Promise.all([
    db.from("agent_evals").select("id", { head: true, count: "exact" }).eq("agent_id", agent.id),
    db
      .from("agent_eval_runs")
      .select("status, passed, total, pass_rate, error")
      .eq("agent_id", agent.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  return {
    agent: {
      id: agent.id,
      name: agent.name,
      status: agent.status,
      reason: agent.status_reason,
    },
    cases: cases.count ?? 0,
    run: run.data
      ? {
          status: run.data.status,
          passed: run.data.passed,
          total: run.data.total,
          passRate: run.data.pass_rate,
          error: run.data.error,
        }
      : null,
    whatsappOn: wa.count ?? 0,
  };
}

/** A IA só responde em canal com ai_enabled: liga nos WhatsApp conectados da conta. */
async function enableAiOnWhatsApp(accountId: string) {
  const { error } = await admin()
    .from("channels")
    .update({ ai_enabled: true })
    .eq("account_id", accountId)
    .eq("platform", "whatsapp");
  if (error) throw new HttpError(500, error.message, "channel_ai");
}

/** Monta as instruções com a saudação escolhida (troca a anterior, se houver). */
export function withGreeting(instructions: string, greeting: string): string {
  const base = instructions
    .split("\n")
    .filter((l) => !l.startsWith(GREETING_MARK))
    .join("\n")
    .trim();
  const g = greeting.trim().replace(/\s+/g, " ");
  return g ? `${base}\n${GREETING_MARK} "${g}"` : base;
}

/**
 * Passo 4, um clique: cria o atendente de pós-venda pelo modelo pronto, já no WhatsApp, com o
 * nome e a saudação da pessoa. Idempotente: se já existe, só garante a IA ligada no canal.
 */
export async function createPostSaleAgent(caller: Caller, body: Record<string, unknown>) {
  const db = admin();
  const name = clean(body["name"], 60);
  const greeting = clean(body["greeting"], 300);
  let agent = await findPostSale(caller.accountId);
  if (!agent) {
    const ev = await import("@/backend/agents/eval.server");
    const created = await ev.createFromTemplate(
      caller.accountId,
      caller.userId,
      TEMPLATE,
      "whatsapp",
    );
    const { data } = await db
      .from("ai_agents")
      .select("id, name, status, status_reason, version, instructions")
      .eq("id", created.agentId)
      .single();
    agent = data;
    if (agent && (name || greeting)) {
      const patch: { name?: string; instructions?: string } = {};
      if (name) patch.name = name;
      if (greeting) patch.instructions = withGreeting(agent.instructions, greeting);
      const { error } = await db.from("ai_agents").update(patch).eq("id", agent.id);
      if (error) throw new HttpError(500, error.message, "agent_update");
    }
  }
  if (!agent) throw new HttpError(500, "Não consegui criar o atendente", "agent_create");
  await enableAiOnWhatsApp(caller.accountId);
  return agentStepState(caller);
}

/**
 * Passo 4, "Ligar no WhatsApp": roda as perguntas de teste e liga sozinho se passar com 90% ou
 * mais (a trava é do banco). Se as perguntas ainda não foram escritas, escreve agora.
 */
export async function activatePostSaleAgent(caller: Caller) {
  const agent = await findPostSale(caller.accountId);
  if (!agent) throw new HttpError(404, "Crie o atendente antes de ligar", "no_agent");
  if (agent.status === "active") return agentStepState(caller);
  const ev = await import("@/backend/agents/eval.server");
  let est = await ev.estimate(caller.accountId, agent.id);
  if (!est.cases) {
    await ev.generateSuite(caller.accountId, agent.id, caller.userId);
    est = await ev.estimate(caller.accountId, agent.id);
  }
  await enableAiOnWhatsApp(caller.accountId);
  await ev.startRun(caller.accountId, agent.id, caller.userId, true);
  return agentStepState(caller);
}
