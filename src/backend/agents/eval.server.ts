// Avaliação obrigatória no servidor: gera a suíte com dados reais da conta (base de conhecimento e
// perguntas de clientes), estima o custo antes, roda em lotes na fila (jobs) com a chave da conta,
// julga com critério explícito e só liga o agente com 90% ou mais (o banco confere de novo).
import { admin, HttpError } from "@/backend/http.server";
import { estimateCost } from "@/backend/llm-core";
import { callJson } from "@/backend/llm.server";
import {
  INTERNAL_TOOLS,
  ROLES,
  templateFor,
  agentChannelLabel,
  type AgentChannel,
  type AgentRole,
  type EvalSeed,
} from "@/features/agents/catalog";

import {
  acceptGenerated,
  buildSuite,
  estimateSuiteCost,
  JUDGE_SCHEMA,
  judgePrompt,
  preGrade,
  questionsFromConversations,
  seedsFromKb,
  summarize,
  type AgentOutcome,
  type CaseResult,
  type EvalCase,
} from "./eval-logic";
import { providerModel } from "./llm-tools.server";
import { entryConflict } from "./orchestrator-logic";
import { lite, loadTeam, runAgentTurn } from "./orchestrator.server";

const BATCH = 4;

async function realQuestions(accountId: string): Promise<string[]> {
  const { data } = await admin()
    .from("messages")
    .select("body, conversation_id, created_at")
    .eq("account_id", accountId)
    .eq("direction", "in")
    .eq("type", "text")
    .eq("is_private", false)
    .gte("created_at", new Date(Date.now() - 90 * 86_400_000).toISOString())
    .order("created_at", { ascending: false })
    .limit(400);
  // primeira fala de cada conversa é a pergunta "de verdade"
  const first = new Map<string, string>();
  for (const m of [...(data ?? [])].reverse())
    if (m.body && !first.has(m.conversation_id)) first.set(m.conversation_id, m.body);
  return questionsFromConversations([...first.values()].reverse(), 12);
}

async function kbArticles(accountId: string) {
  const { data } = await admin()
    .from("kb_articles")
    .select("title, body_md")
    .eq("account_id", accountId)
    .order("updated_at", { ascending: false })
    .limit(12);
  return (data ?? []).map((a) => ({ title: a.title, body: a.body_md ?? "" }));
}

interface GenOut {
  cases?: { question?: unknown; expected?: unknown; kind?: unknown; must_handoff?: unknown }[];
}

