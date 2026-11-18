// Motor Agents SDK (OpenAI) do piloto automático. Mesmo contrato do motor clássico
// (TurnInput → TurnOutcome), com o que ele não tinha:
// - handoff nativo: toda a equipe ativa vira um grafo de agentes e a passagem acontece
//   dentro da rodada, com a conversa inteira (quem respondeu volta em answeredBy);
// - guardrail de saída: a mesma trava de preço/promessa do clássico, como tripwire;
// - aprovação humana: ferramenta sensível PAUSA a rodada; o estado vai para agent_approvals
//   e o gestor aprova ou recusa depois (resumeApproval retoma de onde parou).
// O modelo é o da conta (chooseProvider) pelo adaptador do AI SDK; tracing da OpenAI desligado
// (os dados ficam no nosso banco: agent_tool_calls, agent_handoffs, llm_calls).
import type { Agent as SdkAgent, AgentInputItem, RunToolApprovalItem } from "@openai/agents";

import { admin } from "@/backend/http.server";
import { estimateCost } from "@/backend/llm-core";
import { chooseProvider } from "@/backend/llm.server";
import { checkReply } from "@/backend/support/agent-logic";
import { maskText } from "@/lib/mask-sensitive";

import type { AgentRow, TurnInput, TurnOutcome } from "../orchestrator.server";
import { controlTools } from "../orchestrator-logic";
import { runTool } from "../tools.server";
import type { Turn } from "../tool-loop";
import {
  approvalSummary,
  REJECTED_FALLBACK,
  REJECTION_TO_MODEL,
  requiresApproval,
  sdkAgentName,
  WAITING_MESSAGE,
} from "./policy";

const MAX_TURNS = 10;
const HUMAN_TOOL = "handoff_to_human";
/** Só na voz: desligar. A rota da voz converte no end_call da ElevenLabs. */
export const END_CALL_TOOL = "encerrar_ligacao";

export type SdkOutcome = TurnOutcome & {
  /** id do agente que respondeu, quando a passagem aconteceu dentro da rodada */
  answeredBy?: string;
  /** a rodada parou esperando o gestor */
  approvalId?: string;
};

type Sdk = typeof import("@openai/agents");

let loaded: Promise<Sdk> | null = null;
// carga preguiçosa: só a rota que usa o piloto automático paga o peso do SDK
async function sdk(): Promise<Sdk> {
  loaded ??= import("@openai/agents").then((m) => {
    m.setTracingDisabled(true);
    return m;
  });
  return loaded;
}

/** Carrega o SDK e o provedor da conta antes da 1ª vez (a voz aquece ao discar). */
export async function warmEngine(accountId: string): Promise<void> {
  await sdk();
  await modelFor(accountId);
}

async function modelFor(accountId: string) {
  // ligação e equipe SDK: modelo rápido (cada segundo pensando é silêncio na linha)
  const choice = await chooseProvider(accountId, { tier: "voice" });
  const { aisdk } = await import("@openai/agents-extensions/ai-sdk");
  const { wrapLanguageModel, defaultSettingsMiddleware } = await import("ai");
  const { GATEWAY_URL, gatewayHeaders, isGatewayClaude } = await import("@/backend/ai/models");
  let base;
  if (
    choice.provider === "anthropic" ||
    (choice.provider === "lovable" && isGatewayClaude(choice.model))
  ) {
    const { createAnthropic } = await import("@ai-sdk/anthropic");
    const anthropic =
      choice.provider === "anthropic"
        ? createAnthropic({ apiKey: choice.key })
        : createAnthropic({
            apiKey: choice.key,
            baseURL: GATEWAY_URL,
            headers: gatewayHeaders(choice.key),
          });
    // Haiku/Claude 5: sem desligar, o raciocínio sai do mesmo teto de tokens e a resposta volta
    // cortada, e em voz cada segundo pensando é silêncio na linha (Opus 5.5 não desliga: não entra aqui)
    const { supportsForcedTool } = await import("@/backend/llm-core");
    // Opus 5.5 / Sonnet 5.5 recusam "disabled" (400): neles o raciocínio fica, com esforço baixo
    base = wrapLanguageModel({
      model: anthropic(choice.model),
      middleware: defaultSettingsMiddleware({
        settings: {
          providerOptions: {
            anthropic: supportsForcedTool(choice.model)
              ? { thinking: { type: "disabled" } }
              : { effort: "low" },
          },
        },
      }),
    });
  } else {
    const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
    const baseURL = choice.provider === "openai" ? "https://api.openai.com/v1" : GATEWAY_URL;
    base = createOpenAICompatible({ name: choice.provider, baseURL, apiKey: choice.key }).chatModel(
      choice.model,
    );
    if (choice.provider === "lovable")
      // Gemini sem "pensamento": mais rápido e sem assinatura de pensamento entre as voltas
      base = wrapLanguageModel({
        model: base,
        middleware: defaultSettingsMiddleware({
          settings: { providerOptions: { lovable: { reasoning_effort: "none" } } },
        }),
      });
  }
  // o adaptador traz a própria cópia dos tipos do SDK: o objeto é o mesmo Model em tempo de execução
  return { model: aisdk(base) as never, choice };
}

