// Ações da tela de Qualidade: formulários, configuração, teste, calibração, contestação e
// cenário de treino a partir do que mais derruba a nota. Só servidor.
import { HttpError, admin, isUuid, type Caller } from "@/backend/http.server";
import {
  QUALITY_TEMPLATES,
  agreement,
  computeScore,
  normalizeCriteria,
  PASS_MARK,
  type EvaluationItem,
  type QualityChannel,
} from "@/features/quality/scoring";
import type { Json } from "@/integrations/supabase/types";

const CHANNELS: QualityChannel[] = ["call", "chat", "email"];

export async function saveForm(caller: Caller, raw: Record<string, unknown>) {
  const name = String(raw["name"] ?? "")
    .trim()
    .slice(0, 120);
  if (!name) throw new HttpError(400, "Dê um nome ao formulário", "name");
  let criteria;
  try {
    criteria = normalizeCriteria(raw["criteria"]);
  } catch (err) {
    throw new HttpError(
      400,
      err instanceof Error ? err.message : "Critérios inválidos",
      "criteria",
    );
  }
  const channels = (Array.isArray(raw["channels"]) ? raw["channels"] : CHANNELS).filter(
    (c): c is QualityChannel => CHANNELS.includes(c as QualityChannel),
  );
  if (channels.length === 0) throw new HttpError(400, "Escolha pelo menos um canal", "channels");
  const values = {
    account_id: caller.accountId,
    name,
    description: String(raw["description"] ?? "").slice(0, 500) || null,
    channels,
    include_ai: raw["include_ai"] !== false,
    is_active: raw["is_active"] !== false,
    criteria: criteria as unknown as Json,
  };
  const db = admin();
  const id = raw["id"];
  if (isUuid(id)) {
    const { data, error } = await db
      .from("quality_forms")
      .update(values)
      .eq("id", id)
      .eq("account_id", caller.accountId)
      .select("id")
      .maybeSingle();
    if (error) throw new HttpError(500, "Não deu para salvar o formulário", "save");
    if (!data) throw new HttpError(404, "Formulário não encontrado", "not_found");
    return { id: data.id };
  }
  const { data, error } = await db
    .from("quality_forms")
    .insert({ ...values, created_by: caller.userId })
    .select("id")
    .single();
  if (error) throw new HttpError(500, "Não deu para criar o formulário", "save");
  return { id: data.id };
}

export async function formFromTemplate(caller: Caller, key: unknown) {
  const t = QUALITY_TEMPLATES.find((x) => x.key === key) ?? QUALITY_TEMPLATES[0]!;
  return saveForm(caller, {
    name: t.name,
    description: t.description,
    channels: t.channels,
    include_ai: true,
    is_active: true,
    criteria: t.criteria,
  });
}

export async function saveSettings(caller: Caller, raw: Record<string, unknown>) {
  const num = (k: string, min: number, max: number, def: number) => {
    const v = Number(raw[k]);
    return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def;
  };
  const model = (k: string, def: string) => {
    const v = String(raw[k] ?? "").trim();
    return /^[a-zA-Z0-9._:/-]{1,80}$/.test(v) ? v : def;
  };
  const { error } = await admin()
    .from("quality_settings")
    .upsert({
      account_id: caller.accountId,
      enabled: raw["enabled"] !== false,
      monthly_budget_usd: num("monthly_budget_usd", 0, 100000, 20),
      daily_max: Math.round(num("daily_max", 0, 100000, 500)),
      idle_hours: Math.round(num("idle_hours", 1, 168, 12)),
      min_messages: Math.round(num("min_messages", 1, 50, 2)),
      include_ai: raw["include_ai"] !== false,
      model_anthropic: model("model_anthropic", "claude-haiku-5-5"),
      model_openai: model("model_openai", "gpt-5.4-mini"),
      updated_by: caller.userId,
      updated_at: new Date().toISOString(),
    });
  if (error) throw new HttpError(500, "Não deu para salvar a configuração", "save");
  return { ok: true };
}

