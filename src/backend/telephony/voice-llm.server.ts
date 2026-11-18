// Cérebro da voz: a ElevenLabs cuida do telefone, da escuta e da fala (v4 Turbo), e a cada vez
// da pessoa chama ESTA rota como se fosse um LLM no formato Chat Completions da OpenAI (SSE).
// Aqui roda a mesma equipe do Agents SDK do texto: passagem de caso, trava e aprovação.
// Sem VPS: tudo dentro do app (Workers do Lovable).
// Autenticação: token por conta no cofre (voice_llm_token), enviado pela ElevenLabs como Bearer.
import { admin, HttpError, isUuid, safeEqual } from "@/backend/http.server";

import type { AgentRow, ToolRow } from "../agents/orchestrator.server";
import type { Turn } from "../agents/tool-loop";
import { readCallExtra, type VoiceCall } from "../agents/voice-playbook";

// Frase de espera só quando uma ferramenta começa e o agente ainda não disse nada (a espera
// automática da ElevenLabs saía em toda vez e quebrava a conversa, 28/10). As de passagem
// são instantâneas e não ganham frase.
const TOOL_HOLD = "Deixa eu ver aqui... ";
const INSTANT_TOOLS =
  /^(handoff_to_human|transfer_to_|identify_contact|save_fields|record_survey|encerrar_ligacao)/;
// Sem texto aos 4 s a ElevenLabs desiste e REFAZ a vez (ferramentas em dobro), e aos 1,5 s
// solta a frase de espera dela. Um espaço logo na abertura conta como texto e não é falado:
// segura as duas coisas. A espera falada fica só para ferramenta lenta (TOOL_HOLD).
const KEEPALIVE = " ";
/** Frases de espera (dela ou nossas) que entram no histórico: o modelo copiava ("Hum... Hum..."). */
const FILLER_PREFIX =
  /^(\s*(hu+m+|hm+|só um segundinho|deixa eu (ver|conferir) aqui|um instante)[.…!,\s]*)+/i;
// equipe e ferramentas mudam pouco: 60 s no isolate poupam ~0,5 s em cada vez da ligação
const TEAM_TTL_MS = 60_000;
const teamCache = new Map<
  string,
  { at: number; team: Promise<{ agents: AgentRow[]; tools: ToolRow[] }> }
>();
/** Na ligação não existe transferência ao vivo: a promessa é de retorno, e verdadeira. */
const VOICE_HANDOFF =
  "Já deixei registrado para a equipe: uma pessoa vai te retornar pelo WhatsApp ou por ligação neste número, em horário comercial.";

interface ChatMessage {
  role: string;
  content: unknown;
}

/** O que a ElevenLabs manda vira o histórico do Nexus (o prompt de sistema dela é ignorado). */
export function voiceHistory(messages: ChatMessage[]): Turn[] {
  const text = (c: unknown): string =>
    typeof c === "string"
      ? c
      : Array.isArray(c)
        ? c.map((p) => (p as { text?: string }).text ?? "").join(" ")
        : "";
  return messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => {
      const t = text(m.content).trim();
      return {
        role: m.role as "user" | "assistant",
        content: m.role === "assistant" ? t.replace(FILLER_PREFIX, "").trim() : t,
      };
    })
    .filter((m) => m.content)
    .slice(-20);
}

/** O pedido de desligar no formato de chamada de ferramenta (a ElevenLabs executa o end_call). */
export function endCallChunk(id: string): string {
  return `data: ${JSON.stringify({
    id,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: "nexus-agents-sdk",
    choices: [
      {
        index: 0,
        delta: {
          role: "assistant",
          tool_calls: [
            {
              index: 0,
              id: `call_${id.slice(-12)}`,
              type: "function",
              function: {
                name: "end_call",
                arguments: JSON.stringify({ reason: "conversa encerrada" }),
              },
            },
          ],
        },
        finish_reason: null,
      },
    ],
  })}\n\n`;
}

