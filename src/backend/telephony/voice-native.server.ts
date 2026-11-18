// Voz com o modelo DENTRO da ElevenLabs (como a Lia da Likes, p50 1,66 s). O Custom LLM fazia
// cada vez da ligação atravessar até o servidor do Lovable, que às vezes está frio: a ElevenLabs
// media ~3,3 s até a 1ª palavra e soltava frase de espera em toda vez. Aqui a Central de CS só:
//  - monta o prompt (roteiro, persona, base e catálogo), com {{motivo}}, {{assistente}} e
//    {{ficha}} que a ligação preenche;
//  - responde às ferramentas por webhook (consultar_base e handoff_to_human).
// A persona é a mesma do texto: o prompt sai do mesmo prepareAgent.
import { admin, HttpError, isUuid, safeEqual } from "@/backend/http.server";

import { pickActiveAgent } from "../agents/orchestrator-logic";

const KB_LIMIT = 40;
const KB_BODY_CHARS = 1200;

async function authorize(req: Request, accountId: string | null): Promise<string> {
  if (!isUuid(accountId)) throw new HttpError(400, "conta inválida", "bad_account");
  const { data } = await admin().rpc("secret_get", {
    _scope: "integration",
    _scope_id: accountId,
    _key: "voice_llm_token",
  });
  const expected = typeof data === "string" ? data : "";
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!expected || !got || !safeEqual(got, expected))
    throw new HttpError(401, "token inválido", "unauthorized");
  return accountId;
}

function accountOf(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  const at = parts.indexOf("voz");
  return at >= 0 ? (parts[at + 1] ?? null) : null;
}