/** Gera (ou regera) a suíte automática do agente. Casos manuais do gestor ficam. */
export async function generateSuite(accountId: string, agentId: string, userId: string | null) {
  const db = admin();
  const { data: agent } = await db
    .from("ai_agents")
    .select("*")
    .eq("id", agentId)
    .eq("account_id", accountId)
    .maybeSingle();
  if (!agent) throw new HttpError(404, "Agente não encontrado", "not_found");
  const [kb, questions] = await Promise.all([kbArticles(accountId), realQuestions(accountId)]);
  const template = templateFor(agent.template_key ?? agent.role);
  let generated: EvalSeed[] = [];
  let usedAi = false;
  if (kb.length || questions.length) {
    try {
      const { data } = await callJson<GenOut>(accountId, "agent_eval_generate", {
        system:
          "Você monta testes de atendimento por IA para uma empresa brasileira. Para cada pergunta, escreva o critério de aprovação: o que a resposta PRECISA conter e o que NÃO pode fazer. Use só fatos da base dada; se a base não responde, o critério é passar para humano sem inventar.",
        messages: [
          {
            role: "user",
            content: [
              `Agente: ${agent.name}, papel ${agent.role}. Objetivo: ${agent.goal}. Regras: ${agent.instructions.slice(0, 1500)}`,
              kb.length
                ? `BASE:\n${kb.map((k) => `# ${k.title}\n${k.body.slice(0, 700)}`).join("\n\n")}`
                : "BASE: (vazia)",
              questions.length
                ? `PERGUNTAS REAIS DE CLIENTES:\n${questions.map((q) => `- ${q}`).join("\n")}`
                : "",
              "Gere até 10 casos: use as perguntas reais (kind=custom) e perguntas sobre a base (kind=knowledge).",
            ]
              .filter(Boolean)
              .join("\n\n"),
          },
        ],
        schemaName: "suite",
        schema: {
          type: "object",
          properties: {
            cases: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  question: { type: "string" },
                  expected: { type: "string" },
                  kind: { type: "string", enum: ["knowledge", "custom", "handoff"] },
                  must_handoff: { type: "boolean" },
                },
                required: ["question", "expected", "kind"],
              },
            },
          },
          required: ["cases"],
        },
        maxTokens: 2500,
      });
      generated = acceptGenerated(data.cases ?? []);
      usedAi = generated.length > 0;
    } catch (err) {
      console.error("[agentes] gerar suíte por IA falhou, usando a base direto", err);
    }
  }
  if (!generated.length)
    generated = [
      ...seedsFromKb(kb),
      ...questions.slice(0, 6).map((q) => ({
        kind: "custom" as const,
        question: q,
        expected:
          "Responde com base no que a empresa informou (base e catálogo), curto e sem inventar. Se não souber, passa para humano.",
      })),
    ];
  const suite = buildSuite([template?.evals ?? [], generated]);
  await db
    .from("agent_evals")
    .delete()
    .eq("agent_id", agentId)
    .in("source", ["kb", "conversation", "template"]);
  const rows = suite.map((c) => ({
    account_id: accountId,
    agent_id: agentId,
    kind: c.kind,
    question: c.question,
    expected: c.expected,
    must_handoff: c.must_handoff ?? false,
    fail_tool: c.fail_tool ?? null,
    // de onde veio a pergunta: conversa real, base (inclusive as que a IA gerou a partir dela) ou modelo
    source: (questions.includes(c.question)
      ? "conversation"
      : c.kind === "knowledge" || generated.includes(c)
        ? "kb"
        : "template") as "kb" | "conversation" | "template",
    created_by: userId,
  }));
  if (rows.length) {
    const { error } = await db.from("agent_evals").insert(rows);
    if (error) throw new HttpError(500, error.message, "evals");
  }
  return { cases: rows.length, fromKb: kb.length, fromConversations: questions.length, usedAi };
}

export async function estimate(accountId: string, agentId: string) {
  const { count } = await admin()
    .from("agent_evals")
    .select("id", { count: "exact", head: true })
    .eq("agent_id", agentId)
    .eq("active", true);
  const { model, provider } = await providerModel(accountId);
  const e = estimateSuiteCost(count ?? 0, model, 7000);
  return {
    cases: count ?? 0,
    model,
    provider,
    usd: e.usd,
    calls: e.calls,
    usesAccountKey: provider !== "lovable",
  };
}

export async function startRun(
  accountId: string,
  agentId: string,
  userId: string,
  activate: boolean,
) {
  const db = admin();
  const { data: agent } = await db
    .from("ai_agents")
    .select("id, version")
    .eq("id", agentId)
    .eq("account_id", accountId)
    .maybeSingle();
  if (!agent) throw new HttpError(404, "Agente não encontrado", "not_found");
  const { data: running } = await db
    .from("agent_eval_runs")
    .select("id")
    .eq("agent_id", agentId)
    .in("status", ["queued", "running"])
    .gte("created_at", new Date(Date.now() - 30 * 60_000).toISOString())
    .limit(1)
    .maybeSingle();
  if (running) throw new HttpError(409, "Já tem uma avaliação rodando para este agente", "running");
  const est = await estimate(accountId, agentId);
  if (!est.cases) throw new HttpError(400, "Gere a suíte de perguntas antes de avaliar", "empty");
  const { data: run, error } = await db
    .from("agent_eval_runs")
    .insert({
      account_id: accountId,
      agent_id: agentId,
      agent_version: agent.version,
      status: "queued",
      total: est.cases,
      estimated_cost_usd: est.usd,
      model: est.model,
      started_by: userId,
    })
    .select("id")
    .single();
  if (error || !run) throw new HttpError(500, error?.message ?? "não criou a avaliação", "run");
  await db.rpc("enqueue_job", {
    _account: accountId,
    _kind: "agents.eval",
    _payload: { run_id: run.id, activate } as never,
    _dedupe: `agents.eval:${run.id}:0`,
  });
  return { runId: run.id, ...est };
}

