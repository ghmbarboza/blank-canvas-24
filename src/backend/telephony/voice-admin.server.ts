// Gestão da voz com IA: publicar agente, registrar número, testar por texto e campanhas.
import { HttpError, admin, appBaseUrl, isUuid, type Caller } from "@/backend/http.server";
import { applySegment, isSegmentFilter } from "@/features/segments/rules";
import { toE164 } from "@/features/telephony/lib";

import { crmVariables, registerPhone, submitBatch, syncAgent } from "./voice.server";

export async function publishAgent(req: Request, caller: Caller, agentId: unknown) {
  if (!isUuid(agentId)) throw new HttpError(400, "Agente inválido", "bad_agent");
  const r = await syncAgent(caller.accountId, agentId, appBaseUrl(req));
  await admin().rpc("audit", {
    _account: caller.accountId,
    _action: "voice_agent.published",
    _entity: "voice_agent",
    _entity_id: agentId,
    _meta: { diff: r.diff.length },
  });
  return r;
}

export async function registerNumber(caller: Caller, phoneId: unknown, sipPassword: unknown) {
  if (!isUuid(phoneId)) throw new HttpError(400, "Número inválido", "bad_phone");
  return registerPhone(
    caller.accountId,
    phoneId,
    typeof sipPassword === "string" && sipPassword ? sipPassword : null,
  );
}

// Teste por texto sem gastar crédito de voz: a IA da conta faz o papel do agente com o mesmo prompt.
export async function testAgent(caller: Caller, body: Record<string, unknown>) {
  const agentId = body["agentId"];
  const contactId = body["contactId"];
  const messages = body["messages"];
  if (!isUuid(agentId)) throw new HttpError(400, "Agente inválido", "bad_agent");
  const { data: a } = await admin()
    .from("voice_agents")
    .select("*")
    .eq("id", agentId)
    .eq("account_id", caller.accountId)
    .single();
  if (!a) throw new HttpError(404, "Agente não encontrado", "not_found");
  const vars = await crmVariables(caller.accountId, isUuid(contactId) ? contactId : null, a.name);
  const fill = (t: string) => t.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k: string) => vars[k] ?? "");
  const history = (Array.isArray(messages) ? messages : [])
    .filter(
      (m): m is { role: "user" | "assistant"; content: string } =>
        Boolean(m) && typeof (m as { content?: unknown }).content === "string",
    )
    .slice(-20)
    .map((m) => ({
      role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: m.content.slice(0, 1000),
    }));
  if (history.length === 0) return { reply: fill(a.first_message ?? "Olá!"), tool: null };
  const { callJson } = await import("@/backend/llm-simple.server");
  const { teamPersona } = await import("./voice.server");
  const shared = await teamPersona(caller.accountId, a.id, a.tools);
  const basePrompt = shared ? `${shared.promptPrefix}\n\n${a.prompt}` : a.prompt;
  const system = `${fill(basePrompt)}${a.knowledge ? `\n\nBase de conhecimento:\n${a.knowledge}` : ""}\n\nVocê está numa LIGAÇÃO de voz: respostas curtas, faladas. Ferramentas disponíveis: ${(shared?.tools ?? a.tools).join(", ")}. Se precisar de uma, diga qual usaria em "tool".`;
  const { data } = await callJson<{ fala: string; tool: string | null }>({
    accountId: caller.accountId,
    purpose: "voice_agent_test",
    system,
    messages: history,
    schemaName: "resposta",
    schema: {
      type: "object",
      properties: {
        fala: { type: "string", description: "O que o agente fala agora." },
        tool: { type: ["string", "null"], description: "Ferramenta que usaria agora, se alguma." },
      },
      required: ["fala", "tool"],
    },
    maxTokens: 400,
  });
  return { reply: data.fala, tool: data.tool };
}

// Vozes da conta ElevenLabs (as em português primeiro).
export async function listVoices(caller: Caller) {
  const { eleven } = await import("@/backend/providers/elevenlabs.server");
  const { elevenKey } = await import("./core.server");
  const r = await eleven<{
    voices?: {
      voice_id: string;
      name: string;
      preview_url?: string;
      labels?: Record<string, string>;
    }[];
  }>(await elevenKey(caller.accountId), "/v1/voices");
  const voices = (r.voices ?? []).map((v) => ({
    voice_id: v.voice_id,
    name: v.name,
    accent: v.labels?.["accent"] ?? v.labels?.["language"] ?? null,
    preview_url: v.preview_url ?? null,
  }));
  const pt = (x: { accent: string | null; name: string }) =>
    /portug|brazil|pt/i.test(`${x.accent ?? ""} ${x.name}`);
  return { voices: [...voices.filter(pt), ...voices.filter((v) => !pt(v))] };
}