/** Ficha curta do contato pelo telefone (vai na variável {{ficha}} da ligação). */
async function fichaByPhone(accountId: string, phone: string): Promise<string> {
  const { data } = await admin()
    .from("contacts")
    .select("name, company, city, lifecycle, tags, notes")
    .eq("account_id", accountId)
    .eq("phone", phone)
    .limit(1)
    .maybeSingle();
  if (!data) return "(sem ficha no CRM)";
  return [
    data.name ? `Nome: ${data.name}` : "",
    data.company ? `Empresa: ${data.company}` : "",
    data.city ? `Cidade: ${data.city}` : "",
    data.lifecycle ? `Etapa: ${data.lifecycle}` : "",
    data.tags?.length ? `Tags: ${data.tags.join(", ")}` : "",
    data.notes ? `Notas: ${String(data.notes).slice(0, 600)}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Prompt de voz da conta, montado pelo mesmo prepareAgent do texto (persona igual nos canais),
 * com a base inteira e o catálogo. Os campos entre {{ }} são preenchidos pela ligação.
 */
export async function buildVoicePrompt(
  accountId: string,
  opts: {
    teamAgentId?: string | null;
    direction: "inbound" | "outbound" | "any";
    vars?: { contact: string; reason: string; assistant: string };
  },
): Promise<{ prompt: string; agent: { id: string; name: string; role: string } }> {
  const vars = opts.vars ?? {
    contact: "{{crm_context}}",
    reason: "{{motivo}}",
    assistant: "{{agent_name}}",
  };
  const db = admin();
  const [{ prepareAgent, loadTeam, lite }, { data: account }, { data: kb }, { data: products }] =
    await Promise.all([
      import("../agents/orchestrator.server"),
      db.from("accounts").select("name, timezone").eq("id", accountId).single(),
      db
        .from("kb_articles")
        .select("title, body_md")
        .eq("account_id", accountId)
        .eq("status", "published")
        .order("updated_at", { ascending: false })
        .limit(KB_LIMIT),
      db
        .from("products")
        .select("name, price, billing, description")
        .eq("account_id", accountId)
        .eq("active", true)
        .order("position")
        .limit(60),
    ]);
  const { agents, tools } = await loadTeam(accountId);
  const usable = agents.filter((a) => a.role !== "supervisor");
  const agent =
    (opts.teamAgentId ? usable.find((a) => a.id === opts.teamAgentId) : undefined) ??
    (opts.direction === "outbound"
      ? usable.find((a) => a.role === "sdr" && a.status === "active")
      : undefined) ??
    // um agente por canal: o marcado para "Ligação" (porta de entrada dela) atende primeiro
    usable.find((a) => a.id === pickActiveAgent(usable.map(lite), "voice", null)?.id) ??
    usable[0];
  if (!agent) throw new HttpError(409, "nenhum agente para atender", "no_agent");
  const prep = await prepareAgent(
    {
      accountId,
      company: account?.name ?? "",
      agent,
      tools,
      roster: [],
      history: [],
      contactText: vars.contact,
      contactId: null,
      conversationId: null,
      platform: "voice",
      greeted: true,
      collected: {},
      surveyPending: false,
      handoffSummary: null,
      dryRun: true,
      failTool: null,
      runId: null,
      evalRunId: null,
      tz: account?.timezone ?? "America/Sao_Paulo",
      call: {
        direction: opts.direction,
        reason: opts.direction === "inbound" ? null : vars.reason,
        assistant: opts.direction === "inbound" ? null : vars.assistant,
      },
    },
    agent,
    {
      ctxData: {
        kb: (kb ?? []).map((k) => ({
          title: k.title,
          body: (k.body_md ?? "").slice(0, KB_BODY_CHARS),
        })),
        products: (products ?? []).map((p) => ({ ...p, price: Number(p.price) })),
      },
    },
    "voz",
  );
  return { prompt: prep.system, agent: { id: agent.id, name: agent.name, role: agent.role } };
}

/**
 * GET /api/voz/<conta>/prompt?saida=1[&telefone=+55…] → { prompt, ficha, agente }.
 * Prompt avulso (agente de teste fora do produto); o produto usa buildVoicePrompt no syncAgent.
 */
export async function voicePrompt(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const accountId = await authorize(req, accountOf(url.pathname));
  const outbound = url.searchParams.get("saida") === "1";
  const phone = (url.searchParams.get("telefone") ?? "").replace(/[^\d+]/g, "");
  const { prompt, agent } = await buildVoicePrompt(accountId, {
    direction: outbound ? "outbound" : "inbound",
    vars: { contact: "{{ficha}}", reason: "{{motivo}}", assistant: "{{assistente}}" },
  });
  return Response.json({
    prompt,
    ficha: phone ? await fichaByPhone(accountId, phone) : null,
    agente: { id: agent.id, nome: agent.name, papel: agent.role },
  });
}

/**
 * POST /api/voz/<conta>[/ensaio]/ferramenta/<nome> — webhook das ferramentas do agente.
 * consultar_base { pergunta } · handoff_to_human { reason, summary }.
 */
export async function voiceTool(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const accountId = await authorize(req, accountOf(url.pathname));
  const parts = url.pathname.split("/").filter(Boolean);
  const name = parts[parts.indexOf("ferramenta") + 1] ?? "";
  const rehearsal = parts.includes("ensaio");
  const args = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const started = Date.now();
  const text = (k: string, max = 600) =>
    String(args[k] ?? "")
      .trim()
      .slice(0, max);

  let result: string;
  if (name === "consultar_base") {
    const question = text("pergunta", 500);
    if (!question) throw new HttpError(400, "falta a pergunta", "empty");
    const { kbQuery } = await import("../agents/kb-query");
    const { searchKb } = await import("../support/kb-search.server");
    const rows = await searchKb(accountId, question, {
      query: kbQuery(question) || question,
      limit: 3,
    });
    result = rows.length
      ? rows.map((r) => `${r.title}: ${r.body_md.slice(0, 900)}`).join("\n\n")
      : "A base não tem nada sobre isso. Diga uma vez que não tem a informação e ofereça que a equipe retorne confirmando.";
  } else if (name === "handoff_to_human") {
    const reason = text("reason", 200) || "pediu para falar com uma pessoa";
    const summary = text("summary");
    if (!rehearsal) {
      const { notifyManagers } = await import("../agents/tools.server");
      await notifyManagers(
        accountId,
        "Ligação pede retorno de uma pessoa",
        `${reason}. ${summary}`,
        null,
      );
    }
    result = rehearsal
      ? "registrado (ensaio: ninguém foi avisado de verdade). Diga que a equipe retorna pelo WhatsApp ou ligação neste número."
      : "registrado: a equipe foi avisada. Diga que uma pessoa retorna pelo WhatsApp ou por ligação neste número, em horário comercial.";
  } else {
    throw new HttpError(404, "ferramenta desconhecida", "unknown_tool");
  }

  await admin()
    .from("agent_tool_calls")
    .insert({
      account_id: accountId,
      kind: "internal",
      tool: `voz_${name}`.slice(0, 120),
      args: args as never,
      result: { texto: result.slice(0, 400) } as never,
      ok: true,
      dry_run: rehearsal,
      latency_ms: Date.now() - started,
    })
    .then(
      () => undefined,
      () => undefined,
    );
  return Response.json({ resultado: result });
}