/** Um lote da avaliação; reenfileira a si mesma até acabar. */
export async function runEvalBatch(
  runId: string,
  activate: boolean,
): Promise<Record<string, unknown>> {
  const db = admin();
  const { data: run } = await db.from("agent_eval_runs").select("*").eq("id", runId).maybeSingle();
  if (!run || run.status === "done" || run.status === "error")
    return { skipped: "avaliação já terminou" };
  const accountId = run.account_id;
  const { data: account } = await db
    .from("accounts")
    .select("name, timezone")
    .eq("id", accountId)
    .single();
  const { agents, tools } = await loadTeam(accountId);
  const agent = agents.find((a) => a.id === run.agent_id);
  if (!agent) {
    await db
      .from("agent_eval_runs")
      .update({ status: "error", error: "agente removido", finished_at: new Date().toISOString() })
      .eq("id", runId);
    return { error: "agente removido" };
  }
  if (agent.version !== run.agent_version) {
    await db
      .from("agent_eval_runs")
      .update({
        status: "error",
        error: "o agente mudou durante a avaliação; rode de novo",
        finished_at: new Date().toISOString(),
      })
      .eq("id", runId);
    return { error: "versão mudou" };
  }
  const { data: cases } = await db
    .from("agent_evals")
    .select("*")
    .eq("agent_id", agent.id)
    .eq("active", true)
    .order("created_at");
  const done = (Array.isArray(run.results) ? run.results : []) as unknown as CaseResult[];
  const doneIds = new Set(done.map((r) => r.case_id));
  const pending = (cases ?? []).filter((c) => !doneIds.has(c.id));
  await db
    .from("agent_eval_runs")
    .update({ status: "running", total: (cases ?? []).length })
    .eq("id", runId);
  const roster = agents.map((a) =>
    a.id === agent.id ? { ...lite(a), status: "active" as const } : lite(a),
  );
  let cost = Number(run.cost_usd ?? 0);
  const fresh: CaseResult[] = [];
  for (const c of pending.slice(0, BATCH)) {
    const ec: EvalCase = {
      id: c.id,
      kind: c.kind,
      question: c.question,
      history: (Array.isArray(c.history) ? c.history : []) as EvalCase["history"],
      expected: c.expected,
      must_handoff: c.must_handoff,
      fail_tool: c.fail_tool,
    };
    let o: AgentOutcome;
    try {
      const t = await runAgentTurn({
        accountId,
        company: account?.name ?? "",
        agent,
        tools,
        roster,
        history: [...ec.history, { role: "user", content: ec.question }],
        contactText: "(avaliação: cliente de teste, sem ficha)",
        contactId: null,
        conversationId: null,
        platform: "whatsapp",
        greeted: ec.history.length > 0,
        collected: {},
        surveyPending: false,
        handoffSummary: null,
        dryRun: true,
        failTool: ec.fail_tool,
        runId: null,
        evalRunId: runId,
        tz: account?.timezone ?? "America/Sao_Paulo",
      });
      cost += t.costUsd;
      o = {
        action: t.action,
        reply: t.reply,
        routedTo: t.routeTo,
        toolsCalled: t.toolsCalled,
        error: null,
      };
    } catch (err) {
      o = {
        action: "error",
        reply: "",
        routedTo: null,
        toolsCalled: [],
        error: err instanceof Error ? err.message : String(err),
      };
    }
    let grade = preGrade(ec, o);
    if (!grade) {
      try {
        const p = judgePrompt(ec, o);
        const j = await callJson<{ passed: boolean; reason: string }>(
          accountId,
          "agent_eval_judge",
          {
            system: p.system,
            messages: [{ role: "user", content: p.user }],
            schemaName: "veredito",
            schema: JUDGE_SCHEMA,
            maxTokens: 300,
          },
        );
        cost += estimateCost(j.model, 900, 120);
        grade = {
          passed: j.data.passed === true,
          reason: String(j.data.reason ?? "").slice(0, 300),
        };
      } catch (err) {
        grade = {
          passed: false,
          reason: `juiz indisponível: ${err instanceof Error ? err.message : String(err)}`.slice(
            0,
            300,
          ),
        };
      }
    }
    fresh.push({
      case_id: c.id,
      kind: c.kind,
      question: c.question,
      action: o.action,
      reply: o.reply.slice(0, 1000),
      passed: grade.passed,
      reason: grade.reason,
      tools: o.toolsCalled,
    });
  }
  const results = [...done, ...fresh];
  const remaining = pending.length - fresh.length;
  if (remaining > 0) {
    await db
      .from("agent_eval_runs")
      .update({
        results: results as never,
        cost_usd: cost,
        passed: results.filter((r) => r.passed).length,
      })
      .eq("id", runId);
    await db.rpc("enqueue_job", {
      _account: accountId,
      _kind: "agents.eval",
      _payload: { run_id: runId, activate } as never,
      _dedupe: `agents.eval:${runId}:${results.length}`,
    });
    return { done: results.length, remaining };
  }
  const s = summarize(results);
  await db
    .from("agent_eval_runs")
    .update({
      status: "done",
      results: results as never,
      total: s.total,
      passed: s.passed,
      pass_rate: s.pass_rate,
      cost_usd: cost,
      finished_at: new Date().toISOString(),
    })
    .eq("id", runId);
  let activated = false;
  if (activate && s.approved) {
    const { error } = await db
      .from("ai_agents")
      .update({ status: "active" })
      .eq("id", agent.id)
      .eq("version", run.agent_version);
    activated = !error;
  }
  if (run.started_by)
    await db.rpc("notify_user", {
      _account: accountId,
      _user: run.started_by,
      _kind: "agent_eval",
      _title: `Avaliação de ${agent.name}: ${Math.round(s.pass_rate * 100)}%`,
      _body: s.approved
        ? activated
          ? "Passou e o agente foi ligado."
          : "Passou. Já pode ligar o agente."
        : "Abaixo de 90%: veja os casos que falharam e ajuste as regras.",
      _link: "/equipe-ia",
    });
  return { ...s, activated };
}