interface Team {
  root: SdkAgent;
  byName: Map<string, AgentRow>;
  /** o pedido de humano (handoff_to_human) da rodada, se houve */
  human: { reason: string; summary: string; message: string } | null;
  prices: number[];
  /** o modelo escolhido nesta rodada (o registro de custo reaproveita, sem ler o cofre de novo) */
  choice: Awaited<ReturnType<typeof modelFor>>["choice"];
  /** a voz pediu para desligar nesta rodada */
  endCall: boolean;
}

/** Monta a equipe ativa como grafo do SDK, começando pelo agente da conversa. */
async function buildTeam(
  input: TurnInput,
  agents: AgentRow[],
  ctx?: ReturnType<typeof import("../orchestrator.server").preloadContext>,
): Promise<Team> {
  const m = await sdk();
  const { prepareAgent, preloadContext } = await import("../orchestrator.server");
  const userTexts = input.history
    .filter((t) => t.role === "user")
    .map((t) => (t as { content: string }).content);
  // modelo (lê o cofre) e base (vetor + busca) em paralelo: na voz, cada segundo é silêncio
  const [{ model, choice }, ctxData] = await Promise.all([
    modelFor(input.accountId),
    ctx ?? preloadContext(input.accountId, userTexts.slice(-3).join("\n")),
  ]);
  const team: Team = {
    root: null as unknown as SdkAgent,
    byName: new Map(),
    human: null,
    prices: [],
    choice,
    endCall: false,
  };
  team.prices = ctxData.products.map((p) => p.price);

  const members = [input.agent, ...agents.filter((x) => x.id !== input.agent.id)].filter(
    (x) => x.id === input.agent.id || (x.status === "active" && x.role !== "supervisor"),
  );
  const built = new Map<string, SdkAgent>();
  for (const a of members) {
    const prep = await prepareAgent(input, a, { ctxData }, "sdk");
    const human = controlTools([]).find((t) => t.name === HUMAN_TOOL)!;
    const specs = [...prep.internalSpecs, ...prep.composioSpecs];
    const tools = [
      ...specs.map((spec) => {
        const row = prep.mine.find((t) => t.slug === spec.name);
        const isComposio = prep.toolCtx.composioSlugs.has(spec.name);
        return m.tool({
          name: spec.name,
          description: spec.description,
          parameters: { ...(spec.parameters as object), additionalProperties: true } as never,
          strict: false,
          needsApproval: requiresApproval(spec.name, { isComposio, config: row?.config }),
          execute: async (args: unknown) => {
            const out = await runTool(prep.toolCtx, {
              id: crypto.randomUUID(),
              name: spec.name,
              args: (args ?? {}) as Record<string, unknown>,
            });
            return out.ok ? JSON.stringify(out.data).slice(0, 16_000) : `ERRO: ${out.error}`;
          },
        });
      }),
      m.tool({
        name: HUMAN_TOOL,
        description: human.description,
        parameters: { ...(human.parameters as object), additionalProperties: true } as never,
        strict: false,
        execute: async (args: unknown) => {
          const g = (args ?? {}) as Record<string, unknown>;
          team.human = {
            reason: String(g["reason"] ?? "o agente pediu humano"),
            summary: String(g["summary"] ?? ""),
            message: String(g["message_to_customer"] ?? "") || a.handoff_message,
          };
          // registrado como toda ferramenta: a ligação de 28/10 disse "já passei" sem nada gravado
          await admin()
            .from("agent_tool_calls")
            .insert({
              account_id: input.accountId,
              agent_id: a.id,
              conversation_id: input.conversationId,
              run_id: input.runId,
              eval_run_id: input.evalRunId,
              kind: "internal",
              tool: HUMAN_TOOL,
              args: g as never,
              ok: true,
              dry_run: input.dryRun,
              latency_ms: 0,
            });
          // sem conversa do Vínculo (ligação): quem fica sabendo é o gestor; com conversa, o fluxo
          // da conversa já passa para humano e avisa
          if (!input.conversationId && !input.dryRun) {
            const { notifyManagers } = await import("../tools.server");
            await notifyManagers(
              input.accountId,
              "Ligação pede retorno de uma pessoa",
              `${team.human.reason}. ${team.human.summary}`.slice(0, 600),
              null,
            );
          }
          return input.dryRun
            ? "registrado (ensaio: ninguém foi avisado de verdade)"
            : "registrado: a equipe foi avisada e vai retornar";
        },
      }),
      // ligação: sem isso a IA não desliga (caixa postal num teste de 28/10: 2 min de "boa noite")
      ...(input.platform === "voice"
        ? [
            m.tool({
              name: END_CALL_TOOL,
              description:
                "Desliga a ligação. Use depois de se despedir: conversa terminou, caixa postal (recado já deixado), a pessoa pediu para encerrar ou não responde mais.",
              parameters: {
                type: "object",
                properties: {
                  despedida: {
                    type: "string",
                    description: "a última frase, curta (ex.: 'Obrigada, boa noite!')",
                  },
                },
                required: ["despedida"],
                additionalProperties: false,
              } as never,
              strict: false,
              execute: async (args: unknown) => {
                team.endCall = true;
                return String((args as { despedida?: unknown } | null)?.despedida ?? "").slice(
                  0,
                  200,
                );
              },
            }),
          ]
        : []),
    ];
    const name = sdkAgentName(a.name, a.id);
    const agent = new m.Agent({
      name,
      handoffDescription:
        `${a.name}: ${a.goal || a.role}`.slice(0, 400) || `Agente ${a.role} da equipe`,
      instructions: maskText(prep.system),
      model,
      tools,
      toolUseBehavior: { stopAtToolNames: [HUMAN_TOOL, END_CALL_TOOL] },
      outputGuardrails: [
        {
          name: "trava_de_preco_e_promessa",
          execute: async ({ agentOutput }) => {
            const g = checkReply(String(agentOutput ?? ""), team.prices);
            return { outputInfo: g.problems, tripwireTriggered: !g.ok };
          },
        },
      ],
    });
    built.set(a.id, agent);
    team.byName.set(name, a);
  }
  // cada um pode passar para qualquer outro da equipe (o SDK gera transfer_to_<nome>)
  for (const [id, agent] of built)
    agent.handoffs = [...built].filter(([other]) => other !== id).map(([, x]) => x);
  team.root = built.get(input.agent.id)!;
  return team;
}

