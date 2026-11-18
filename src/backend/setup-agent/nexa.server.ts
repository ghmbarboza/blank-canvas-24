// A conversa da assistente no modal: a fala chega em streaming (AI SDK) e cada ferramenta vira uma
// parte da mensagem que o front desenha. As ferramentas que mexem na central são as de
// tools.server.ts; o histórico vem do banco (nunca do navegador) e é gravado sem segredo.
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { stepCountIs, streamText, type LanguageModel, type ModelMessage } from "ai";

import { admin, type Caller } from "@/backend/http.server";
import { estimateCost } from "@/backend/llm-core";
import { GATEWAY_URL, gatewayHeaders, isGatewayClaude } from "@/backend/ai/models";
import { chooseProvider } from "@/backend/llm.server";
import { maskText } from "@/lib/mask-sensitive";

import { buildStageTools, buildWorkTools, friendlyStreamError, hideSecrets } from "./nexa-tools";
import { redact } from "./redact";
import { roteiroState, roteiroText } from "./roteiro";
import { REPLY, SETUP_TOOLS, setupSystem } from "./spec";
import { STAGE_TOOLS, blockNote, type StoredPart } from "./stage";
import { loadFacts, loadSnapshot, runSetupTool, type SetupCtx } from "./tools.server";

// A pessoa pode pedir várias coisas numa mensagem: o laço permite encadear ferramentas e ainda
// sobra uma volta para a fala final.
export const MAX_STEPS = 10;
const HISTORY = 24;
const MAX_OUTPUT = 6000;
// ler um site leva até 40 s; a rodada inteira nunca fica pendurada além disto
const TURN_TIMEOUT_MS = 110_000;
// erro passageiro do gateway (429, 5xx): o SDK tenta de novo com recuo curto antes de desistir
const MAX_RETRIES = 3;
const SECRET_TOOLS = new Set(["conectar_integracao", "conectar_zernio", "conectar_whatsapp"]);

type Choice = Awaited<ReturnType<typeof chooseProvider>>;

function modelOf(c: Choice): LanguageModel {
  if (c.provider === "anthropic") return createAnthropic({ apiKey: c.key })(c.model);
  // IA embutida: Claude pelo gateway do Lovable (formato Anthropic, raciocínio preservado pelo SDK)
  if (isGatewayClaude(c.model))
    return createAnthropic({ apiKey: c.key, baseURL: GATEWAY_URL, headers: gatewayHeaders(c.key) })(
      c.model,
    );
  const baseURL = c.provider === "openai" ? "https://api.openai.com/v1" : GATEWAY_URL;
  return createOpenAICompatible({ name: c.provider, baseURL, apiKey: c.key }).chatModel(c.model);
}

async function history(accountId: string): Promise<ModelMessage[]> {
  const { data } = await admin()
    .from("setup_messages")
    .select("role, content, parts")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(HISTORY);
  return (data ?? []).reverse().map((m): ModelMessage => {
    if (m.role === "user") return { role: "user", content: maskText(m.content) };
    // a IA lembra o que desenhou no palco (uma linha por bloco)
    const notes = ((m.parts ?? []) as unknown as StoredPart[])
      .filter((p) => p.type === "block" && p.block)
      .map((p) => blockNote(p.block!));
    return { role: "assistant", content: [m.content, ...notes].filter(Boolean).join("\n") };
  });
}

function firstName(caller: Caller) {
  return caller.email?.split("@")[0]?.split(/[._-]/)[0] ?? "a pessoa";
}

function argNames(a: Record<string, unknown>): string[] {
  return Object.keys(a).filter((k) => a[k] !== undefined && a[k] !== "");
}