/** Um pedaço no formato chat.completion.chunk (o que a ElevenLabs lê). */
export function chunk(id: string, content: string | null, finish: string | null = null): string {
  const delta = content === null ? {} : { role: "assistant", content };
  return `data: ${JSON.stringify({
    id,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: "nexus-agents-sdk",
    choices: [{ index: 0, delta, finish_reason: finish }],
  })}\n\n`;
}

// o cofre custava até 1 s antes do 1º byte em TODA vez da ligação: guarda por 5 min no isolate
const TOKEN_TTL_MS = 5 * 60_000;
const tokenCache = new Map<string, { value: string; until: number }>();

async function tokenOf(accountId: string): Promise<string | null> {
  const hit = tokenCache.get(accountId);
  if (hit && hit.until > Date.now()) return hit.value;
  const value = await tokenFromVault(accountId);
  if (value) tokenCache.set(accountId, { value, until: Date.now() + TOKEN_TTL_MS });
  return value;
}

async function tokenFromVault(accountId: string): Promise<string | null> {
  const { data } = await admin().rpc("secret_get", {
    _scope: "integration",
    _scope_id: accountId,
    _key: "voice_llm_token",
  });
  return typeof data === "string" && data ? data : null;
}

/**
 * A ElevenLabs trata o endereço configurado como BASE e acrescenta /chat/completions (a 1ª
 * ligação de 28/10 falhou porque a conta ia em ?a=…: virava "?a=…/chat/completions").
 * Por isso a conta e o ensaio vão no caminho: /api/voz/<conta>[/ensaio]/chat/completions.
 */
export function voiceTarget(pathname: string): {
  accountId: string | null;
  rehearsal: boolean;
  outbound: boolean;
} {
  const parts = pathname.split("/").filter(Boolean);
  const at = parts.indexOf("voz");
  const rest = at >= 0 ? parts.slice(at + 1) : [];
  const flags = rest.slice(1, rest.indexOf("chat") >= 0 ? rest.indexOf("chat") : undefined);
  return {
    accountId: rest[0] ?? null,
    rehearsal: flags.includes("ensaio"),
    outbound: flags.includes("saida"),
  };
}