/** O mínimo que lemos do fim de uma rodada (os genéricos do RunResult não ajudam aqui). */
interface RunLike {
  state: { toString(): string };
  lastAgent?: { name: string } | undefined;
  newItems: { type: string; rawItem: unknown }[];
  interruptions: unknown[];
  finalOutput?: unknown;
}

function historyItems(history: Turn[]): AgentInputItem[] {
  return history.flatMap((t): AgentInputItem[] => {
    if (t.role === "user") return [{ role: "user" as const, content: maskText(t.content) }];
    if (t.role === "assistant")
      return [
        {
          role: "assistant" as const,
          status: "completed" as const,
          content: [{ type: "output_text" as const, text: t.content }],
        },
      ];
    return [];
  });
}

async function logUsage(
  accountId: string,
  purpose: string,
  result: RunLike,
  started: number,
  choice: Team["choice"],
) {
  const usage = (
    result.state as unknown as {
      _context?: { usage?: { inputTokens: number; outputTokens: number } };
    }
  )._context?.usage;
  const input = usage?.inputTokens ?? null;
  const output = usage?.outputTokens ?? null;
  const db = admin();
  await db.from("llm_calls").insert({
    account_id: accountId,
    purpose,
    provider: choice.provider,
    model: choice.model,
    input_tokens: input,
    output_tokens: output,
    latency_ms: Date.now() - started,
    ok: true,
    error: null,
  });
  await db.from("usage_ledger").insert({
    account_id: accountId,
    kind: "llm",
    quantity: (input ?? 0) + (output ?? 0),
    unit: "tokens",
    cost_usd: estimateCost(choice.model, input, output),
    meta: { purpose, model: choice.model, engine: "agents_sdk" },
  });
  return estimateCost(choice.model, input, output);
}

