// Nexa no modal: a fala chega em streaming (AI SDK) e cada ferramenta de palco vira uma
// parte da mensagem que o front desenha. As ferramentas que mexem na central são as mesmas
// de tools.server.ts; o histórico vem do banco (nunca do navegador) e é gravado sem segredo.
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
  jsonSchema,
  stepCountIs,
  streamText,
  tool,
  type JSONSchema7,
  type LanguageModel,
  type ModelMessage,
  type ToolSet,
} from "ai";

import { admin, type Caller } from "@/backend/http.server";
import { estimateCost } from "@/backend/llm-core";
import { GATEWAY_URL, gatewayHeaders, isGatewayClaude } from "@/backend/ai/models";
import { chooseProvider } from "@/backend/llm.server";
import { maskText } from "@/lib/mask-sensitive";

import { redact } from "./redact";
import { roteiroState, roteiroText } from "./roteiro";
import { REPLY, SETUP_TOOLS, setupSystem } from "./spec";
import { STAGE_TOOLS, blockNote, toBlock, type StoredPart } from "./stage";
import {
  loadFacts,
  loadSnapshot,
  runSetupTool,
  type SetupAction,
  type SetupCtx,
} from "./tools.server";

const MAX_STEPS = 6;
const HISTORY = 24;
const MAX_OUTPUT = 6000;
const TURN_TIMEOUT_MS = 75_000;
const SECRET_TOOLS = new Set(["conectar_integracao", "conectar_zernio"]);

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
  const savedUser = isRepeat
    ? Promise.resolve()
    : Promise.resolve(
        db.from("setup_messages").insert({
          account_id: caller.accountId,
          user_id: caller.userId,
          role: "user",
          content: redact(said).text,
        }),
      ).then(() => undefined);

  const ctx: SetupCtx = {
    req,
    caller,
    // o histórico gravado não tem as chaves (••••); por isso a mensagem atual entra inteira
    userText: [...past.filter((m) => m.role === "user").map((m) => String(m.content)), said].join(
      "\n",
    ),
  };
  const parts: StoredPart[] = [];
  const seen = new Map<string, unknown>(); // ferramenta+argumentos → resultado (não repete)

  const work: ToolSet = Object.fromEntries(
    // aqui a fala é o texto do stream: a ferramenta responder (do motor antigo) não entra
    SETUP_TOOLS.filter((spec) => spec.name !== REPLY.name).map((spec) => [
      spec.name,
      tool({
        description: spec.description,
        inputSchema: jsonSchema<Record<string, unknown>>(spec.parameters as JSONSchema7),
        execute: async (args: Record<string, unknown>) => {
          const sig = `${spec.name}:${JSON.stringify(args)}`;
          if (seen.has(sig)) return { ok: true, nota: "Já feito nesta rodada. Não repita." };
          const started = Date.now();
          let out: { ok: boolean; resultado?: string; erro?: string; acao?: SetupAction };
          try {
            const r = await runSetupTool(ctx, spec.name, args);
            out = { ok: true, resultado: redact(r.content.slice(0, 16_000)).text };
            if (r.action) {
              out.acao = r.action;
              parts.push({ type: "action", action: r.action });
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            const action: SetupAction = {
              kind: "error",
              label: msg.slice(0, 160),
              tool: spec.name,
            };
            out = { ok: false, erro: redact(msg).text, acao: action };
            parts.push({ type: "action", action });
          }
          seen.set(sig, out);
          await db.from("agent_tool_calls").insert({
            account_id: caller.accountId,
            kind: "setup",
            tool: spec.name,
            // de ferramenta com segredo, só os nomes dos campos (nunca os valores)
            args: (SECRET_TOOLS.has(spec.name)
              ? { redigido: true, campos: argNames(args) }
              : args) as never,
            ok: out.ok,
            error: out.ok ? null : (out.erro ?? "").slice(0, 500),
            latency_ms: Date.now() - started,
          });
          return out;
        },
      }),
    ]),
  );
  const stage: ToolSet = Object.fromEntries(
    STAGE_TOOLS.map((spec) => [
      spec.name,
      tool({
        description: spec.description,
        inputSchema: jsonSchema<Record<string, unknown>>(spec.parameters as JSONSchema7),
        execute: async (args: Record<string, unknown>) => {
          try {
            const block = toBlock(spec.name, args);
            parts.push({ type: "block", block });
            return { ok: true, bloco: block, nota: "Na tela. Agora fale com a pessoa e espere." };
          } catch (err) {
            return { ok: false, erro: err instanceof Error ? err.message : String(err) };
          }
        },
      }),
    ]),
  );

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

  const result = streamText({
    model: modelOf(choice),
    system: maskText(system),
    // a IA vê o valor real só nesta rodada (para guardar no cofre); o histórico fica com ••••
    messages: [...past, { role: "user", content: maskText(said) }],
    tools: { ...work, ...stage },
    stopWhen: stepCountIs(MAX_STEPS),
    // o Gemini 2.5 pensa antes de falar e o pensamento conta no teto: com 1500 ele já
    // devolveu rodada vazia (1470 tokens pensados, nenhuma palavra). Por isso o teto é alto.
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
    // segredo nunca volta para a tela: o texto de cada parte passa pela mesma máscara
    onError: (err) => {
      console.error("[nexa] stream", err);
      return "Não consegui responder agora. Tente de novo em instantes.";
    },
    onEnd: async ({ responseMessage }) => {
      await savedUser;
      const spoken = responseMessage.parts
        .filter((p) => p.type === "text")
        .map((p) => (p as { text: string }).text)
        .join("\n")
        .trim();
      const final = redact(spoken || fallback(parts)).text;
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
          error: spoken || parts.length ? null : "resposta vazia",
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
export function fallback(parts: StoredPart[]): string {
  const acts = parts.filter((p) => p.type === "action").map((p) => p.action!);
  const done = acts.filter((a) => a.kind !== "error").map((a) => a.label);
  const failed = acts.filter((a) => a.kind === "error").map((a) => a.label);
  if (!done.length && !failed.length && parts.some((p) => p.type === "block"))
    return "Escolha uma das opções abaixo ou me escreva do seu jeito.";
  // nada feito e nada dito: não finge que respondeu
  if (!done.length && !failed.length)
    return "Desculpa, me perdi aqui. Pode me dizer de novo, com outras palavras?";
  return [
    done.length ? `Feito: ${done.join("; ")}.` : "",
    failed.length ? `Não consegui: ${failed.join("; ")}.` : "",
    "O que mais você quer configurar?",
  ]
    .filter(Boolean)
    .join(" ");
}
