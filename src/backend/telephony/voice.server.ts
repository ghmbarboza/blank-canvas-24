// Voz com IA: agente da ElevenLabs (eleven_v4_turbo), número SIP da Zadarma registrado nela,
// ligação de saída e campanha em lote. Toda escrita é conferida pela leitura de volta.
import { randomBytes } from "node:crypto";

import { HttpError, admin, safeEqual } from "@/backend/http.server";
import { getIntegration } from "@/backend/integrations.server";
import { eleven } from "@/backend/providers/elevenlabs.server";
import {
  BASE_DATA_COLLECTION,
  buildAgentBody,
  diffAgent,
  type AgentInput,
} from "@/features/telephony/agent-sync";

import { accountContext, elevenKey } from "./core.server";

const TOOL_SECRET_KEY = "voice_tool_secret";
const POSTCALL_HOOK_KEY = "voice_postcall_hook_id";
const POSTCALL_SECRET_KEY = "voice_postcall_secret";

async function getSecretValue(accountId: string, key: string): Promise<string | null> {
  const { data } = await admin().rpc("secret_get", {
    _scope: "integration",
    _scope_id: accountId,
    _key: key,
  });
  return typeof data === "string" && data ? data : null;
}

async function setSecretValue(accountId: string, key: string, value: string) {
  const { error } = await admin().rpc("secret_set", {
    _account: accountId,
    _scope: "integration",
    _scope_id: accountId,
    _key: key,
    _value: value,
  });
  if (error) throw new Error(`secret_set: ${error.message}`);
}

export async function toolSecret(accountId: string): Promise<string> {
  const cur = await getSecretValue(accountId, TOOL_SECRET_KEY);
  if (cur) return cur;
  const s = randomBytes(24).toString("hex");
  await setSecretValue(accountId, TOOL_SECRET_KEY, s);
  return s;
}

export async function assertToolSecret(accountId: string, header: string | null) {
  const s = await getSecretValue(accountId, TOOL_SECRET_KEY);
  if (!s || !header || !safeEqual(header, s))
    throw new HttpError(401, "Segredo da ferramenta inválido", "unauthorized");
}

// Segredo do webhook pós-chamada: o informado em Ajustes › Integrações tem prioridade;
// senão, o devolvido quando a plataforma criou o webhook do workspace.
export async function postCallSecret(accountId: string): Promise<string | null> {
  const it = await getIntegration(accountId, "elevenlabs");
  return it?.secrets["webhook_secret"] ?? (await getSecretValue(accountId, POSTCALL_SECRET_KEY));
}

// Cria (uma vez) o webhook pós-chamada no workspace da ElevenLabs e liga por agente.
async function ensurePostCallHook(
  accountId: string,
  apiKey: string,
  baseUrl: string,
): Promise<string | null> {
  const existing = await getSecretValue(accountId, POSTCALL_HOOK_KEY);
  if (existing) return existing;
  try {
    const r = await eleven<{ webhook_id?: string; webhook_secret?: string }>(
      apiKey,
      "/v1/workspace/webhooks",
      {
        method: "POST",
        body: JSON.stringify({
          settings: {
            auth_type: "hmac",
            name: "Vínculo · pós-chamada",
            webhook_url: `${baseUrl}/api/public/voice/postcall?a=${accountId}`,
          },
        }),
      },
    );
    if (!r.webhook_id) return null;
    await setSecretValue(accountId, POSTCALL_HOOK_KEY, r.webhook_id);
    if (r.webhook_secret) await setSecretValue(accountId, POSTCALL_SECRET_KEY, r.webhook_secret);
    return r.webhook_id;
  } catch (err) {
    console.error("[voice] não criou o webhook pós-chamada", err);
    return null;
  }
}

/** Agente da equipe de IA ligado a este agente de voz: mesma persona e ferramentas equivalentes. */
export async function teamPersona(accountId: string, voiceAgentId: string, voiceTools: string[]) {
  const db = admin();
  const { data: team } = await db
    .from("ai_agents")
    .select("id, name, role, persona, tone, goal, instructions, settings")
    .eq("account_id", accountId)
    .eq("voice_agent_id", voiceAgentId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!team) return null;
  const { data: tools } = await db
    .from("agent_tools")
    .select("slug")
    .eq("agent_id", team.id)
    .eq("kind", "internal")
    .eq("enabled", true);
  const { voicePersona } = await import("@/features/agents/voice-persona");
  return {
    ...voicePersona(
      team,
      (tools ?? []).map((t) => t.slug),
      voiceTools,
    ),
    teamName: team.name,
  };
}

