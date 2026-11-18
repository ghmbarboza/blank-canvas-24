// Avaliador de qualidade: lê a interação terminada, escolhe o formulário do canal, respeita o teto
// de custo da conta e grava a nota com o trecho como prova. Só servidor.
import { admin } from "@/backend/http.server";
import {
  computeScore,
  mergeAiItems,
  normalizeCriteria,
  type QualityChannel,
} from "@/features/quality/scoring";
import type { Json } from "@/integrations/supabase/types";

import {
  EVALUATION_SCHEMA,
  callTranscript,
  channelFromPlatform,
  conversationTranscript,
  evaluationPrompt,
  whoHandled,
  type TranscriptMessage,
} from "./transcript";

export interface InteractionRef {
  account_id: string;
  source: "conversation" | "call";
  source_id: string;
  interaction_start: string | null;
  interaction_end: string;
}

interface Loaded {
  channel: QualityChannel;
  transcript: string;
  agentUserId: string | null;
  isAi: boolean;
  contactId: string | null;
}

export interface QualitySettingsRow {
  enabled: boolean;
  monthly_budget_usd: number;
  daily_max: number;
  model_anthropic: string;
  model_openai: string;
  include_ai: boolean;
}

export const DEFAULT_SETTINGS: QualitySettingsRow = {
  enabled: true,
  monthly_budget_usd: 20,
  daily_max: 500,
  model_anthropic: "claude-haiku-5-5",
  model_openai: "gpt-5.4-mini",
  include_ai: true,
};

export async function loadSettings(accountId: string): Promise<QualitySettingsRow> {
  const { data } = await admin()
    .from("quality_settings")
    .select("enabled, monthly_budget_usd, daily_max, model_anthropic, model_openai, include_ai")
    .eq("account_id", accountId)
    .maybeSingle();
  return data ? { ...data, monthly_budget_usd: Number(data.monthly_budget_usd) } : DEFAULT_SETTINGS;
}

async function teamNames(accountId: string): Promise<Map<string, string>> {
  const db = admin();
  const { data: m } = await db
    .from("memberships")
    .select("user_id, display_name")
    .eq("account_id", accountId);
  const ids = (m ?? []).map((r) => r.user_id);
  const { data: p } = ids.length
    ? await db.from("profiles").select("id, full_name").in("id", ids)
    : { data: [] };
  const full = new Map((p ?? []).map((r) => [r.id, r.full_name]));
  return new Map(
    (m ?? []).map((r) => [
      r.user_id,
      (r.display_name || full.get(r.user_id) || "").split(" ")[0] ?? "",
    ]),
  );
}

async function loadInteraction(ref: InteractionRef): Promise<Loaded | null> {
  const db = admin();
  if (ref.source === "call") {
    const { data: k } = await db
      .from("calls")
      .select("id, transcript, user_id, voice_agent_id, contact_id")
      .eq("id", ref.source_id)
      .eq("account_id", ref.account_id)
      .maybeSingle();
    if (!k?.transcript) return null;
    return {
      channel: "call",
      transcript: callTranscript(k.transcript),
      agentUserId: k.user_id,
      isAi: Boolean(k.voice_agent_id) && !k.user_id,
      contactId: k.contact_id,
    };
  }
  const { data: c } = await db
    .from("conversations")
    .select("id, assignee_user_id, contact_id, channels(platform)")
    .eq("id", ref.source_id)
    .eq("account_id", ref.account_id)
    .maybeSingle();
  if (!c) return null;
  let q = db
    .from("messages")
    .select(
      "direction, sender_type, sender_user_id, sender_name, type, body, transcript, is_private, created_at",
    )
    .eq("conversation_id", c.id)
    .lte("created_at", ref.interaction_end)
    .order("created_at", { ascending: true })
    .limit(400);
  if (ref.interaction_start) q = q.gt("created_at", ref.interaction_start);
  const { data: msgs } = await q;
  const list = (msgs ?? []) as TranscriptMessage[];
  if (list.length === 0) return null;
  const who = whoHandled(list, c.assignee_user_id);
  const platform = (c.channels as unknown as { platform: string | null } | null)?.platform;
  return {
    channel: channelFromPlatform(platform),
    transcript: conversationTranscript(list, await teamNames(ref.account_id)),
    agentUserId: who.agentUserId,
    isAi: who.isAi,
    contactId: c.contact_id,
  };
}

type Row = {
  form_id?: string | null;
  form_name?: string | null;
  channel: QualityChannel;
  agent_user_id?: string | null;
  is_ai?: boolean;
  contact_id?: string | null;
  status: "done" | "error" | "skipped";
  score?: number | null;
  ai_score?: number | null;
  eliminated?: boolean;
  items?: Json;
  summary?: string | null;
  model?: string | null;
  cost_usd?: number;
  error?: string | null;
};