/** Testar: avalia agora a interação terminada mais recente da conta. */
export async function testNow(caller: Caller) {
  const db = admin();
  const { data: forms } = await db
    .from("quality_forms")
    .select("id")
    .eq("account_id", caller.accountId)
    .eq("is_active", true)
    .limit(1);
  if (!forms?.length)
    throw new HttpError(409, "Ative um formulário de qualidade antes de testar", "no_form");
  const { data: call } = await db
    .from("calls")
    .select("id, started_at, ended_at, updated_at, created_at")
    .eq("account_id", caller.accountId)
    .eq("status", "completed")
    .not("transcript", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: convs } = await db
    .from("conversations")
    .select("id, last_message_at")
    .eq("account_id", caller.accountId)
    .eq("is_group", false)
    .not("last_message_at", "is", null)
    .order("last_message_at", { ascending: false })
    .limit(10);
  let conv: { id: string; last_message_at: string } | null = null;
  for (const c of convs ?? []) {
    const { count } = await db
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", c.id)
      .eq("direction", "out")
      .eq("is_private", false);
    if ((count ?? 0) > 0 && c.last_message_at) {
      conv = { id: c.id, last_message_at: c.last_message_at };
      break;
    }
  }
  const { evaluateInteraction } = await import("./evaluate.server");
  const useCall =
    call &&
    (!conv || new Date(call.created_at).getTime() > new Date(conv.last_message_at).getTime());
  if (useCall && call)
    return evaluateInteraction(
      {
        account_id: caller.accountId,
        source: "call",
        source_id: call.id,
        interaction_start: call.started_at,
        interaction_end: call.ended_at ?? call.updated_at,
      },
      { ignoreBudget: true },
    );
  if (conv)
    return evaluateInteraction(
      {
        account_id: caller.accountId,
        source: "conversation",
        source_id: conv.id,
        interaction_start: null,
        interaction_end: conv.last_message_at,
      },
      { ignoreBudget: true },
    );
  return {
    status: "skipped" as const,
    evaluationId: null,
    reason: "Ainda não há conversa nem ligação atendida para avaliar. Atenda uma e teste de novo.",
  };
}

export async function calibrationSample(caller: Caller, size: unknown) {
  const n = Math.min(20, Math.max(1, Number(size) || 5));
  const db = admin();
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data: done } = await db
    .from("quality_calibrations")
    .select("evaluation_id")
    .eq("account_id", caller.accountId)
    .eq("reviewer_user_id", caller.userId)
    .gte("created_at", since);
  const skip = new Set((done ?? []).map((d) => d.evaluation_id));
  const { data } = await db
    .from("quality_evaluations")
    .select("id")
    .eq("account_id", caller.accountId)
    .eq("status", "done")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(300);
  const pool = (data ?? []).map((r) => r.id).filter((id) => !skip.has(id));
  // Amostra aleatória: Fisher-Yates numa cópia.
  const copy = [...pool];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return { ids: copy.slice(0, n) };
}

type ManagerItem = Pick<EvaluationItem, "criterion_id" | "score" | "passed"> & { comment?: string };

function parseManagerItems(raw: unknown, ai: EvaluationItem[]): EvaluationItem[] {
  const list = (Array.isArray(raw) ? raw : []) as Partial<ManagerItem>[];
  const byId = new Map(list.map((i) => [String(i.criterion_id ?? ""), i]));
  return ai.map((a) => {
    const m = byId.get(a.criterion_id);
    const score = Math.min(100, Math.max(0, Math.round(Number(m?.score ?? a.score))));
    const passed =
      typeof m?.passed === "boolean" ? m.passed : a.eliminatory ? a.passed : score >= PASS_MARK;
    return {
      ...a,
      score: a.eliminatory ? (passed ? 100 : 0) : score,
      passed,
      comment: String(m?.comment ?? "").slice(0, 400) || a.comment,
    };
  });
}