// ───────────────────────── criar agente por conversa ─────────────────────────
interface Draft {
  name?: string;
  role?: string;
  persona?: string;
  goal?: string;
  instructions?: string;
  policy?: string;
  tools?: string[];
  survey?: string;
}

/** Pode ser porta de entrada destes canais? Só se nenhuma outra porta disputa os mesmos canais. */
async function entryFree(accountId: string, channels: string[]): Promise<boolean> {
  const { data } = await admin()
    .from("ai_agents")
    .select("channels")
    .eq("account_id", accountId)
    .eq("is_entry", true);
  return !(data ?? []).some((a) => entryConflict(a.channels ?? [], channels));
}

// quem recebe a primeira mensagem de um canal; cobrança, agenda e pós-venda entram por passagem
const FRONT_ROLES = new Set<AgentRole>(["reception", "sac", "sdr", "custom"]);

const withChannel = (name: string, channel: AgentChannel | null) =>
  (channel ? `${name} · ${agentChannelLabel(channel)}` : name).slice(0, 60);

export async function draftAgentFromText(
  accountId: string,
  userId: string,
  text: string,
  channel: AgentChannel | null = null,
) {
  const ask = text.trim().slice(0, 2000);
  if (ask.length < 10)
    throw new HttpError(400, "Descreva o agente com um pouco mais de detalhe", "short");
  const { data } = await callJson<Draft>(accountId, "agent_draft", {
    system:
      "Você monta a configuração de um agente de atendimento por IA a partir do pedido do gestor. Escreva em português do Brasil, regras em frases curtas, uma por linha. A política (limites de desconto, parcelas, prazos) vai no campo policy, exatamente como o gestor disse. Escolha só ferramentas da lista.",
    messages: [{ role: "user", content: ask }],
    schemaName: "agente",
    schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Nome curto do agente" },
        role: { type: "string", enum: ROLES.map((r) => r.id) },
        persona: { type: "string" },
        goal: { type: "string" },
        instructions: { type: "string" },
        policy: { type: "string" },
        tools: {
          type: "array",
          items: { type: "string", enum: INTERNAL_TOOLS.map((t) => t.slug) },
        },
        survey: { type: "string", enum: ["off", "csat", "nps"] },
      },
      required: ["name", "role", "goal", "instructions", "tools"],
    },
    maxTokens: 1500,
  });
  const role = (ROLES.some((r) => r.id === data.role) ? data.role : "custom") as AgentRole;
  const template = templateFor(role);
  const validTools = new Set(INTERNAL_TOOLS.map((t) => t.slug));
  const tools = [...new Set([...(data.tools ?? []), ...(template?.tools ?? [])])].filter((t) =>
    validTools.has(t),
  );
  const db = admin();
  const { data: agent, error } = await db
    .from("ai_agents")
    .insert({
      account_id: accountId,
      name: withChannel(String(data.name ?? template?.name ?? "Novo agente"), channel),
      role,
      channels: channel ? [channel] : [],
      // com canal escolhido, nasce como a porta de entrada dele (se o canal ainda não tem uma)
      is_entry: !!channel && FRONT_ROLES.has(role) && (await entryFree(accountId, [channel])),
      template_key: template?.key ?? null,
      persona: String(data.persona ?? template?.persona ?? "").slice(0, 400),
      goal: String(data.goal ?? template?.goal ?? "").slice(0, 1000),
      instructions: String(data.instructions ?? "").slice(0, 12000),
      settings: {
        ...(template?.settings ?? {}),
        ...(data.policy ? { policy: String(data.policy).slice(0, 4000) } : {}),
        ...(data.survey === "csat" || data.survey === "nps" ? { survey: data.survey } : {}),
      } as never,
      source: "conversation",
      created_by: userId,
    })
    .select("id, name")
    .single();
  if (error || !agent) throw new HttpError(500, error?.message ?? "não criou o agente", "create");
  if (tools.length)
    await db.from("agent_tools").insert(
      tools.map((slug) => ({
        account_id: accountId,
        agent_id: agent.id,
        kind: "internal" as const,
        slug,
      })),
    );
  const suite = await generateSuite(accountId, agent.id, userId);
  const est = await estimate(accountId, agent.id);
  return { agentId: agent.id, name: agent.name, role, tools, suite, estimate: est };
}