// Ferramentas da equipe que não precisam de resposta: a voz segue falando enquanto o Vínculo grava.
const ASYNC_TOOLS = new Set([
  "save_fields",
  "flag",
  "notify_manager",
  "create_task",
  "score_lead",
  "enroll_sequence",
  "handoff_to_human",
]);
// Legadas da voz que não têm par na equipe (as que têm, a equipe faz igual ao texto).
const VOICE_ONLY_TOOLS = ["route_to_queue", "request_callback", "send_whatsapp", "update_deal"];

/** Passar para uma pessoa na ligação: não há transferência ao vivo, vira retorno com dono. */
export const VOICE_HANDOFF_SPEC = {
  name: "handoff_to_human",
  description:
    "Pede para uma pessoa da equipe retornar. Use SÓ quando a pessoa pedir para falar com alguém, reclamar forte ou você não souber resolver. Uma vez por ligação. NUNCA na despedida (tchau, valeu, pode encerrar): aí é end_call.",
  parameters: {
    type: "object",
    properties: {
      reason: { type: "string", description: "Motivo curto" },
      summary: { type: "string", description: "Resumo do caso em uma frase" },
    },
    required: ["reason"],
  },
};

/** Agente da equipe que a voz representa: o ligado, senão o de entrada da conta. */
async function teamForVoice(accountId: string, voiceAgentId: string) {
  const db = admin();
  const { data: linked } = await db
    .from("ai_agents")
    .select("id, name, settings, status, role")
    .eq("account_id", accountId)
    .eq("voice_agent_id", voiceAgentId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (linked) return linked;
  const { data: any } = await db
    .from("ai_agents")
    .select("id, name, settings, status, role")
    .eq("account_id", accountId)
    .neq("role", "supervisor")
    .order("status")
    .limit(1)
    .maybeSingle();
  return any;
}

/**
 * Por padrão a voz pode tudo o que a equipe pode (regra da empresa); o que o cliente desligar em
 * Habilidades (agent_tools.enabled = false) fica de fora. Agenda só com página de agendamento.
 */
export async function voiceTeamTools(
  accountId: string,
  team: { id: string; settings: unknown },
): Promise<NonNullable<AgentInput["teamTools"]>> {
  const [{ INTERNAL_TOOLS, agentSettingsV2 }, { implementedTools }, { data: off }] =
    await Promise.all([
      import("@/features/agents/catalog"),
      import("@/backend/agents/tools.server"),
      admin()
        .from("agent_tools")
        .select("slug")
        .eq("account_id", accountId)
        .eq("agent_id", team.id)
        .eq("kind", "internal")
        .eq("enabled", false),
    ]);
  const disabled = new Set((off ?? []).map((t) => t.slug));
  const available = implementedTools();
  const booking = Boolean(agentSettingsV2(team.settings).booking_slug);
  const tools = INTERNAL_TOOLS.filter(
    (t) => available.has(t.slug) && !disabled.has(t.slug) && (t.requires !== "booking" || booking),
  ).map((t) => ({
    name: t.slug,
    description: t.description,
    parameters: t.parameters as never,
    async: ASYNC_TOOLS.has(t.slug),
  }));
  return disabled.has("handoff_to_human")
    ? tools
    : [...tools, { ...VOICE_HANDOFF_SPEC, async: true }];
}

export async function syncAgent(accountId: string, agentId: string, baseUrl: string) {
  const db = admin();
  const { data: a } = await db
    .from("voice_agents")
    .select("*")
    .eq("id", agentId)
    .eq("account_id", accountId)
    .single();
  if (!a) throw new HttpError(404, "Agente não encontrado", "not_found");
  if (!a.voice_id) throw new HttpError(422, "Escolha uma voz para o agente", "no_voice");
  const apiKey = await elevenKey(accountId);
  const ctx = await accountContext(accountId);
  await db
    .from("voice_agents")
    .update({ status: "syncing", last_sync_error: null })
    .eq("id", agentId)
    .eq("account_id", accountId);
  try {
    const hookId = await ensurePostCallHook(accountId, apiKey, baseUrl);
    // O cérebro da voz é o mesmo do texto: persona, roteiro, base, catálogo e habilidades da equipe.
    const team = await teamForVoice(accountId, agentId);
    let prompt = a.prompt ?? "";
    let teamTools: NonNullable<AgentInput["teamTools"]> = [];
    let legacyTools = a.tools;
    let dataCollection = BASE_DATA_COLLECTION;
    const keywords = [ctx.name, a.name];
    if (team) {
      const [{ buildVoicePrompt }, { agentSettingsV2 }, { data: products }] = await Promise.all([
        import("./voice-native.server"),
        import("@/features/agents/catalog"),
        db.from("products").select("name").eq("account_id", accountId).eq("active", true).limit(40),
      ]);
      const v = await buildVoicePrompt(accountId, { teamAgentId: team.id, direction: "any" });
      prompt = prompt.trim()
        ? `${v.prompt}\n\nInstruções deste agente de voz (da empresa):\n${prompt.trim()}`
        : v.prompt;
      teamTools = await voiceTeamTools(accountId, team);
      legacyTools = a.tools.filter((t) => VOICE_ONLY_TOOLS.includes(t));
      // agendar é obrigatório na voz: sem página de agendamento, vai a agenda nativa (events)
      if (!teamTools.some((t) => t.name === "book")) legacyTools.push("slots", "book");
      // campos do formulário conversacional do agente também são coletados na ligação
      const fields = agentSettingsV2(team.settings).form_fields;
      dataCollection = {
        ...BASE_DATA_COLLECTION,
        ...Object.fromEntries(
          fields.map((f) => [`campo_${f.key}`, { type: "string" as const, description: f.label }]),
        ),
      };
      keywords.push(team.name, ...(products ?? []).map((p) => p.name));
    }
    const body = buildAgentBody({
      name: a.name,
      prompt,
      firstMessage: a.first_message ?? "",
      voiceId: a.voice_id,
      modelId: a.model_id,
      language: a.language,
      knowledge: a.knowledge,
      tools: legacyTools,
      teamTools,
      dataCollection,
      keywords: keywords.filter(Boolean),
      transferNumber: a.transfer_number,
      baseUrl,
      accountId,
      agentRowId: agentId,
      toolSecret: await toolSecret(accountId),
      companyName: ctx.name,
      agentName: a.name,
      postCallWebhookId: hookId,
    });
    let elId = a.elevenlabs_agent_id;
    if (elId) {
      await eleven(apiKey, `/v1/convai/agents/${elId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
    } else {
      const created = await eleven<{ agent_id: string }>(apiKey, "/v1/convai/agents/create", {
        method: "POST",
        body: JSON.stringify(body),
      });
      elId = created.agent_id;
    }
    const actual = await eleven<unknown>(apiKey, `/v1/convai/agents/${elId}`);
    const diff = diffAgent(body, actual);
    await db
      .from("voice_agents")
      .update({
        elevenlabs_agent_id: elId,
        status: diff.length ? "error" : "published",
        sync_diff: diff as never,
        last_sync_error: diff.length
          ? `A ElevenLabs não gravou: ${diff.map((d) => d.field).join(", ")}`
          : null,
        synced_at: new Date().toISOString(),
      })
      .eq("id", agentId)
      .eq("account_id", accountId);
    return { elevenlabs_agent_id: elId, diff };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db
      .from("voice_agents")
      .update({ status: "error", last_sync_error: msg.slice(0, 500) })
      .eq("id", agentId)
      .eq("account_id", accountId);
    throw new HttpError(502, msg, "eleven_sync");
  }
}

// Registra o número da Zadarma na ElevenLabs como tronco SIP (entrada e saída) e liga ao agente.
export async function registerPhone(
  accountId: string,
  phoneId: string,
  sipPassword: string | null,
) {
  const db = admin();
  const { data: p } = await db
    .from("phone_numbers")
    .select("*")
    .eq("id", phoneId)
    .eq("account_id", accountId)
    .single();
  if (!p) throw new HttpError(404, "Número não encontrado", "not_found");
  if (!p.sip_id) throw new HttpError(422, "Informe o login SIP da Zadarma deste número", "no_sip");
  const apiKey = await elevenKey(accountId);
  let elPhone = p.elevenlabs_phone_id;
  if (!elPhone) {
    if (!sipPassword)
      throw new HttpError(422, "Informe a senha SIP para registrar o número", "no_sip_password");
    const r = await eleven<{ phone_number_id: string }>(apiKey, "/v1/convai/phone-numbers", {
      method: "POST",
      body: JSON.stringify({
        phone_number: p.number,
        label: p.label ?? p.number,
        provider: "sip_trunk",
        supports_inbound: p.usage.includes("inbound"),
        supports_outbound: true,
        outbound_trunk_config: {
          address: "sip.zadarma.com",
          transport: "udp",
          credentials: { username: p.sip_id, password: sipPassword },
        },
      }),
    });
    elPhone = r.phone_number_id;
  }
  if (p.voice_agent_id) {
    const { data: ag } = await db
      .from("voice_agents")
      .select("elevenlabs_agent_id")
      .eq("id", p.voice_agent_id)
      .eq("account_id", accountId)
      .single();
    if (ag?.elevenlabs_agent_id)
      await eleven(apiKey, `/v1/convai/phone-numbers/${elPhone}`, {
        method: "PATCH",
        body: JSON.stringify({ agent_id: ag.elevenlabs_agent_id }),
      });
  }
  const back = await eleven<{
    phone_number?: string;
    assigned_agent?: { agent_id?: string } | null;
  }>(apiKey, `/v1/convai/phone-numbers/${elPhone}`);
  await db
    .from("phone_numbers")
    .update({ elevenlabs_phone_id: elPhone })
    .eq("id", phoneId)
    .eq("account_id", accountId);
  return {
    elevenlabs_phone_id: elPhone,
    assigned_agent: back.assigned_agent?.agent_id ?? null,
    number: back.phone_number ?? p.number,
  };
}

export interface OutboundInput {
  accountId: string;
  agentRowId: string;
  phoneNumberRowId?: string | null;
  toNumber: string;
  dynamicVariables: Record<string, string>;
}

export async function outboundCall(
  i: OutboundInput,
): Promise<{ conversation_id: string | null; elPhoneId: string; agentPhoneNumber: string }> {
  const db = admin();
  const apiKey = await elevenKey(i.accountId);
  const { data: a } = await db
    .from("voice_agents")
    .select("elevenlabs_agent_id, phone_number_id, status")
    .eq("id", i.agentRowId)
    .eq("account_id", i.accountId)
    .single();
  if (!a?.elevenlabs_agent_id || a.status !== "published")
    throw new Error("Agente de voz não publicado na ElevenLabs");
  const phoneId = i.phoneNumberRowId ?? a.phone_number_id;
  const { data: p } = phoneId
    ? await db
        .from("phone_numbers")
        .select("number, elevenlabs_phone_id, provider")
        .eq("id", phoneId)
        .eq("account_id", i.accountId)
        .single()
    : { data: null };
  if (!p?.elevenlabs_phone_id) throw new Error("Número de saída não registrado na ElevenLabs");
  // A telefonia do Vínculo é só a Zadarma: a ElevenLabs liga pelo tronco SIP dela.
  if (p.provider !== "zadarma")
    throw new Error(
      "Este número não é da Zadarma. Vincule um número da Zadarma em Ligações › Números",
    );
  const r = await eleven<{ success?: boolean; conversation_id?: string; message?: string }>(
    apiKey,
    "/v1/convai/sip-trunk/outbound-call",
    {
      method: "POST",
      body: JSON.stringify({
        agent_id: a.elevenlabs_agent_id,
        agent_phone_number_id: p.elevenlabs_phone_id,
        to_number: i.toNumber,
        conversation_initiation_client_data: { dynamic_variables: i.dynamicVariables },
      }),
    },
  );
  if (r.success === false) throw new Error(r.message ?? "A ElevenLabs recusou a ligação");
  return {
    conversation_id: r.conversation_id ?? null,
    elPhoneId: p.elevenlabs_phone_id,
    agentPhoneNumber: p.number,
  };
}

export async function submitBatch(
  accountId: string,
  campaign: { name: string; agentRowId: string; phoneNumberRowId: string | null },
  recipients: { phone: string; vars: Record<string, string> }[],
) {
  const db = admin();
  const apiKey = await elevenKey(accountId);
  const { data: a } = await db
    .from("voice_agents")
    .select("elevenlabs_agent_id, phone_number_id")
    .eq("id", campaign.agentRowId)
    .eq("account_id", accountId)
    .single();
  const phoneId = campaign.phoneNumberRowId ?? a?.phone_number_id;
  const { data: p } = phoneId
    ? await db
        .from("phone_numbers")
        .select("elevenlabs_phone_id")
        .eq("id", phoneId)
        .eq("account_id", accountId)
        .single()
    : { data: null };
  if (!a?.elevenlabs_agent_id || !p?.elevenlabs_phone_id)
    throw new Error("Agente ou número sem registro na ElevenLabs");
  const r = await eleven<{ id?: string; batch_id?: string }>(
    apiKey,
    "/v1/convai/batch-calling/submit",
    {
      method: "POST",
      body: JSON.stringify({
        call_name: campaign.name,
        agent_id: a.elevenlabs_agent_id,
        agent_phone_number_id: p.elevenlabs_phone_id,
        scheduled_time_unix: Math.floor(Date.now() / 1000),
        recipients: recipients.map((r2) => ({
          phone_number: r2.phone,
          conversation_initiation_client_data: { dynamic_variables: r2.vars },
        })),
      }),
    },
  );
  return r.id ?? r.batch_id ?? null;
}

// Contexto do CRM que vira variáveis dinâmicas da ligação.
export async function crmVariables(
  accountId: string,
  contactId: string | null,
  agentName: string,
): Promise<Record<string, string>> {
  const db = admin();
  const ctx = await accountContext(accountId);
  const base: Record<string, string> = {
    company_name: ctx.name,
    agent_name: agentName,
    lead_name: "",
    crm_context: "sem histórico",
    upcoming_meeting_human: "",
    contact_id: contactId ?? "",
  };
  if (!contactId) return base;
  const [{ data: c }, { data: deals }, { data: ev }] = await Promise.all([
    db
      .from("contacts")
      .select(
        "name, phone, company, lifecycle, ai_summary, ai_next_step, ai_intent, score, notes, tags, city",
      )
      .eq("id", contactId)
      .eq("account_id", accountId)
      .single(),
    db
      .from("deals")
      .select("title, value, status")
      .eq("contact_id", contactId)
      .eq("status", "open")
      .limit(3),
    db
      .from("events")
      .select("title, starts_at")
      .eq("contact_id", contactId)
      .gte("starts_at", new Date().toISOString())
      .order("starts_at")
      .limit(1),
  ]);
  const first = (c?.name ?? "").split(" ")[0] ?? "";
  const parts = [
    c?.company && `empresa ${c.company}`,
    c?.lifecycle && `fase ${c.lifecycle}`,
    c?.ai_intent && `interesse: ${c.ai_intent}`,
    c?.ai_summary && `resumo: ${c.ai_summary}`,
    deals?.length
      ? `negócios abertos: ${deals.map((d) => `${d.title} (R$ ${d.value})`).join("; ")}`
      : null,
    c?.ai_next_step && `próximo passo sugerido: ${c.ai_next_step}`,
    c?.city && `cidade ${c.city}`,
    c?.tags?.length && `etiquetas: ${c.tags.join(", ")}`,
    c?.notes && `notas: ${String(c.notes).slice(0, 600)}`,
  ].filter(Boolean);
  const meeting = ev?.[0]
    ? new Intl.DateTimeFormat("pt-BR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: ctx.timezone,
      }).format(new Date(ev[0].starts_at))
    : "";
  return {
    ...base,
    lead_name: first,
    crm_context: parts.join(". ").slice(0, 1500) || "sem histórico",
    upcoming_meeting_human: meeting,
  };
}
