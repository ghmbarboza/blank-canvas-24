// Ferramentas da URA que conversa (agente de voz da ElevenLabs): a IA entende o assunto,
// escolhe a fila pela habilidade e passa com resumo; sem humano livre, oferece retorno ou WhatsApp.
import { admin, isUuid } from "@/backend/http.server";
import { matchQueue } from "@/features/queue/lib";
import { toE164 } from "@/features/telephony/lib";

type ToolBody = Record<string, string | undefined>;
interface ToolContact {
  id: string;
  name: string | null;
  phone: string | null;
}

interface Availability {
  free_agents: number;
  available_agents: number;
  waiting: number;
  estimated_wait_seconds: number | null;
}

function waitPhrase(a: Availability): string {
  if (a.estimated_wait_seconds === null) return "ninguém da equipe está disponível agora";
  const m = Math.max(1, Math.round(a.estimated_wait_seconds / 60));
  return `a espera estimada é de uns ${m} minuto${m > 1 ? "s" : ""}`;
}

async function callIdFor(accountId: string, conversationId: string | undefined) {
  if (!conversationId) return null;
  const { data } = await admin()
    .from("calls")
    .select("id, voice_agent_id")
    .eq("account_id", accountId)
    .eq("el_conversation_id", conversationId)
    .maybeSingle();
  return data;
}

export async function handleQueueTool(
  accountId: string,
  tool: string,
  b: ToolBody,
  contact: ToolContact | null,
): Promise<{ result: string; [k: string]: unknown }> {
  const db = admin();
  const phone = toE164(b["caller_phone"] ?? b["system__caller_id"] ?? contact?.phone ?? null);
  const summary = (b["resumo"] ?? "").trim().slice(0, 1500);
  const call = await callIdFor(accountId, b["system__conversation_id"] ?? b["conversation_id"]);
  const { data: queues } = await db
    .from("call_queues")
    .select("id, name, skills")
    .eq("account_id", accountId)
    .eq("is_active", true)
    .contains("channels", ["voice"]);
  const q = matchQueue(queues ?? [], `${b["assunto"] ?? ""} ${summary}`);
  const skill = q?.skills[0] ?? null;

  if (tool === "request_callback") {
    if (!phone) return { result: "Não tenho o telefone da pessoa. Pergunte o número com DDD." };
    const when =
      b["quando_iso"] && !Number.isNaN(Date.parse(b["quando_iso"])) ? b["quando_iso"] : null;
    const { data, error } = await db.rpc("request_callback", {
      _account: accountId,
      _phone: phone,
      ...(contact?.id ? { _contact: contact.id } : {}),
      ...(when ? { _when: when } : {}),
      ...(summary ? { _note: summary } : {}),
      ...(skill ? { _skill: skill } : {}),
    });
    if (error)
      return { result: "Não consegui registrar o retorno. Ofereça continuar pelo WhatsApp." };
    if (call?.id && data && isUuid((data as { id?: string }).id))
      await db
        .from("work_items")
        .update({ metadata: { from_call_id: call.id, voice_agent_id: call.voice_agent_id } })
        .eq("id", (data as { id: string }).id);
    return {
      result: when
        ? "Retorno agendado. Confirme o horário com a pessoa e encerre com cordialidade."
        : "Retorno registrado: alguém da equipe liga assim que ficar livre. Confirme o número e encerre com cordialidade.",
    };
  }

  // route_to_queue
  const { data: avail } = await db.rpc("cc_availability", {
    _account: accountId,
    ...(skill ? { _skill: skill } : {}),
  });
  const a = (avail ?? {
    free_agents: 0,
    available_agents: 0,
    waiting: 0,
    estimated_wait_seconds: null,
  }) as unknown as Availability;
  const { data: item } = await db.rpc("enqueue_work_item", {
    _account: accountId,
    _kind: "handoff",
    _channel: "voice",
    _subject: `${q?.name ?? "Atendimento"}: ${(b["assunto"] ?? "passagem da IA").slice(0, 120)}`,
    ...(contact?.id ? { _contact: contact.id } : {}),
    ...(summary ? { _summary: summary } : {}),
    ...(skill ? { _skill: skill } : {}),
    _priority: 70,
    _due: new Date(Date.now() + 60_000).toISOString(),
    ...(phone ? { _phone: phone } : {}),
    _metadata: { from_call_id: call?.id ?? null, voice_agent_id: call?.voice_agent_id ?? null },
  });
  const itemId = (item as { id?: string } | null)?.id ?? null;
  if (a.free_agents > 0)
    return {
      result: `Tem gente livre na fila ${q?.name ?? "de atendimento"}. Diga que vai passar para um especialista que já recebeu o resumo do caso, e use transfer_to_number agora. Não peça para a pessoa repetir nada.`,
      work_item_id: itemId,
    };
  return {
    result: `Ninguém livre na fila ${q?.name ?? "de atendimento"} agora (${waitPhrase(a)}). Não deixe a pessoa esperando em silêncio: ofereça um retorno por ligação (request_callback) ou continuar pelo WhatsApp (send_whatsapp). Se ela preferir esperar e houver alguém disponível, use transfer_to_number.`,
    work_item_id: itemId,
  };
}