export async function createFromTemplate(
  accountId: string,
  userId: string,
  key: string,
  channel: AgentChannel | null = null,
) {
  const t = templateFor(key);
  if (!t) throw new HttpError(400, "Modelo desconhecido", "bad_template");
  const db = admin();
  const channels = channel && t.role !== "supervisor" ? [channel] : [];
  // porta de entrada: a recepção (ou qualquer modelo criado para um canal) se o canal está livre
  const wantsEntry = !!t.isEntry || (channels.length > 0 && FRONT_ROLES.has(t.role));
  const isEntry = wantsEntry && (await entryFree(accountId, channels));
  const { data: agent, error } = await db
    .from("ai_agents")
    .insert({
      account_id: accountId,
      name: withChannel(t.name, channels.length ? channel : null),
      role: t.role,
      channels,
      template_key: t.key,
      persona: t.persona,
      goal: t.goal,
      instructions: t.instructions,
      settings: (t.settings ?? {}) as never,
      is_entry: isEntry,
      status: t.role === "supervisor" ? "active" : "draft",
      source: "template",
      created_by: userId,
    })
    .select("id")
    .single();
  if (error || !agent) throw new HttpError(500, error?.message ?? "não criou o agente", "create");
  await db.from("agent_tools").insert(
    t.tools.map((slug) => ({
      account_id: accountId,
      agent_id: agent.id,
      kind: "internal" as const,
      slug,
    })),
  );
  // a suíte de testes sai pela fila: criar o agente não espera a IA escrever os casos
  if (t.role !== "supervisor")
    await db.rpc("enqueue_job", {
      _account: accountId,
      _kind: "agents.suite",
      _payload: { agent_id: agent.id, user_id: userId } as never,
      _dedupe: `agents.suite:${agent.id}`,
    });
  return { agentId: agent.id };
}
