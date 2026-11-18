// Ações do vendedor e do gestor: chave do softphone, clicar para ligar, saldo, token do coach,
// gravação (com auditoria) e dicas do coach na ligação.
import { HttpError, admin, isUuid, type Caller } from "@/backend/http.server";
import { canReadCall } from "@/features/telephony/call-access";
import { getIntegration } from "@/backend/integrations.server";
import { deepgramGrant } from "@/backend/providers/deepgram.server";
import {
  zadarmaBalance,
  zadarmaCallback,
  zadarmaCreateInternal,
  zadarmaInternals,
  zadarmaWebrtcKey,
} from "@/backend/providers/zadarma.server";
import {
  callsLeft,
  isValidStartExtension,
  parseCreatedExtension,
  toE164,
} from "@/features/telephony/lib";

import { accountContext, assertCanCall, zadarmaCreds } from "./core.server";

async function myExtension(caller: Caller) {
  const { data } = await admin()
    .from("telephony_extensions")
    .select("extension, sip_login, mobile, is_active")
    .eq("account_id", caller.accountId)
    .eq("user_id", caller.userId)
    .maybeSingle();
  if (!data || !data.is_active)
    throw new HttpError(
      412,
      "Você ainda não tem ramal. Peça ao gestor em Ajustes › Telefonia.",
      "no_extension",
    );
  return data;
}

export async function webrtcKey(caller: Caller) {
  const ext = await myExtension(caller);
  if (!ext.sip_login)
    throw new HttpError(
      412,
      "Seu ramal está sem login SIP. Peça ao gestor para completar em Ajustes › Telefonia.",
      "no_sip",
    );
  const creds = await zadarmaCreds(caller.accountId);
  const r = await zadarmaWebrtcKey(creds, ext.sip_login);
  return { key: r.key, sip: ext.sip_login, extension: ext.extension };
}

// Clicar para ligar: a Zadarma toca primeiro o ramal do vendedor (softphone no navegador ou
// celular cadastrado) e, quando ele atende, liga para o cliente.
export async function clickToCall(caller: Caller, body: Record<string, unknown>) {
  const db = admin();
  let phone = typeof body["phone"] === "string" ? body["phone"] : null;
  let contactId: string | null = null;
  const via = body["via"];
  if (isUuid(body["contactId"])) {
    const { data: c } = await db
      .from("contacts")
      .select("id, phone, owner_user_id, account_id")
      .eq("id", body["contactId"])
      .maybeSingle();
    if (!c || c.account_id !== caller.accountId)
      throw new HttpError(404, "Contato não encontrado", "not_found");
    if (caller.role === "seller" && c.owner_user_id && c.owner_user_id !== caller.userId)
      throw new HttpError(403, "Contato de outro vendedor", "forbidden");
    contactId = c.id;
    phone = phone ?? c.phone;
  }
  const to = toE164(phone);
  if (!to) throw new HttpError(422, "Telefone inválido", "bad_phone");
  await assertCanCall(caller.accountId, contactId, to);
  const ext = await myExtension(caller);
  const from = via === "mobile" && ext.mobile ? ext.mobile.replace(/\D/g, "") : ext.extension;
  const creds = await zadarmaCreds(caller.accountId);
  await zadarmaCallback(creds, from, to.replace("+", ""));
  return { ok: true, to, from: via === "mobile" ? "celular" : `ramal ${ext.extension}` };
}

export async function balance(caller: Caller) {
  const creds = await zadarmaCreds(caller.accountId);
  const ctx = await accountContext(caller.accountId);
  const b = await zadarmaBalance(creds);
  const value = Number(b.balance);
  const left = callsLeft(value, ctx.telephony.avg_call_cost_usd);
  return {
    balance: value,
    currency: b.currency,
    calls_left: Number.isFinite(left) ? left : null,
    threshold_calls: ctx.telephony.balance_threshold_calls,
    low: Number.isFinite(left) && left < ctx.telephony.balance_threshold_calls,
  };
}

