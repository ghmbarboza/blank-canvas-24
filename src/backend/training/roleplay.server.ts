// Treino com roleplay no servidor: a IA interpreta o cliente e, no fim, avalia pela rubrica.
// A sessão só é escrita aqui (service role), depois de conferir que ela é de quem chama.
import { HttpError, admin, type Caller } from "@/backend/http.server";
import { callJson } from "@/backend/llm.server";
import { TEMPLATE_SCORECARD } from "@/features/playbooks/template";
import {
  parsePlaybook,
  type PlaybookContent,
  type ScorecardCriterion,
} from "@/features/playbooks/types";
import {
  EVALUATION_SCHEMA,
  REPLY_SCHEMA,
  SAMPLE_PERSONAS,
  coveredFromMessages,
  evaluationPrompt,
  openingLine,
  personaSystemPrompt,
  sanitizeEvaluation,
  toLlmMessages,
  type Difficulty,
  type PersonaInput,
  type RawEvaluation,
  type RoleplayMessage,
} from "@/features/training/roleplay";

const MAX_TURNS = 40;

function parseCriteria(v: unknown): ScorecardCriterion[] {
  return Array.isArray(v)
    ? (v as ScorecardCriterion[])
        .map((c, i) => ({
          id: String(c?.id ?? `c${i}`),
          label: String(c?.label ?? ""),
          description: c?.description ? String(c.description) : "",
          weight: Number(c?.weight ?? 1) || 1,
        }))
        .filter((c) => c.label)
    : [];
}

async function loadPlaybook(
  accountId: string,
  id: string | null,
): Promise<{ id: string | null; pb: PlaybookContent | null; scorecardId: string | null }> {
  const db = admin();
  let q = db.from("playbooks").select("*").eq("account_id", accountId).eq("is_active", true);
  q = id ? q.eq("id", id) : q.order("is_default", { ascending: false }).limit(1);
  const { data } = await q.maybeSingle();
  if (!data) return { id: null, pb: null, scorecardId: null };
  return {
    id: data.id,
    pb: parsePlaybook(data as unknown as Record<string, unknown>),
    scorecardId: data.scorecard_id,
  };
}

async function loadCriteria(
  accountId: string,
  scorecardId: string | null,
): Promise<{ id: string | null; criteria: ScorecardCriterion[] }> {
  const db = admin();
  let q = db.from("scorecard_templates").select("id, criteria").eq("account_id", accountId);
  q = scorecardId ? q.eq("id", scorecardId) : q.order("is_default", { ascending: false }).limit(1);
  const { data } = await q.maybeSingle();
  const criteria = data ? parseCriteria(data.criteria) : [];
  return criteria.length
    ? { id: data!.id, criteria }
    : { id: null, criteria: TEMPLATE_SCORECARD.criteria };
}

function toPersona(row: {
  name: string;
  role: string | null;
  company: string | null;
  profile: string;
  objections: string[];
  difficulty: string;
}): PersonaInput {
  return {
    name: row.name,
    role: row.role,
    company: row.company,
    profile: row.profile,
    objections: row.objections ?? [],
    difficulty: (["easy", "medium", "hard"].includes(row.difficulty)
      ? row.difficulty
      : "medium") as Difficulty,
  };
}