// Inscreve o público do segmento na campanha (só quem tem telefone e não está na lista de não ligar).
export async function enrollCampaign(caller: Caller, campaignId: unknown) {
  if (!isUuid(campaignId)) throw new HttpError(400, "Campanha inválida", "bad_campaign");
  const db = admin();
  const { data: c } = await db
    .from("voice_campaigns")
    .select("*")
    .eq("id", campaignId)
    .eq("account_id", caller.accountId)
    .single();
  if (!c) throw new HttpError(404, "Campanha não encontrada", "not_found");
  if (!c.segment_id) throw new HttpError(422, "Escolha um segmento para a campanha", "no_segment");
  const { data: seg } = await db
    .from("segments")
    .select("filter")
    .eq("id", c.segment_id)
    .eq("account_id", caller.accountId)
    .single();
  const filter = isSegmentFilter(seg?.filter) ? seg.filter : null;
  const { data: supp } = await db
    .from("suppressions")
    .select("address")
    .eq("account_id", caller.accountId)
    .eq("channel", "voice");
  const blocked = new Set((supp ?? []).map((s) => s.address.replace(/\D/g, "").slice(-8)));
  let added = 0;
  let skipped = 0;
  for (let offset = 0; offset < 20_000; offset += 1000) {
    const q = applySegment(
      db
        .from("contacts")
        .select("id, phone")
        .eq("account_id", caller.accountId)
        .not("phone", "is", null),
      filter,
    );
    const { data, error } = await q.order("id").range(offset, offset + 999);
    if (error) throw new HttpError(500, error.message, "segment_query");
    const rows = (data ?? [])
      .map((r) => ({ id: r.id, phone: toE164(r.phone) }))
      .filter((r): r is { id: string; phone: string } => {
        const ok = Boolean(r.phone) && !blocked.has(r.phone!.replace(/\D/g, "").slice(-8));
        if (!ok) skipped += 1;
        return ok;
      });
    if (rows.length) {
      const { error: insErr, count } = await db.from("voice_campaign_targets").upsert(
        rows.map((r) => ({
          account_id: caller.accountId,
          campaign_id: c.id,
          contact_id: r.id,
          phone: r.phone,
        })),
        { onConflict: "campaign_id,contact_id", ignoreDuplicates: true, count: "exact" },
      );
      if (insErr) throw new HttpError(500, insErr.message, "enroll");
      added += count ?? rows.length;
    }
    if (!data || data.length < 1000) break;
  }
  return { added, skipped };
}

export async function setCampaignStatus(caller: Caller, campaignId: unknown, status: unknown) {
  if (!isUuid(campaignId)) throw new HttpError(400, "Campanha inválida", "bad_campaign");
  if (status !== "running" && status !== "paused" && status !== "canceled")
    throw new HttpError(400, "Status inválido", "bad_status");
  const db = admin();
  const { data: c } = await db
    .from("voice_campaigns")
    .select("*")
    .eq("id", campaignId)
    .eq("account_id", caller.accountId)
    .single();
  if (!c) throw new HttpError(404, "Campanha não encontrada", "not_found");
  if (status === "running") {
    if (!c.voice_agent_id) throw new HttpError(422, "Escolha o agente de voz", "no_agent");
    const { data: ag } = await db
      .from("voice_agents")
      .select("status")
      .eq("id", c.voice_agent_id)
      .eq("account_id", caller.accountId)
      .single();
    if (ag?.status !== "published")
      throw new HttpError(422, "Publique o agente de voz antes de iniciar", "agent_draft");
    const { count } = await db
      .from("voice_campaign_targets")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", c.id)
      .eq("status", "pending");
    if (!count) throw new HttpError(422, "Inscreva o público antes de iniciar", "no_targets");
    if (c.use_batch && !c.el_batch_id) {
      const { data: targets } = await db
        .from("voice_campaign_targets")
        .select("id, contact_id, phone")
        .eq("campaign_id", c.id)
        .eq("status", "pending")
        .limit(5000);
      const recipients = [];
      for (const t of targets ?? [])
        recipients.push({
          phone: t.phone,
          vars: await crmVariables(caller.accountId, t.contact_id, "Assistente"),
        });
      const batchId = await submitBatch(
        caller.accountId,
        { name: c.name, agentRowId: c.voice_agent_id, phoneNumberRowId: c.phone_number_id },
        recipients,
      );
      await db
        .from("voice_campaign_targets")
        .update({ status: "calling", attempts: 1, last_attempt_at: new Date().toISOString() })
        .eq("campaign_id", c.id)
        .eq("status", "pending");
      await db
        .from("voice_campaigns")
        .update({ el_batch_id: batchId, status: "running" })
        .eq("id", c.id)
        .eq("account_id", caller.accountId);
      return { ok: true, batch_id: batchId };
    }
  }
  await db
    .from("voice_campaigns")
    .update({ status })
    .eq("id", c.id)
    .eq("account_id", caller.accountId);
  await db.rpc("audit", {
    _account: caller.accountId,
    _action: `voice_campaign.${status}`,
    _entity: "voice_campaign",
    _entity_id: c.id,
    _meta: {},
  });
  return { ok: true };
}