export async function deepgramToken(caller: Caller) {
  const it = await getIntegration(caller.accountId, "deepgram");
  const key = it?.secrets["api_key"];
  if (!key)
    throw new HttpError(
      412,
      "Conecte o Deepgram em Ajustes › Integrações para o coach ao vivo",
      "deepgram_off",
    );
  const g = await deepgramGrant(key, 900);
  return { token: g.access_token, expires_in: g.expires_in };
}

export async function recordingUrl(caller: Caller, callId: unknown) {
  if (!isUuid(callId)) throw new HttpError(400, "Ligação inválida", "bad_call");
  const db = admin();
  const { data: c } = await db
    .from("calls")
    .select("id, account_id, recording_path, user_id, contact_id")
    .eq("id", callId)
    .maybeSingle();
  if (!c || c.account_id !== caller.accountId)
    throw new HttpError(404, "Ligação não encontrada", "not_found");
  if (caller.role === "seller" && c.user_id !== caller.userId) {
    const { data: ct } = c.contact_id
      ? await db
          .from("contacts")
          .select("owner_user_id")
          .eq("id", c.contact_id)
          .eq("account_id", caller.accountId)
          .maybeSingle()
      : { data: null };
    if (!canReadCall(caller.role, caller.userId, c.user_id, ct))
      throw new HttpError(403, "Ligação de outro vendedor", "forbidden");
  }
  if (!c.recording_path) throw new HttpError(404, "Esta ligação não tem gravação", "no_recording");
  const s = await db.storage.from("call-recordings").createSignedUrl(c.recording_path, 600);
  if (s.error || !s.data) throw new HttpError(500, "Não deu para abrir a gravação", "signed_url");
  // grava direto com o autor: pelo cliente de serviço, a função audit() não sabe quem ouviu (#75)
  await db.from("audit_log").insert({
    account_id: caller.accountId,
    actor_id: caller.userId,
    action: "recording.played",
    entity: "call",
    entity_id: c.id,
    meta: { by: caller.email },
  });
  return { url: s.data.signedUrl };
}

export interface CoachTip {
  kind: "objection" | "question" | "closing" | "compliance" | "info";
  title: string;
  text: string;
}