async function ownSession(caller: Caller, sessionId: unknown) {
  if (typeof sessionId !== "string" || !/^[0-9a-f-]{36}$/i.test(sessionId))
    throw new HttpError(400, "Sessão inválida", "bad_session");
  const { data } = await admin()
    .from("roleplay_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("account_id", caller.accountId)
    .maybeSingle();
  if (!data || data.user_id !== caller.userId)
    throw new HttpError(404, "Sessão não encontrada", "not_found");
  return data;
}

export async function seedPersonas(caller: Caller) {
  const db = admin();
  const { count } = await db
    .from("roleplay_personas")
    .select("id", { count: "exact", head: true })
    .eq("account_id", caller.accountId);
  if ((count ?? 0) > 0) return { created: 0 };
  const { error } = await db.from("roleplay_personas").insert(
    SAMPLE_PERSONAS.map((p) => ({
      ...p,
      account_id: caller.accountId,
      created_by: caller.userId,
    })),
  );
  if (error) throw new HttpError(500, error.message, "seed");
  return { created: SAMPLE_PERSONAS.length };
}

export async function start(caller: Caller, personaId: unknown, playbookId: unknown) {
  if (typeof personaId !== "string") throw new HttpError(400, "Escolha uma persona", "bad_persona");
  const db = admin();
  const { data: persona } = await db
    .from("roleplay_personas")
    .select("*")
    .eq("id", personaId)
    .eq("account_id", caller.accountId)
    .maybeSingle();
  if (!persona) throw new HttpError(404, "Persona não encontrada", "not_found");
  const pb = await loadPlaybook(
    caller.accountId,
    typeof playbookId === "string" && playbookId ? playbookId : persona.playbook_id,
  );
  const sc = await loadCriteria(caller.accountId, pb.scorecardId);
  const first: RoleplayMessage = {
    role: "persona",
    text: openingLine(toPersona(persona)),
    at: new Date().toISOString(),
  };
  const { data, error } = await db
    .from("roleplay_sessions")
    .insert({
      account_id: caller.accountId,
      user_id: caller.userId,
      persona_id: persona.id,
      playbook_id: pb.id,
      scorecard_id: sc.id,
      messages: [first] as never,
    })
    .select("*")
    .single();
  if (error) throw new HttpError(500, error.message, "start");
  return data;
}

export async function reply(caller: Caller, sessionId: unknown, text: unknown) {
  const session = await ownSession(caller, sessionId);
  if (session.status !== "active")
    throw new HttpError(409, "Este treino já foi encerrado", "finished");
  const said = String(text ?? "")
    .trim()
    .slice(0, 1500);
  if (!said) throw new HttpError(400, "Escreva o que você diria ao cliente", "empty");
  const messages = (session.messages as unknown as RoleplayMessage[]) ?? [];
  if (messages.length >= MAX_TURNS * 2)
    throw new HttpError(409, "Treino longo demais: encerre para ver a nota", "too_long");
  const db = admin();
  const { data: persona } = await db
    .from("roleplay_personas")
    .select("*")
    .eq("id", session.persona_id ?? "")
    .maybeSingle();
  if (!persona) throw new HttpError(404, "A persona deste treino foi removida", "no_persona");
  const pb = await loadPlaybook(caller.accountId, session.playbook_id);
  const withSeller = [
    ...messages,
    { role: "seller" as const, text: said, at: new Date().toISOString() },
  ];
  const { data } = await callJson<{ reply: string }>(caller.accountId, "roleplay.reply", {
    system: personaSystemPrompt(toPersona(persona), pb.pb),
    messages: toLlmMessages(withSeller),
    schemaName: "fala_do_cliente",
    schema: REPLY_SCHEMA,
    maxTokens: 400,
  });
  const answer =
    String(data.reply ?? "")
      .trim()
      .slice(0, 1200) || "Hum… pode explicar melhor?";
  const next = [
    ...withSeller,
    { role: "persona" as const, text: answer, at: new Date().toISOString() },
  ];
  const covered = pb.pb ? coveredFromMessages(pb.pb, next).covered : [];
  const { data: updated, error } = await db
    .from("roleplay_sessions")
    .update({ messages: next as never, covered })
    .eq("id", session.id)
    .select("*")
    .single();
  if (error) throw new HttpError(500, error.message, "reply");
  return updated;
}

export async function finish(caller: Caller, sessionId: unknown) {
  const session = await ownSession(caller, sessionId);
  if (session.status === "finished") return session;
  const messages = (session.messages as unknown as RoleplayMessage[]) ?? [];
  if (!messages.some((m) => m.role === "seller"))
    throw new HttpError(400, "Converse com o cliente antes de encerrar", "empty");
  const pb = await loadPlaybook(caller.accountId, session.playbook_id);
  const sc = await loadCriteria(caller.accountId, session.scorecard_id);
  const prompt = evaluationPrompt(sc.criteria, pb.pb, messages);
  const { data } = await callJson<RawEvaluation>(caller.accountId, "roleplay.evaluate", {
    system: prompt.system,
    messages: [{ role: "user", content: prompt.user }],
    schemaName: "avaliacao_do_treino",
    schema: EVALUATION_SCHEMA,
    maxTokens: 1800,
  });
  const ev = sanitizeEvaluation(data, sc.criteria, messages);
  const { data: updated, error } = await admin()
    .from("roleplay_sessions")
    .update({
      status: "finished",
      finished_at: new Date().toISOString(),
      score: ev.score,
      criteria: ev.scores as never,
      strengths: ev.strengths,
      improvements: ev.improvements,
      feedback: ev.feedback || null,
    })
    .eq("id", session.id)
    .select("*")
    .single();
  if (error) throw new HttpError(500, error.message, "finish");
  return updated;
}