async function loadEvaluation(accountId: string, id: unknown) {
  if (!isUuid(id)) throw new HttpError(400, "Avaliação inválida", "bad_id");
  const { data } = await admin()
    .from("quality_evaluations")
    .select("id, account_id, agent_user_id, items, score, status")
    .eq("id", id)
    .eq("account_id", accountId)
    .maybeSingle();
  if (!data) throw new HttpError(404, "Avaliação não encontrada", "not_found");
  return { ...data, items: (data.items ?? []) as unknown as EvaluationItem[] };
}

export async function saveCalibration(caller: Caller, body: Record<string, unknown>) {
  const e = await loadEvaluation(caller.accountId, body["evaluationId"]);
  if (e.status !== "done")
    throw new HttpError(409, "Só dá para calibrar avaliação concluída", "status");
  const mine = parseManagerItems(body["items"], e.items);
  const total = computeScore(mine);
  const pct = agreement(e.items, mine);
  const { error } = await admin()
    .from("quality_calibrations")
    .upsert(
      {
        account_id: caller.accountId,
        evaluation_id: e.id,
        reviewer_user_id: caller.userId,
        items: mine as unknown as Json,
        score: total.score,
        agreement: pct,
        notes: String(body["notes"] ?? "").slice(0, 1000) || null,
      },
      { onConflict: "evaluation_id,reviewer_user_id" },
    );
  if (error) throw new HttpError(500, "Não deu para salvar a calibração", "save");
  return { agreement: pct, score: total.score };
}

async function notifyManagers(accountId: string, title: string, body: string, link: string) {
  const db = admin();
  const { data } = await db
    .from("memberships")
    .select("user_id")
    .eq("account_id", accountId)
    .eq("is_active", true)
    .in("role", ["owner", "admin", "manager"])
    .limit(20);
  for (const m of data ?? [])
    await db.rpc("notify_user", {
      _account: accountId,
      _user: m.user_id,
      _kind: "quality_dispute",
      _title: title,
      _body: body,
      _link: link,
    });
}

export async function openDispute(caller: Caller, body: Record<string, unknown>) {
  const e = await loadEvaluation(caller.accountId, body["evaluationId"]);
  if (e.agent_user_id !== caller.userId)
    throw new HttpError(403, "Só quem atendeu pode contestar a própria nota", "forbidden");
  const reason = String(body["reason"] ?? "")
    .trim()
    .slice(0, 2000);
  if (reason.length < 3) throw new HttpError(400, "Explique por que a nota está errada", "reason");
  const criterion = String(body["criterionId"] ?? "").slice(0, 60) || null;
  const { data, error } = await admin()
    .from("quality_disputes")
    .insert({
      account_id: caller.accountId,
      evaluation_id: e.id,
      agent_user_id: caller.userId,
      criterion_id: criterion,
      reason,
    })
    .select("id")
    .single();
  if (error?.code === "23505")
    throw new HttpError(409, "Já existe uma contestação aberta para esta nota", "duplicate");
  if (error) throw new HttpError(500, "Não deu para abrir a contestação", "save");
  await notifyManagers(
    caller.accountId,
    "Nova contestação de nota",
    reason.slice(0, 200),
    "/qualidade?aba=contestacoes",
  );
  return { id: data.id };
}

