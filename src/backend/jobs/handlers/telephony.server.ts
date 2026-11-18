// Jobs de telefonia: ligação da IA (voice.call), pós-chamada (call.process), SMS (sms.send)
// e as tarefas periódicas de campanha de voz e de vigia do saldo da Zadarma.
import { HttpError, admin } from "@/backend/http.server";
import { getIntegration } from "@/backend/integrations.server";
import { zadarmaBalance, zadarmaRecording, zadarmaSms } from "@/backend/providers/zadarma.server";
import {
  accountContext,
  assertCanCall,
  findContactByPhone,
  recordOptOut,
  zadarmaCreds,
} from "@/backend/telephony/core.server";
import { crmVariables, outboundCall } from "@/backend/telephony/voice.server";
import { applyDialPrefix, campaignDialing } from "@/backend/routing/dialing.server";
import type { JobPayloads } from "@/backend/jobs/contract";
import { callsLeft, detectSpokenOptOut, inWindow, toE164 } from "@/features/telephony/lib";

import { registerJob, registerPeriodic } from "../registry.server";

// ───────────────────────── voice.call ─────────────────────────
registerJob("voice.call", async (job) => {
  const p = job.payload as unknown as JobPayloads["voice.call"] & { target_id?: string };
  const accountId = job.account_id!;
  const db = admin();
  const { data: contact } = await db
    .from("contacts")
    .select("id, phone")
    .eq("id", p.contact_id)
    .single();
  const to = toE164(contact?.phone);
  const failTarget = async (status: "skipped" | "dnc" | "failed", result: string) => {
    if (p.target_id)
      await db.from("voice_campaign_targets").update({ status, result }).eq("id", p.target_id);
    return { skipped: true, reason: result };
  };
  if (!to) return failTarget("skipped", "Contato sem telefone válido");
  try {
    await assertCanCall(accountId, p.contact_id, to);
  } catch (err) {
    if (err instanceof HttpError)
      return failTarget(
        err.code === "dnc" || err.code === "no_consent" ? "dnc" : "skipped",
        err.message,
      );
    throw err;
  }
  const { data: agent } = await db
    .from("voice_agents")
    .select("name, phone_number_id")
    .eq("id", p.voice_agent_id)
    .single();
  const crm = await crmVariables(accountId, p.contact_id, agent?.name ?? "Assistente");
  const { outboundOpening } = await import("@/features/telephony/agent-sync");
  const vars = {
    ...crm,
    caller_phone: to,
    direcao: "saida",
    motivo: "",
    abertura: outboundOpening(
      crm["lead_name"] ?? "",
      crm["agent_name"] ?? "",
      crm["company_name"] ?? "",
    ),
    ...Object.fromEntries(Object.entries(p.context ?? {}).map(([k, v]) => [k, String(v)])),
  };
  const { data: call, error } = await db
    .from("calls")
    .insert({
      account_id: accountId,
      direction: "outbound",
      to_number: to,
      contact_id: p.contact_id,
      voice_agent_id: p.voice_agent_id,
      campaign_id: p.campaign_id ?? null,
      phone_number_id: agent?.phone_number_id ?? null,
      status: "ringing",
      metadata: { automation_run_id: p.automation_run_id ?? null, target_id: p.target_id ?? null },
    })
    .select("id")
    .single();
  if (error || !call) throw new Error(`calls insert: ${error?.message}`);
  if (p.target_id)
    await db.from("voice_campaign_targets").update({ call_id: call.id }).eq("id", p.target_id);
  try {
    // Prefixo e número de saída por campanha, quando a empresa definiu.
    const dial = await campaignDialing(p.campaign_id);
    const r = await outboundCall({
      accountId,
      agentRowId: p.voice_agent_id,
      toNumber: applyDialPrefix(to, dial.prefix),
      dynamicVariables: vars,
      ...(dial.phoneNumberId ? { phoneNumberRowId: dial.phoneNumberId } : {}),
    });
    await db
      .from("calls")
      .update({ el_conversation_id: r.conversation_id, from_number: r.agentPhoneNumber })
      .eq("id", call.id);
    return { call_id: call.id, conversation_id: r.conversation_id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db
      .from("calls")
      .update({
        status: "failed",
        disposition_reason: msg.slice(0, 300),
        ended_at: new Date().toISOString(),
      })
      .eq("id", call.id);
    if (p.target_id)
      await db
        .from("voice_campaign_targets")
        .update({ status: "pending", result: msg.slice(0, 200) })
        .eq("id", p.target_id);
    throw err;
  }
});

// ───────────────────────── call.process ─────────────────────────
interface Summary {
  resumo: string;
  sentimento: "positive" | "neutral" | "negative";
  nota: number;
  proximo_passo: string;
  pediu_para_nao_ligar: boolean;
}

registerJob("call.process", async (job) => {
  const { call_id } = job.payload as unknown as JobPayloads["call.process"];
  const db = admin();
  const { data: c } = await db.from("calls").select("*").eq("id", call_id).single();
  if (!c) return { skipped: "ligação não existe" };
  const accountId = c.account_id;
  const ctx = await accountContext(accountId);
  let audioUrl: string | null = null;

  if (c.pbx_call_id && c.recording_status !== "stored" && ctx.telephony.record_calls) {
    const creds = await zadarmaCreds(accountId);
    const rec = await zadarmaRecording(creds, c.pbx_call_id);
    const link = rec.link ?? rec.links?.[0];
    if (link) {
      const res = await fetch(link, { signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new Error(`gravação ${res.status}`);
      const buf = new Uint8Array(await res.arrayBuffer());
      const path = `${accountId}/${c.id}.mp3`;
      const up = await db.storage
        .from("call-recordings")
        .upload(path, buf, { contentType: "audio/mpeg", upsert: true });
      if (up.error) throw new Error(`upload: ${up.error.message}`);
      await db
        .from("calls")
        .update({ recording_path: path, recording_status: "stored" })
        .eq("id", c.id);
      audioUrl = link;
    } else {
      await db.from("calls").update({ recording_status: "failed" }).eq("id", c.id);
    }
  } else if (
    c.el_conversation_id &&
    c.recording_status !== "stored" &&
    ctx.telephony.record_calls
  ) {
    // Ligação da IA: o áudio fica na ElevenLabs; trazemos para o nosso bucket (retenção é nossa).
    const it = await getIntegration(accountId, "elevenlabs");
    const key = it?.secrets["api_key"];
    if (key) {
      const res = await fetch(
        `https://api.elevenlabs.io/v1/convai/conversations/${c.el_conversation_id}/audio`,
        { headers: { "xi-api-key": key }, signal: AbortSignal.timeout(20_000) },
      );
      if (res.ok) {
        const path = `${accountId}/${c.id}.mp3`;
        const up = await db.storage
          .from("call-recordings")
          .upload(path, new Uint8Array(await res.arrayBuffer()), {
            contentType: "audio/mpeg",
            upsert: true,
          });
        await db
          .from("calls")
          .update(
            up.error
              ? { recording_status: "failed" }
              : { recording_path: path, recording_status: "stored" },
          )
          .eq("id", c.id);
      }
    }
  } else if (c.recording_path) {
    const s = await db.storage.from("call-recordings").createSignedUrl(c.recording_path, 600);
    audioUrl = s.data?.signedUrl ?? null;
  }

  let transcript = c.transcript;
  if (!transcript && audioUrl) {
    const { transcribeUrl } = await import("@/backend/ai/transcribe.server");
    const t = await transcribeUrl(accountId, audioUrl, { diarize: true });
    if (t) {
      transcript = t.utterances.length
        ? t.utterances
            .map((u) => `${u.speaker === 0 ? "Atendente" : "Cliente"}: ${u.transcript}`)
            .join("\n")
        : t.text;
      await db
        .from("calls")
        .update({ transcript, transcript_segments: t.utterances as never })
        .eq("id", c.id);
      await db.from("usage_ledger").insert({
        account_id: accountId,
        kind: "transcription_min",
        quantity: Math.max(1, Math.ceil(t.duration / 60)),
        unit: "min",
        ref_table: "calls",
        ref_id: c.id,
      });
    }
  }
  if (!transcript) return { recording: c.recording_status, transcript: false };

  if (detectSpokenOptOut(transcript))
    await recordOptOut(
      accountId,
      c.direction === "inbound" ? c.from_number : c.to_number,
      "ligacao",
    );

  if (!c.summary) {
    try {
      const { callJson } = await import("@/backend/llm-simple.server");
      const { data } = await callJson<Summary>({
        accountId,
        purpose: "call_summary",
        system:
          "Você resume ligações comerciais em português do Brasil, de forma objetiva, para o vendedor ler em 10 segundos.",
        messages: [
          { role: "user", content: `Transcrição da ligação:\n${transcript.slice(0, 24_000)}` },
        ],
        schemaName: "resumo_ligacao",
        schema: {
          type: "object",
          properties: {
            resumo: {
              type: "string",
              description: "2 a 4 frases: motivo, o que foi dito, combinado.",
            },
            sentimento: { type: "string", enum: ["positive", "neutral", "negative"] },
            nota: {
              type: "number",
              description:
                "0 a 100: quão bem o atendente conduziu (escuta, perguntas, próximo passo).",
            },
            proximo_passo: { type: "string" },
            pediu_para_nao_ligar: { type: "boolean" },
          },
          required: ["resumo", "sentimento", "nota", "proximo_passo", "pediu_para_nao_ligar"],
        },
      });
      await db
        .from("calls")
        .update({
          summary: data.resumo,
          sentiment: data.sentimento,
          score: Math.max(0, Math.min(100, Math.round(data.nota))),
          metadata: { ...((c.metadata as object) ?? {}), next_step: data.proximo_passo },
        })
        .eq("id", c.id);
      if (data.pediu_para_nao_ligar)
        await recordOptOut(
          accountId,
          c.direction === "inbound" ? c.from_number : c.to_number,
          "ligacao_ia",
        );
      if (c.contact_id && data.proximo_passo)
        await db
          .from("contacts")
          .update({ ai_next_step: data.proximo_passo })
          .eq("id", c.contact_id);
    } catch (err) {
      console.error("[call.process] resumo falhou", err);
    }
  }
  await db.rpc("enqueue_job", {
    _account: accountId,
    _kind: "terms.alert",
    _payload: { source: "call", source_id: call_id },
    _dedupe: `terms:call:${call_id}`,
  });
  return { transcript: true };
});

// ───────────────────────── sms.send ─────────────────────────
registerJob("sms.send", async (job) => {
  const p = job.payload as unknown as JobPayloads["sms.send"];
  const accountId = job.account_id!;
  const db = admin();
  // Consentimento sempre (conferência 1, R1): com só o número no corpo, o contato sai do telefone;
  // sem contato não dá para conferir a autorização, e o SMS não sai.
  let contactId = p.contact_id ?? null;
  const byNumber = !contactId && !!p.to;
  if (byNumber) contactId = (await findContactByPhone(accountId, toE164(p.to)))?.id ?? null;
  if (!contactId) return { skipped: "sem contato: não dá para conferir a autorização de SMS" };
  const { data: c } = await db
    .from("contacts")
    .select("phone")
    .eq("id", contactId)
    .eq("account_id", accountId)
    .maybeSingle();
  if (!c) return { skipped: "contato de outra conta ou apagado" };
  const { data: ok, error: consentError } = await db.rpc("can_contact", {
    _contact: contactId,
    _channel: "sms",
  });
  if (consentError) throw new Error(`can_contact: ${consentError.message}`);
  if (ok !== true) return { skipped: "contato não autorizou SMS" };
  // o destino é SEMPRE o telefone do contato, o mesmo endereço que o consentimento conferiu
  const e164 = toE164(c.phone);
  if (!e164) return { skipped: "contato sem telefone" };
  // achado pelo número: findContactByPhone casa pelos últimos 8 dígitos e, sem casamento exato,
  // devolve o primeiro parecido. Aqui só vale o mesmo número inteiro (E.164) do pedido.
  if (byNumber && toE164(p.to) !== e164)
    return { skipped: "número não confere com o do contato: não dá para conferir a autorização" };
  const creds = await zadarmaCreds(accountId);
  const it = await getIntegration(accountId, "zadarma");
  const r = await zadarmaSms(
    creds,
    e164.replace("+", ""),
    p.text.slice(0, 600),
    it?.config["caller_id"]?.replace(/\D/g, "") || undefined,
  );
  const denied = r.denied_numbers?.[0];
  if (denied) return { skipped: `a Zadarma recusou: ${denied.message}` };
  await db.from("usage_ledger").insert({
    account_id: accountId,
    kind: "sms",
    quantity: 1,
    unit: "un",
    ref_table: "contacts",
    ref_id: contactId,
  });
  return { sent: true };
});

// ───────────────────────── campanhas de voz (a cada minuto) ─────────────────────────
registerPeriodic("voice.campaigns", async () => {
  const db = admin();
  const { data: campaigns } = await db
    .from("voice_campaigns")
    .select("*")
    .eq("status", "running")
    .eq("use_batch", false)
    .limit(20);
  const now = new Date();
  for (const c of campaigns ?? []) {
    if (!c.voice_agent_id) continue;
    // ligações "calling" há mais de 30 min voltam para a fila
    await db
      .from("voice_campaign_targets")
      .update({ status: "pending", result: "sem retorno da operadora" })
      .eq("campaign_id", c.id)
      .eq("status", "calling")
      .lt("last_attempt_at", new Date(now.getTime() - 30 * 60_000).toISOString());
    if (
      !inWindow(
        now,
        c.timezone,
        String(c.window_start).slice(0, 5),
        String(c.window_end).slice(0, 5),
        c.days,
      )
    )
      continue;
    const { count: busy } = await db
      .from("voice_campaign_targets")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", c.id)
      .eq("status", "calling");
    const free = c.max_concurrency - (busy ?? 0);
    if (free > 0) {
      const { data: due } = await db
        .from("voice_campaign_targets")
        .select("id, contact_id, attempts")
        .eq("campaign_id", c.id)
        .eq("status", "pending")
        .lte("next_attempt_at", now.toISOString())
        .order("next_attempt_at")
        .limit(free);
      for (const t of due ?? []) {
        if (t.attempts >= c.max_attempts) {
          await db
            .from("voice_campaign_targets")
            .update({ status: "failed", result: "tentativas esgotadas" })
            .eq("id", t.id);
          continue;
        }
        await db
          .from("voice_campaign_targets")
          .update({
            status: "calling",
            attempts: t.attempts + 1,
            last_attempt_at: now.toISOString(),
            next_attempt_at: new Date(now.getTime() + c.retry_minutes * 60_000).toISOString(),
          })
          .eq("id", t.id);
        await db.rpc("enqueue_job", {
          _account: c.account_id,
          _kind: "voice.call",
          _payload: {
            contact_id: t.contact_id,
            voice_agent_id: c.voice_agent_id,
            campaign_id: c.id,
            target_id: t.id,
            context: c.context,
          },
          _dedupe: `voice.call:${t.id}:${t.attempts + 1}`,
        });
      }
    }
    const { count: open } = await db
      .from("voice_campaign_targets")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", c.id)
      .in("status", ["pending", "calling"]);
    if ((open ?? 0) === 0)
      await db.from("voice_campaigns").update({ status: "completed" }).eq("id", c.id);
  }
});

// ───────────────────────── saldo da Zadarma: vigiado, não só registrado ─────────────────────────
// Lê o saldo no máximo de hora em hora e avisa os gestores quando cabe menos ligações que o limiar.
registerPeriodic("telephony.balance", async () => {
  const db = admin();
  const { data: rows } = await db
    .from("account_integrations")
    .select("account_id")
    .eq("provider", "zadarma")
    .eq("status", "connected")
    .limit(50);
  for (const r of rows ?? []) {
    const ctx = await accountContext(r.account_id);
    const t = ctx.settings["telephony"] as
      { last_balance_check_at?: string; last_balance_alert_at?: string } | undefined;
    if (
      t?.last_balance_check_at &&
      Date.now() - new Date(t.last_balance_check_at).getTime() < 3_600_000
    )
      continue;
    let balance: number | null = null;
    try {
      balance = Number((await zadarmaBalance(await zadarmaCreds(r.account_id))).balance);
    } catch (err) {
      console.error("[telephony.balance]", err);
    }
    const left = balance === null ? null : callsLeft(balance, ctx.telephony.avg_call_cost_usd);
    const shouldAlert =
      left !== null &&
      left < ctx.telephony.balance_threshold_calls &&
      (!t?.last_balance_alert_at ||
        Date.now() - new Date(t.last_balance_alert_at).getTime() > 12 * 3_600_000);
    const telephony = {
      ...ctx.telephony,
      ...(t ?? {}),
      last_balance_check_at: new Date().toISOString(),
      last_balance_usd: balance,
      last_calls_left: left,
      ...(shouldAlert ? { last_balance_alert_at: new Date().toISOString() } : {}),
    };
    await db
      .from("accounts")
      .update({ settings: { ...ctx.settings, telephony } as never })
      .eq("id", r.account_id);
    if (shouldAlert) {
      const { data: managers } = await db
        .from("memberships")
        .select("user_id")
        .eq("account_id", r.account_id)
        .eq("is_active", true)
        .in("role", ["owner", "admin", "manager"]);
      for (const m of managers ?? []) {
        await db.rpc("notify_user", {
          _account: r.account_id,
          _user: m.user_id,
          _kind: "telephony_balance",
          _title: `Saldo da Zadarma dá para ~${left} ligações`,
          _body: `Saldo US$ ${balance?.toFixed(2)}. Recarregue antes que as ligações e a IA de voz parem.`,
          _link: "/ajustes?aba=telefonia",
        });
      }
    }
  }
});

// Referenciado em handlers.server.ts para o módulo não ser descartado no build.
export const registered = true;