// Dicas do coach na ligação: pega a transcrição recente, o playbook da etapa (se houver)
// e devolve até 3 cartões. Chamado pelo navegador a cada ~10 s durante a ligação.
export async function coachTips(
  caller: Caller,
  body: Record<string, unknown>,
): Promise<{ tips: CoachTip[] }> {
  const transcript = typeof body["transcript"] === "string" ? body["transcript"].slice(-6000) : "";
  const contactId = body["contactId"];
  if (transcript.trim().length < 40) return { tips: [] };
  const db = admin();
  let playbook = "";
  try {
    const { data } = await db
      .from("playbooks" as never)
      .select("name, content")
      .eq("account_id", caller.accountId)
      .limit(1);
    const row = (data as unknown as { name?: string; content?: unknown }[] | null)?.[0];
    if (row)
      playbook = `Playbook "${row.name ?? ""}": ${JSON.stringify(row.content).slice(0, 4000)}`;
  } catch {
    playbook = "";
  }
  let products = "";
  const { data: prods } = await db
    .from("products")
    .select("name, price, billing")
    .eq("account_id", caller.accountId)
    .eq("active", true)
    .limit(30);
  if (prods?.length)
    products = `Catálogo: ${prods.map((p) => `${p.name} R$ ${p.price}${p.billing === "monthly" ? "/mês" : ""}`).join("; ")}`;
  let contact = "";
  if (isUuid(contactId)) {
    const { data: c } = await db
      .from("contacts")
      .select("name, ai_summary, ai_intent")
      .eq("id", contactId)
      .eq("account_id", caller.accountId)
      .maybeSingle();
    if (c) contact = `Cliente: ${c.name ?? ""}. ${c.ai_intent ?? ""} ${c.ai_summary ?? ""}`;
  }
  const { callJson } = await import("@/backend/llm-simple.server");
  const { data } = await callJson<{ tips: CoachTip[] }>({
    accountId: caller.accountId,
    purpose: "call_coach",
    system:
      "Você é um coach de vendas que sopra dicas curtas para o vendedor DURANTE a ligação. Só o vendedor lê. Dê no máximo 3 cartões, cada um com até 25 palavras, apenas sobre o que acabou de acontecer: objeção que apareceu (com resposta sugerida), pergunta de qualificação que falta, sinal de compra (o que propor), alerta de compliance (promessa proibida, falta de aviso de gravação). Nunca invente preço: use só o catálogo.",
    messages: [
      {
        role: "user",
        content: [
          contact,
          playbook,
          products,
          `Transcrição (V = vendedor, C = cliente):\n${transcript}`,
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
    schemaName: "dicas",
    schema: {
      type: "object",
      properties: {
        tips: {
          type: "array",
          maxItems: 3,
          items: {
            type: "object",
            properties: {
              kind: {
                type: "string",
                enum: ["objection", "question", "closing", "compliance", "info"],
              },
              title: { type: "string" },
              text: { type: "string" },
            },
            required: ["kind", "title", "text"],
          },
        },
      },
      required: ["tips"],
    },
    maxTokens: 500,
  });
  return { tips: (data.tips ?? []).slice(0, 3) };
}

// Gestor cria o ramal de um membro direto na PABX da Zadarma e já o vincula ao membro.
export async function createExtension(caller: Caller, body: Record<string, unknown>) {
  const userId = body["userId"];
  if (!isUuid(userId)) throw new HttpError(400, "Escolha a pessoa da equipe", "bad_user");
  const db = admin();
  const { data: m } = await db
    .from("memberships")
    .select("user_id, is_active")
    .eq("account_id", caller.accountId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!m || !m.is_active) throw new HttpError(404, "Pessoa fora da equipe", "not_member");
  const { data: existing } = await db
    .from("telephony_extensions")
    .select("id, extension")
    .eq("account_id", caller.accountId)
    .eq("user_id", userId)
    .maybeSingle();
  if (existing)
    throw new HttpError(409, `Esta pessoa já tem o ramal ${existing.extension}`, "has_extension");

  const creds = await zadarmaCreds(caller.accountId);
  const start = isValidStartExtension(body["startNumber"]) ? body["startNumber"] : "any";
  let created;
  try {
    created = await zadarmaCreateInternal(creds, start);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    throw new HttpError(
      502,
      /limit|tariff|plan/i.test(msg)
        ? "A Zadarma recusou: o plano da PABX chegou ao limite de ramais."
        : "A Zadarma não criou o ramal. Confira a PABX no painel da Zadarma.",
      "zadarma_create_failed",
    );
  }
  const info = await zadarmaInternals(creds).catch(() => null);
  const parsed = parseCreatedExtension(created, info?.pbx_id);
  if (!parsed)
    throw new HttpError(502, "A Zadarma não devolveu o número do ramal", "zadarma_no_number");

  const { data: row, error } = await db
    .from("telephony_extensions")
    .insert({
      account_id: caller.accountId,
      user_id: userId,
      extension: parsed.extension,
      sip_login: parsed.sipLogin,
    })
    .select("id, extension, sip_login")
    .single();
  if (error || !row)
    throw new HttpError(
      409,
      `O ramal ${parsed.extension} foi criado na Zadarma, mas já está ligado a outra pessoa aqui.`,
      "extension_taken",
    );
  await db.rpc("audit", {
    _account: caller.accountId,
    _action: "telephony.extension_created",
    _entity: "telephony_extension",
    _entity_id: row.id,
    _meta: { by: caller.email, user_id: userId, extension: row.extension },
  });
  return { id: row.id, extension: row.extension, sip_login: row.sip_login };
}