export async function decideDispute(caller: Caller, body: Record<string, unknown>) {
  if (!isUuid(body["disputeId"])) throw new HttpError(400, "Contestação inválida", "bad_id");
  const decision = body["decision"] === "accepted" ? "accepted" : "rejected";
  const note = String(body["note"] ?? "")
    .trim()
    .slice(0, 1000);
  if (!note) throw new HttpError(400, "Escreva a decisão para o atendente", "note");
  const db = admin();
  const { data: d } = await db
    .from("quality_disputes")
    .select("id, evaluation_id, agent_user_id, status")
    .eq("id", body["disputeId"] as string)
    .eq("account_id", caller.accountId)
    .maybeSingle();
  if (!d) throw new HttpError(404, "Contestação não encontrada", "not_found");
  if (d.status !== "open") throw new HttpError(409, "Esta contestação já foi decidida", "decided");
  let newScore: number | null = null;
  if (decision === "accepted") {
    const v = Number(body["newScore"]);
    if (!Number.isFinite(v) || v < 0 || v > 100)
      throw new HttpError(400, "Informe a nota corrigida (0 a 100)", "score");
    newScore = Math.round(v * 10) / 10;
    await db
      .from("quality_evaluations")
      .update(
        newScore > 0
          ? { score: newScore, revised: true, eliminated: false }
          : { score: newScore, revised: true },
      )
      .eq("id", d.evaluation_id)
      .eq("account_id", caller.accountId);
  }
  await db
    .from("quality_disputes")
    .update({
      status: decision,
      decision_note: note,
      new_score: newScore,
      decided_by: caller.userId,
      decided_at: new Date().toISOString(),
    })
    .eq("id", d.id);
  await db.rpc("notify_user", {
    _account: caller.accountId,
    _user: d.agent_user_id,
    _kind: "quality_dispute",
    _title: decision === "accepted" ? "Sua contestação foi aceita" : "Sua contestação foi recusada",
    _body: note.slice(0, 300),
    _link: "/qualidade?aba=notas",
  });
  return { ok: true, status: decision, newScore };
}

const SCENARIO_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    name: { type: "string", description: "Nome e sobrenome brasileiros do cliente simulado" },
    role: { type: "string" },
    company: { type: "string" },
    profile: {
      type: "string",
      description: "Quem é, o que quer e como se comporta (4 a 6 frases)",
    },
    objections: { type: "array", items: { type: "string" }, description: "3 a 5 falas difíceis" },
    difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
  },
  required: ["name", "role", "company", "profile", "objections", "difficulty"],
};

/** O critério que mais derruba a nota vira cenário de roleplay, montado com os trechos reais. */
export async function scenarioFromWeakness(caller: Caller, criterionId: unknown, label: unknown) {
  const id = String(criterionId ?? "").slice(0, 60);
  if (!id) throw new HttpError(400, "Escolha um critério", "criterion");
  const db = admin();
  const { data: ev } = await db.rpc("quality_weak_evidence", {
    _account: caller.accountId,
    _criterion: id,
    _days: 60,
    _limit: 6,
  });
  const evidence = (ev ?? []).map((e) => `- "${e.evidence}"${e.comment ? ` (${e.comment})` : ""}`);
  const name = String(label ?? id).slice(0, 120);
  const { callJson } = await import("@/backend/llm.server");
  const { data } = await callJson<{
    name: string;
    role: string;
    company: string;
    profile: string;
    objections: string[];
    difficulty: string;
  }>(caller.accountId, "quality.scenario", {
    system:
      "Você cria clientes simulados para treino de atendimento e vendas. O cenário precisa colocar o atendente exatamente na situação em que ele costuma errar, para ele praticar.",
    messages: [
      {
        role: "user",
        content: `Critério que mais derruba a nota: "${name}".\nTrechos reais em que o time errou:\n${evidence.join("\n") || "(sem trechos; use o nome do critério)"}\n\nCrie o cliente simulado.`,
      },
    ],
    schemaName: "cenario",
    schema: SCENARIO_SCHEMA,
    maxTokens: 800,
  });
  const difficulty = ["easy", "medium", "hard"].includes(data.difficulty)
    ? data.difficulty
    : "medium";
  const { data: persona, error } = await db
    .from("roleplay_personas")
    .insert({
      account_id: caller.accountId,
      name: String(data.name ?? "Cliente").slice(0, 80) || "Cliente",
      role: String(data.role ?? "").slice(0, 120) || null,
      company: String(data.company ?? "").slice(0, 120) || null,
      profile: `[Treino de qualidade: ${name}]\n${String(data.profile ?? "")}`.slice(0, 4000),
      objections: (Array.isArray(data.objections) ? data.objections : [])
        .map((o) => String(o).slice(0, 300))
        .slice(0, 6),
      difficulty,
      created_by: caller.userId,
    })
    .select("id, name")
    .single();
  if (error) throw new HttpError(500, "Não deu para criar o cenário", "save");
  return persona;
}