async function save(ref: InteractionRef, row: Row): Promise<string | null> {
  const { data, error } = await admin()
    .from("quality_evaluations")
    .upsert(
      {
        account_id: ref.account_id,
        source: ref.source,
        source_id: ref.source_id,
        interaction_start: ref.interaction_start,
        interaction_end: ref.interaction_end,
        revised: false,
        ...row,
      },
      { onConflict: "account_id,source,source_id,interaction_end" },
    )
    .select("id")
    .single();
  if (error) throw new Error(`não deu para gravar a avaliação: ${error.message}`);
  return data?.id ?? null;
}

export interface EvaluateResult {
  status: "done" | "error" | "skipped";
  evaluationId: string | null;
  score?: number;
  reason?: string;
}

/** Avalia uma interação. Erro de IA vira linha "error" (não volta para a fila sozinha). */
export async function evaluateInteraction(
  ref: InteractionRef,
  opts: { ignoreBudget?: boolean } = {},
): Promise<EvaluateResult> {
  const db = admin();
  const settings = await loadSettings(ref.account_id);
  const loaded = await loadInteraction(ref);
  if (!loaded) return { status: "skipped", evaluationId: null, reason: "interação sem conteúdo" };
  const base = {
    channel: loaded.channel,
    agent_user_id: loaded.agentUserId,
    is_ai: loaded.isAi,
    contact_id: loaded.contactId,
  };
  const skip = async (reason: string): Promise<EvaluateResult> => ({
    status: "skipped",
    evaluationId: await save(ref, { ...base, status: "skipped", error: reason }),
    reason,
  });

  if (loaded.isAi && !settings.include_ai) return skip("conversas da IA estão fora da avaliação");
  const { data: forms } = await db
    .from("quality_forms")
    .select("id, name, criteria, channels, include_ai")
    .eq("account_id", ref.account_id)
    .eq("is_active", true)
    .contains("channels", [loaded.channel])
    .order("created_at", { ascending: true });
  const form = (forms ?? []).find((f) => !loaded.isAi || f.include_ai);
  if (!form) return skip("nenhum formulário ativo para este canal");

  if (!opts.ignoreBudget) {
    const { data: spend } = await db.rpc("quality_spend", { _account: ref.account_id });
    const s = (spend ?? {}) as { month_usd?: number; today?: number };
    if (Number(s.month_usd ?? 0) >= settings.monthly_budget_usd)
      return skip("teto de custo do mês atingido");
    if (Number(s.today ?? 0) >= settings.daily_max)
      return skip("limite de avaliações do dia atingido");
  }

  const criteria = normalizeCriteria(form.criteria);
  const { data: acc } = await db.from("accounts").select("name").eq("id", ref.account_id).single();
  try {
    const { callJson } = await import("@/backend/llm.server");
    const r = await callJson<{ items?: unknown; summary?: string }>(
      ref.account_id,
      "quality.evaluate",
      {
        system: evaluationPrompt({
          criteria,
          channel: loaded.channel,
          isAi: loaded.isAi,
          formName: form.name,
          company: acc?.name ?? "a empresa",
        }),
        messages: [{ role: "user", content: `Transcrição:\n${loaded.transcript}` }],
        schemaName: "avaliacao",
        schema: EVALUATION_SCHEMA,
        maxTokens: 1500,
      },
      { modelFor: { anthropic: settings.model_anthropic, openai: settings.model_openai } },
    );
    const items = mergeAiItems(criteria, r.data.items, loaded.transcript);
    const total = computeScore(items);
    const id = await save(ref, {
      ...base,
      form_id: form.id,
      form_name: form.name,
      status: "done",
      score: total.score,
      ai_score: total.score,
      eliminated: total.eliminated,
      items: items as unknown as Json,
      summary: String(r.data.summary ?? "").slice(0, 800),
      model: r.model,
      cost_usd: r.costUsd,
      error: null,
    });
    return { status: "done", evaluationId: id, score: total.score };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    const id = await save(ref, {
      ...base,
      form_id: form.id,
      form_name: form.name,
      status: "error",
      error: reason.slice(0, 400),
    });
    return { status: "error", evaluationId: id, reason };
  }
}

/** Reavalia uma linha existente (erro, pulada ou pedido do gestor). */
export async function reevaluate(accountId: string, evaluationId: string): Promise<EvaluateResult> {
  const { data: e } = await admin()
    .from("quality_evaluations")
    .select("account_id, source, source_id, interaction_start, interaction_end")
    .eq("id", evaluationId)
    .eq("account_id", accountId)
    .maybeSingle();
  if (!e) return { status: "skipped", evaluationId: null, reason: "avaliação não encontrada" };
  return evaluateInteraction(
    {
      account_id: e.account_id,
      source: e.source as InteractionRef["source"],
      source_id: e.source_id,
      interaction_start: e.interaction_start,
      interaction_end: e.interaction_end,
    },
    { ignoreBudget: true },
  );
}