/**
 * Liga agora para um contato pela IA de voz (botão na ficha). Vai pelo job voice.call, que
 * confere bloqueio, horário de silêncio e Anatel antes de discar; o resultado volta à ficha.
 */
export async function callContact(caller: Caller, body: Record<string, unknown>) {
  const agentId = body["agentId"];
  const contactId = body["contactId"];
  if (!isUuid(contactId)) throw new HttpError(400, "Contato inválido", "bad_contact");
  const db = admin();
  const { data: agent } = isUuid(agentId)
    ? await db
        .from("voice_agents")
        .select("id, status")
        .eq("id", agentId)
        .eq("account_id", caller.accountId)
        .maybeSingle()
    : await db
        .from("voice_agents")
        .select("id, status")
        .eq("account_id", caller.accountId)
        .eq("status", "published")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
  if (!agent || agent.status !== "published")
    throw new HttpError(409, "Publique um agente de voz antes de ligar", "no_voice_agent");
  const { data: contact } = await db
    .from("contacts")
    .select("id, phone")
    .eq("id", contactId)
    .eq("account_id", caller.accountId)
    .maybeSingle();
  if (!contact?.phone) throw new HttpError(422, "O contato não tem telefone", "no_phone");
  // as mesmas travas do job (bloqueio, silêncio, Anatel), já aqui: a tela diz o porquê na hora
  const { assertCanCall } = await import("./core.server");
  await assertCanCall(caller.accountId, contact.id, toE164(contact.phone) ?? contact.phone);
  const motivo = typeof body["motivo"] === "string" ? body["motivo"].trim().slice(0, 400) : "";
  const { error } = await db.rpc("enqueue_job", {
    _account: caller.accountId,
    _kind: "voice.call",
    _payload: {
      contact_id: contact.id,
      voice_agent_id: agent.id,
      context: { direcao: "saida", motivo },
      requested_by: caller.userId,
    },
  });
  if (error) throw new HttpError(500, error.message, "enqueue");
  await db.rpc("audit", {
    _account: caller.accountId,
    _action: "voice.call_requested",
    _entity: "contact",
    _entity_id: contact.id,
    _meta: { voice_agent_id: agent.id, motivo },
  });
  return { ok: true };
}

/**
 * Número da Zadarma que já está na ElevenLabs (tronco SIP registrado por lá): vincula ao Nexus
 * e ao agente de voz, sem cadastrar tronco de novo.
 */
export async function linkNumber(caller: Caller, body: Record<string, unknown>) {
  const number = toE164(typeof body["number"] === "string" ? body["number"] : null);
  const elPhone = typeof body["elevenlabsPhoneId"] === "string" ? body["elevenlabsPhoneId"] : "";
  const provider = "zadarma";
  const agentId = isUuid(body["agentId"]) ? (body["agentId"] as string) : null;
  if (!number || !/^phnum_[a-z0-9]+$/i.test(elPhone))
    throw new HttpError(400, "Informe o número e o id da ElevenLabs (phnum_…)", "bad_input");
  const db = admin();
  if (agentId) {
    const { data: agent } = await db
      .from("voice_agents")
      .select("id")
      .eq("id", agentId)
      .eq("account_id", caller.accountId)
      .maybeSingle();
    if (!agent) throw new HttpError(404, "Agente de voz não encontrado", "not_found");
  }
  const { data: existing } = await db
    .from("phone_numbers")
    .select("id")
    .eq("account_id", caller.accountId)
    .eq("number", number)
    .maybeSingle();
  const row = {
    account_id: caller.accountId,
    number,
    label: typeof body["label"] === "string" ? body["label"] : number,
    provider,
    usage: ["outbound", "inbound"],
    elevenlabs_phone_id: elPhone,
    voice_agent_id: agentId,
    is_active: true,
  };
  const { data, error } = existing
    ? await db
        .from("phone_numbers")
        .update(row)
        .eq("id", existing.id)
        .eq("account_id", caller.accountId)
        .select("id")
        .single()
    : await db.from("phone_numbers").insert(row).select("id").single();
  if (error || !data) throw new HttpError(500, error?.message ?? "não gravou", "insert");
  if (agentId)
    await db
      .from("voice_agents")
      .update({ phone_number_id: data.id })
      .eq("id", agentId)
      .eq("account_id", caller.accountId);
  return { phone_number_id: data.id };
}