function base(o: Partial<SdkOutcome> & Pick<SdkOutcome, "action" | "reply">): SdkOutcome {
  return {
    reason: "",
    summary: "",
    routeTo: null,
    confidence: 0.7,
    toolsCalled: [],
    sources: [],
    costUsd: 0,
    model: "agents-sdk",
    ...o,
  };
}

/** Lê o fim de uma rodada do SDK (resposta, humano, pausa) no formato do Vínculo. */
async function settle(
  input: {
    accountId: string;
    conversationId: string | null;
    runId: string | null;
    dryRun: boolean;
  },
  rootAgentId: string,
  team: Team,
  result: RunLike,
  started: number,
): Promise<SdkOutcome> {
  const cost = await logUsage(
    input.accountId,
    input.dryRun ? "agent_eval" : "agent_team",
    result,
    started,
    team.choice,
  );
  const last = result.lastAgent ? team.byName.get(result.lastAgent.name) : undefined;
  const toolsCalled = result.newItems
    .filter((i) => i.type === "tool_call_item")
    .map((i) => String((i.rawItem as { name?: string }).name ?? ""))
    .filter(Boolean);
  const common = {
    costUsd: cost,
    toolsCalled,
    ...(last && last.id !== rootAgentId ? { answeredBy: last.id } : {}),
  };

  if (result.interruptions.length) {
    const items = result.interruptions as RunToolApprovalItem[];
    const asks = items.map((it) => {
      const raw = it.rawItem as { name?: string; arguments?: string };
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(raw.arguments ?? "{}") as Record<string, unknown>;
      } catch {
        /* argumentos fora de JSON: o gestor vê só o nome */
      }
      const owner = team.byName.get(it.agent.name);
      return {
        tool: raw.name ?? "ferramenta",
        args,
        summary: approvalSummary(raw.name ?? "", args, owner?.name ?? ""),
      };
    });
    const { data, error } = await admin()
      .from("agent_approvals")
      .insert({
        account_id: input.accountId,
        conversation_id: input.conversationId,
        agent_id: (last ?? team.byName.get(items[0]!.agent.name))?.id ?? null,
        root_agent_id: rootAgentId,
        run_id: input.runId,
        tool: asks
          .map((a) => a.tool)
          .join(", ")
          .slice(0, 120),
        args: (asks.length === 1 ? asks[0]!.args : asks.map((a) => a.args)) as never,
        summary: asks
          .map((a) => a.summary)
          .join(" ")
          .slice(0, 2000),
        run_state: result.state.toString(),
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(`aprovação: ${error?.message ?? "sem linha"}`);
    return base({
      action: "reply",
      reply: WAITING_MESSAGE,
      reason: `aguardando aprovação: ${asks.map((a) => a.summary).join(" ")}`.slice(0, 500),
      approvalId: data.id,
      ...common,
    });
  }
  if (team.human)
    return base({
      action: "handoff",
      reply: team.human.message,
      reason: team.human.reason,
      summary: team.human.summary,
      confidence: 1,
      ...common,
    });
  const reply = String(result.finalOutput ?? "").trim();
  return base({ action: "reply", reply, reason: "respondido pelo agente (Agents SDK)", ...common });
}

/** Trava e limite de voltas viram passagem para a equipe; o resto é erro de verdade. */
function guarded(m: Sdk, err: unknown, handoffMessage: string): SdkOutcome {
  if (err instanceof m.OutputGuardrailTripwireTriggered)
    return base({
      action: "handoff",
      reply: handoffMessage,
      reason: "trava: a resposta prometia preço ou condição fora do catálogo",
      summary: "A IA ia responder algo fora da regra; a equipe assume.",
      confidence: 0,
    });
  if (err instanceof m.MaxTurnsExceededError)
    return base({
      action: "handoff",
      reply: handoffMessage,
      reason: "a IA não fechou a resposta",
      confidence: 0,
    });
  throw err;
}

/** Uma rodada da equipe pelo Agents SDK. Mesmo contrato do runAgentTurn clássico. */
export async function runSdkTurn(input: TurnInput, agents: AgentRow[]): Promise<SdkOutcome> {
  const m = await sdk();
  const started = Date.now();
  const team = await buildTeam(input, agents);
  try {
    const result = await m.run(team.root, historyItems(input.history), { maxTurns: MAX_TURNS });
    return await settle(input, input.agent.id, team, result as unknown as RunLike, started);
  } catch (err) {
    return guarded(m, err, input.agent.handoff_message);
  }
}

/**
 * A mesma rodada, soltando o texto enquanto o modelo escreve (voz: o que importa é o tempo até
 * a primeira palavra). onText recebe cada pedaço; no fim devolve o resultado como runSdkTurn.
 * Limite conhecido: a trava de saída roda no FIM, então numa ligação o trecho já falado não
 * volta atrás; se ela disparar, quem chama fala a passagem para a equipe em seguida.
 */
export async function streamSdkTurn(
  input: TurnInput,
  agents: AgentRow[],
  onText: (delta: string) => void,
  /** marcos de tempo (equipe montada etc.), para medir a latência da voz */
  mark: (name: string) => void = () => {},
  opts: {
    /** a base já começou a ser buscada (a voz começa na chegada do pedido) */
    ctx?: ReturnType<typeof import("../orchestrator.server").preloadContext>;
    /** uma ferramenta começou a rodar (a voz avisa "deixa eu ver" só nessa hora) */
    onTool?: (name: string) => void;
    /** o agente pediu para desligar (só na voz) */
    onEndCall?: () => void;
  } = {},
): Promise<SdkOutcome> {
  const m = await sdk();
  mark("sdk");
  const started = Date.now();
  const team = await buildTeam(input, agents, opts.ctx);
  mark("equipe");
  try {
    const result = await m.run(team.root, historyItems(input.history), {
      maxTurns: MAX_TURNS,
      stream: true,
    });
    // os pedaços de texto são fragmentos de palavra: espaço só entra quando o texto volta
    // depois de uma etapa (ferramenta, passagem de agente), senão saía "para você.A base"
    let afterStep = false;
    let wrote = false;
    for await (const ev of result as unknown as AsyncIterable<{
      type: string;
      name?: string;
      item?: { rawItem?: { name?: string } };
      data?: { type?: string; delta?: string };
    }>) {
      if (ev.type === "run_item_stream_event" && ev.name === "tool_called")
        opts.onTool?.(ev.item?.rawItem?.name ?? "");
      if (ev.type === "raw_model_stream_event" && ev.data?.type === "output_text_delta") {
        let delta = ev.data.delta ?? "";
        if (!delta) continue;
        if (afterStep && wrote && !/^\s/.test(delta)) delta = ` ${delta}`;
        afterStep = false;
        wrote = true;
        onText(delta);
      } else if (ev.type !== "raw_model_stream_event") afterStep = true;
    }
    await result.completed;
    if (team.endCall) opts.onEndCall?.();
    return await settle(input, input.agent.id, team, result as unknown as RunLike, started);
  } catch (err) {
    return guarded(m, err, input.agent.handoff_message);
  }
}

/**
 * O gestor decidiu: remonta a mesma equipe, aprova ou recusa o que estava parado e deixa a
 * rodada terminar. Devolve o que o cliente deve receber (e quem respondeu).
 */
export async function resumeApproval(
  approvalId: string,
  decision: "approve" | "reject",
  userId: string,
): Promise<{ reply: string; outcome: SdkOutcome; conversationId: string | null }> {
  const m = await sdk();
  const db = admin();
  const { data: row } = await db.from("agent_approvals").select("*").eq("id", approvalId).single();
  if (!row) throw new Error("aprovação não encontrada");
  // trava otimista: só quem tirar do 'pending' primeiro decide (dois cliques não executam duas vezes)
  const { data: claimed } = await db
    .from("agent_approvals")
    .update({
      status: decision === "approve" ? "approved" : "rejected",
      decided_by: userId,
      decided_at: new Date().toISOString(),
    })
    .eq("id", approvalId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (!claimed) throw new Error("esta aprovação já foi decidida");

  try {
    const { loadTeam, lite } = await import("../orchestrator.server");
    const { agents, tools } = await loadTeam(row.account_id);
    const root = agents.find((a) => a.id === row.root_agent_id);
    if (!root) throw new Error("o agente desta conversa não existe mais");
    const conv = row.conversation_id
      ? (
          await db
            .from("conversations")
            .select("contact_id, channels(platform)")
            .eq("id", row.conversation_id)
            .single()
        ).data
      : null;
    const { data: account } = await db
      .from("accounts")
      .select("name, timezone")
      .eq("id", row.account_id)
      .single();
    const input: TurnInput = {
      accountId: row.account_id,
      company: account?.name ?? "",
      agent: root,
      tools,
      roster: agents.map(lite),
      history: [],
      contactText: "",
      contactId: (conv as { contact_id?: string } | null)?.contact_id ?? null,
      conversationId: row.conversation_id,
      platform:
        (conv as { channels?: { platform?: string } } | null)?.channels?.platform ?? "whatsapp",
      greeted: true,
      collected: {},
      surveyPending: false,
      handoffSummary: null,
      dryRun: !row.conversation_id,
      failTool: null,
      runId: row.run_id,
      evalRunId: null,
      tz: account?.timezone ?? "America/Sao_Paulo",
    };
    const team = await buildTeam(input, agents);
    const state = await m.RunState.fromString(team.root, row.run_state);
    for (const it of state.getInterruptions())
      if (decision === "approve") state.approve(it);
      else state.reject(it, { alwaysReject: true, message: REJECTION_TO_MODEL });
    const started = Date.now();
    // a retomada passa pelas mesmas travas da primeira rodada
    const outcome = await m
      .run(team.root, state, { maxTurns: MAX_TURNS })
      .then((result) => settle(input, root.id, team, result as unknown as RunLike, started))
      .catch((err: unknown) => guarded(m, err, root.handoff_message));
    const reply =
      outcome.reply || (decision === "reject" ? REJECTED_FALLBACK : "Pronto, resolvido por aqui.");
    await db
      .from("agent_approvals")
      .update({ outcome: reply.slice(0, 4000) })
      .eq("id", approvalId);
    return { reply, outcome, conversationId: row.conversation_id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db
      .from("agent_approvals")
      .update({ status: "error", outcome: msg.slice(0, 1000) })
      .eq("id", approvalId);
    throw err;
  }
}