/** Uma rodada: grava a fala, devolve o stream e, no fim, grava a resposta com o palco. */
export async function streamNexa(
  req: Request,
  caller: Caller,
  text: string,
  /** "tentar de novo": a fala já está gravada; não grava de novo nem repete no contexto */
  retry = false,
): Promise<Response> {
  const db = admin();
  const said = text.trim().slice(0, 8000);
  // tudo o que a rodada precisa sai em paralelo: o preparo era ~3,5 s em fila
  const [loaded, snapshot, facts, choice] = await Promise.all([
    history(caller.accountId),
    loadSnapshot(caller.accountId),
    loadFacts(caller.accountId),
    chooseProvider(caller.accountId, { tier: "deep" }),
  ]);
  let past = loaded;
  const last = past.at(-1);
  const isRepeat = retry && last?.role === "user" && last.content === maskText(redact(said).text);
  if (isRepeat) past = past.slice(0, -1);
  // a fala grava junto com a chamada à IA; a resposta só grava depois dela (onEnd espera)
  const savedUser: Promise<string | null> = isRepeat
    ? Promise.resolve(null)
    : Promise.resolve(
        db
          .from("setup_messages")
          .insert({
            account_id: caller.accountId,
            user_id: caller.userId,
            role: "user",
            content: redact(said).text,
          })
          .select("id")
          .single(),
      ).then(
        (r) => r.data?.id ?? null,
        () => null,
      );

  const ctx: SetupCtx = {
    req,
    caller,
    // o histórico gravado não tem as chaves (••••); por isso a mensagem atual entra inteira
    userText: [...past.filter((m) => m.role === "user").map((m) => String(m.content)), said].join(
      "\n",
    ),
  };
  const parts: StoredPart[] = [];
  const secrets = new Set<string>();

  const work = buildWorkTools({
    // aqui a fala é o texto do stream: a ferramenta responder (do motor antigo) não entra
    specs: SETUP_TOOLS.filter((spec) => spec.name !== REPLY.name),
    run: (name, args) => runSetupTool(ctx, name, args),
    parts,
    onSecrets: (values) => values.forEach((v) => secrets.add(v)),
    log: async (e) => {
      await db.from("agent_tool_calls").insert({
        account_id: caller.accountId,
        kind: "setup",
        tool: e.tool,
        // de ferramenta com segredo, só os nomes dos campos (nunca os valores)
        args: (SECRET_TOOLS.has(e.tool)
          ? { redigido: true, campos: argNames(e.args) }
          : e.args) as never,
        ok: e.ok,
        error: e.error,
        latency_ms: e.latencyMs,
      });
    },
  });
  const stage = buildStageTools(STAGE_TOOLS, parts);

  const system = setupSystem({
    snapshot,
    facts,
    person: firstName(caller),
    stage: true,
    roteiro: roteiroText(roteiroState(snapshot, facts)),
    today: new Date().toLocaleDateString("pt-BR", {
      dateStyle: "full",
      timeZone: "America/Sao_Paulo",
    }),
  });
  const started = Date.now();
  let failure: string | null = null;

  const result = streamText({
    model: modelOf(choice),
    system: maskText(system),
    // a IA vê o valor real só nesta rodada (para guardar no cofre); o histórico fica com ••••
    messages: [...past, { role: "user", content: maskText(said) }],
    tools: { ...work, ...stage },
    stopWhen: stepCountIs(MAX_STEPS),
    maxRetries: MAX_RETRIES,
    // o Gemini pensa antes de falar e o pensamento conta no teto: com 1500 ele já devolveu rodada
    // vazia (1470 tokens pensados, nenhuma palavra). Por isso o teto é alto.
    // reasoning_effort "low" travou a volta depois da ferramenta (assinatura de pensamento que o
    // provedor compatível não devolve). "none" desliga o pensamento: sem assinatura e mais rápido.
    maxOutputTokens: MAX_OUTPUT,
    // rodada nunca fica pendurada: passou do prazo, corta e grava o que tiver
    abortSignal: AbortSignal.timeout(TURN_TIMEOUT_MS),
    ...(choice.provider === "lovable"
      ? { providerOptions: { lovable: { reasoning_effort: "none" } } }
      : {}),
  });

  return result.toUIMessageStreamResponse({
    // sem isso o proxy da hospedagem segura o SSE e entrega tudo no fim (28/10: 25 s de uma vez)
    headers: {
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
    onError: (err) => {
      console.error("[assistente] stream", err instanceof Error ? err.message : err);
      failure = friendlyStreamError(err);
      return failure;
    },
    onEnd: async ({ responseMessage }) => {
      const userId = await savedUser;
      const spoken = responseMessage.parts
        .filter((p) => p.type === "text")
        .map((p) => (p as { text: string }).text)
        .join("\n")
        .trim();
      // segredo nunca fica gravado: nem na resposta, nem na fala da pessoa
      const final = hideSecrets(spoken || fallback(parts, failure), secrets);
      if (userId && secrets.size) {
        const clean = hideSecrets(said, secrets);
        await db.from("setup_messages").update({ content: clean }).eq("id", userId);
      }
      const usage = await Promise.resolve(result.totalUsage).catch(() => null);
      const input = usage?.inputTokens ?? null;
      const output = usage?.outputTokens ?? null;
      await Promise.all([
        db.from("setup_messages").insert({
          account_id: caller.accountId,
          role: "assistant",
          content: final.slice(0, 20_000),
          actions: parts.filter((p) => p.type === "action").map((p) => p.action) as never,
          parts: [{ type: "text", text: final }, ...parts] as never,
        }),
        db.from("llm_calls").insert({
          account_id: caller.accountId,
          purpose: "setup_agent",
          provider: choice.provider,
          model: choice.model,
          input_tokens: input,
          output_tokens: output,
          latency_ms: Date.now() - started,
          ok: Boolean(spoken || parts.length),
          error: spoken || parts.length ? null : (failure ?? "resposta vazia"),
        }),
        db.from("usage_ledger").insert({
          account_id: caller.accountId,
          kind: "llm",
          quantity: (input ?? 0) + (output ?? 0),
          unit: "tokens",
          cost_usd: estimateCost(choice.model, input, output),
          meta: { purpose: "setup_agent", model: choice.model },
        }),
      ]);
    },
  });
}

/** Se a IA só usou ferramentas e não falou nada, a pessoa ao menos sabe o que foi feito. */
export function fallback(parts: StoredPart[], failure: string | null = null): string {
  const acts = parts.filter((p) => p.type === "action").map((p) => p.action!);
  const done = acts.filter((a) => a.kind !== "error").map((a) => a.label);
  const failed = acts.filter((a) => a.kind === "error").map((a) => a.label);
  if (!done.length && !failed.length && parts.some((p) => p.type === "block"))
    return failure ?? "Está aqui embaixo. Me diga se é isso ou o que quer mudar.";
  // nada feito e nada dito: não finge que respondeu
  if (!done.length && !failed.length)
    return failure ?? "Desculpa, me perdi aqui. Pode me dizer de novo, com outras palavras?";
  return [
    done.length ? `Feito: ${done.join("; ")}.` : "",
    failed.length ? `Não consegui: ${failed.join("; ")}.` : "",
    failure ?? "O que mais você quer configurar?",
  ]
    .filter(Boolean)
    .join(" ");
}