/** Ficha curta de quem está sendo chamado (pelo id ou pelo telefone que o disparo mandou). */
async function calledContact(
  accountId: string,
  contactId: string | undefined,
  phone: string | undefined,
): Promise<{ id: string; text: string } | null> {
  if (!contactId && !phone) return null;
  let q = admin()
    .from("contacts")
    .select("id, name, city, notes, tags, lifecycle, company")
    .eq("account_id", accountId)
    .limit(1);
  q = contactId && isUuid(contactId) ? q.eq("id", contactId) : q.eq("phone", phone ?? "");
  const { data } = await q.maybeSingle();
  if (!data) return null;
  const c = data as Record<string, unknown>;
  const text = [
    c["name"] ? `Nome: ${c["name"]}` : "",
    c["company"] ? `Empresa: ${c["company"]}` : "",
    c["city"] ? `Cidade: ${c["city"]}` : "",
    c["lifecycle"] ? `Etapa: ${c["lifecycle"]}` : "",
    Array.isArray(c["tags"]) && c["tags"].length
      ? `Tags: ${(c["tags"] as string[]).join(", ")}`
      : "",
    c["notes"] ? `Notas: ${String(c["notes"]).slice(0, 600)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  return { id: String(c["id"]), text };
}

function cachedTeam(accountId: string) {
  const hit = teamCache.get(accountId);
  if (hit && Date.now() - hit.at < TEAM_TTL_MS) return hit.team;
  const team = import("../agents/orchestrator.server").then((m) => m.loadTeam(accountId));
  teamCache.set(accountId, { at: Date.now(), team });
  team.catch(() => teamCache.delete(accountId));
  return team;
}

/**
 * Aquecimento: quem disca chama GET /api/voz/<conta>/aquecer antes. O 1º pedido num servidor
 * frio carregava o SDK por mais de 4 s, a ElevenLabs desistia duas vezes e a linha travava.
 */
export async function voiceWarm(req: Request): Promise<Response> {
  const started = Date.now();
  const { accountId } = voiceTarget(new URL(req.url).pathname);
  if (!isUuid(accountId)) throw new HttpError(400, "conta inválida", "bad_account");
  const expected = await tokenOf(accountId);
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!expected || !got || !safeEqual(got, expected))
    throw new HttpError(401, "token inválido", "unauthorized");
  const [{ warmEngine }] = await Promise.all([
    import("../agents/sdk/engine.server"),
    import("../agents/orchestrator-logic"),
    cachedTeam(accountId),
  ]);
  await warmEngine(accountId);
  return Response.json({ ok: true, ms: Date.now() - started });
}

export async function voiceLlm(req: Request): Promise<Response> {
  // o relógio da ElevenLabs começa quando o pedido chega: o registro mede daqui até o stream
  const arrived = Date.now();
  const url = new URL(req.url);
  const fromPath = voiceTarget(url.pathname);
  // rota antiga (?a=…) continua valendo para chamada direta
  const accountId = isUuid(fromPath.accountId) ? fromPath.accountId : url.searchParams.get("a");
  // ensaio: ações simuladas e equipe inteira (rascunho e pausado entram), como no simulador
  const rehearsal = fromPath.rehearsal || url.searchParams.get("ensaio") === "1";
  if (!isUuid(accountId)) throw new HttpError(400, "conta inválida", "bad_account");
  const expected = await tokenOf(accountId);
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!expected || !got || !safeEqual(got, expected))
    throw new HttpError(401, "token inválido", "unauthorized");

  const body = (await req.json().catch(() => ({}))) as {
    messages?: ChatMessage[];
    tools?: { function?: { name?: string } }[];
  };
  // a ElevenLabs só manda end_call quando a ferramenta de sistema está ligada no agente
  const canEndCall = (Array.isArray(body.tools) ? body.tools : []).some(
    (t) => t?.function?.name === "end_call",
  );
  const extra = readCallExtra(body);
  const call: VoiceCall = {
    direction: fromPath.outbound || extra.direction === "outbound" ? "outbound" : "inbound",
    reason: extra.motivo ?? null,
    assistant: extra.assistente ?? null,
  };
  const history = voiceHistory(Array.isArray(body.messages) ? body.messages : []);
  if (!history.length || history.at(-1)!.role !== "user")
    throw new HttpError(400, "falta a fala da pessoa", "empty");

  const id = `chatcmpl-${crypto.randomUUID()}`;
  const enc = new TextEncoder();
  const started = Date.now();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let spoken = "";
      let firstAt = 0;
      let hangUp = false;
      const marks: string[] = [];
      const mark = (name: string) => marks.push(`${name}=${Date.now() - started}`);
      const say = (t: string) => {
        if (!t) return;
        if (!firstAt) firstAt = Date.now() - started;
        spoken += t;
        controller.enqueue(enc.encode(chunk(id, t)));
      };
      controller.enqueue(enc.encode(chunk(id, KEEPALIVE)));
      const question = history
        .filter((h) => h.role === "user")
        .slice(-3)
        .map((h) => (h as { content: string }).content)
        .join("\n");
      // a busca na base (vetor) é a parte mais lenta do preparo: começa junto com o resto
      const ctx = import("../agents/orchestrator.server").then((m) =>
        m.preloadContext(accountId, question),
      );
      ctx.catch(() => {});
      try {
        // o stream já está aberto: o preparo corre em paralelo enquanto a espera pode sair
        const [{ lite }, { pickActiveAgent }, { streamSdkTurn }, acc, loaded, contact] =
          await Promise.all([
            import("../agents/orchestrator.server"),
            import("../agents/orchestrator-logic"),
            import("../agents/sdk/engine.server"),
            admin().from("accounts").select("name, timezone").eq("id", accountId).single(),
            cachedTeam(accountId),
            calledContact(accountId, extra.contact_id, extra.telefone),
          ]);
        const account = acc.data;
        const agents = rehearsal
          ? loaded.agents.map((x) => (x.role !== "supervisor" ? { ...x, status: "active" } : x))
          : loaded.agents;
        const all = agents.map(lite);
        // ligação de saída é prospecção/relacionamento: o SDR liga, se houver um ativo
        const sdr =
          call.direction === "outbound"
            ? agents.find((x) => x.role === "sdr" && x.status === "active")
            : undefined;
        const first =
          sdr ?? agents.find((x) => x.id === pickActiveAgent(all, "voice", null)?.id) ?? agents[0];
        if (!first) throw new Error("nenhum agente para atender");
        mark("preparo");
        const outcome = await streamSdkTurn(
          {
            accountId,
            company: account?.name ?? "",
            agent: first,
            tools: loaded.tools,
            roster: all,
            history,
            contactText: contact?.text || "(ligação telefônica, sem ficha)",
            contactId: contact?.id ?? null,
            conversationId: null,
            platform: "voice",
            greeted: history.some((h) => h.role === "assistant"),
            collected: {},
            surveyPending: false,
            handoffSummary: null,
            dryRun: rehearsal,
            failTool: null,
            runId: null,
            evalRunId: null,
            tz: account?.timezone ?? "America/Sao_Paulo",
            call,
          },
          agents,
          say,
          mark,
          {
            ctx,
            onTool: (name) => {
              if (!spoken.trim() && !INSTANT_TOOLS.test(name)) say(TOOL_HOLD);
            },
            onEndCall: () => {
              hangUp = true;
            },
          },
        );
        // passou para a equipe, parou na aprovação ou a trava barrou: a voz diz o desfecho
        // só completa quando o agente não falou nada (antes repetia a frase de passagem)
        const answered = spoken.replace(TOOL_HOLD, "").trim();
        if (outcome.action === "handoff" && !/retorn/i.test(answered))
          say(`${answered ? " " : ""}${VOICE_HANDOFF}`);
        else if (!answered && outcome.reply.trim()) say(outcome.reply.trim());
        console.info(
          `[voz] primeira palavra ${firstAt} ms · total ${Date.now() - started} ms · ${outcome.action}${outcome.approvalId ? " (aprovação)" : ""}`,
        );
      } catch (err) {
        console.error("[voz] rodada", err);
        say("Desculpa, tive um problema aqui. Vou pedir para alguém da equipe te retornar.");
      } finally {
        const total = Date.now() - started;
        // cada vez da ligação fica no banco: a 6ª ligação (28/10) travou e o log só tinha a
        // chamada ao modelo, sem dizer se a ElevenLabs tinha desistido antes
        await admin()
          .from("agent_tool_calls")
          .insert({
            account_id: accountId,
            kind: "internal",
            tool: "voz_rodada",
            args: {
              direcao: call.direction,
              chegada_ate_stream: started - arrived,
              primeira: firstAt,
              total,
              marcos: marks,
              cancelada_pela_elevenlabs: req.signal.aborted,
              desligou: hangUp,
              end_call_disponivel: canEndCall,
              fala: String(
                (history.at(-1) as { content?: unknown } | undefined)?.content ?? "",
              ).slice(0, 200),
            } as never,
            result: { resposta: spoken.slice(0, 400) } as never,
            ok: !req.signal.aborted && Boolean(spoken.trim()),
            dry_run: rehearsal,
            latency_ms: total,
          })
          .then(
            () => undefined,
            () => undefined,
          );
        try {
          // comentário SSE (a ElevenLabs ignora): de onde veio a demora desta vez
          controller.enqueue(
            enc.encode(
              `: tempos ${[...marks, `primeira=${firstAt}`, `total=${total}`].join(" ")}\n\n`,
            ),
          );
          if (hangUp && canEndCall) controller.enqueue(enc.encode(endCallChunk(id)));
          controller.enqueue(
            enc.encode(chunk(id, null, hangUp && canEndCall ? "tool_calls" : "stop")),
          );
          controller.enqueue(enc.encode("data: [DONE]\n\n"));
          controller.close();
        } catch {
          // a ElevenLabs já fechou a conexão (desistiu): o registro acima conta isso
        }
      }
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
