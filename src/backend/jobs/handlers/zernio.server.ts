// Jobs da Zernio: trazer gravação e transcrição da ligação para o nosso banco (e resumir pela
// rotina de sempre, call.process) e vigiar a saúde dos números de saída.
import { admin, allowOnce } from "@/backend/http.server";
import { publicFetch } from "@/backend/net-guard.server";
import { zernioKey } from "@/backend/providers/zernio-client.server";
import { getCall, recordingUrl } from "@/backend/providers/zernio-voice.server";
import { numberHealth } from "@/backend/providers/zernio-voice-actions.server";
import {
  accountOfDedupe,
  isStuck,
  RETRY_MAX_AGE_MS,
  RETRY_MIN_AGE_MS,
} from "@/backend/providers/zernio-retry";

import { registerJob, registerPeriodic } from "../registry.server";

const MAX_RECORDING_BYTES = 60 * 1024 * 1024;

registerJob("zernio.call_sync", async (job) => {
  const p = job.payload as { call_id?: string; zernio_call_id?: string };
  if (!job.account_id || !p.call_id || !p.zernio_call_id) throw new Error("payload incompleto");
  const db = admin();
  const key = await zernioKey(job.account_id);
  if (!key) return { skipped: "sem chave da Zernio" };
  const record = await getCall(key, p.zernio_call_id);
  if (!record) return { skipped: "ligação não encontrada na Zernio" };

  const transcript =
    (record.transcript ?? [])
      .map((s) => s.text)
      .filter(Boolean)
      .join("\n") || null;
  const patch: Record<string, unknown> = {};
  if (transcript) {
    patch["transcript"] = transcript;
    patch["transcript_segments"] = record.transcript;
  }
  if (record.recordingEnabled) {
    const url = await recordingUrl(key, p.zernio_call_id);
    if (!url) {
      // A gravação chega pouco depois do fim: tenta de novo (o runner reprograma com espera).
      if ((job.attempts ?? 0) < 4) throw new Error("gravação ainda não disponível");
      patch["recording_status"] = "failed";
    } else {
      // URL da gravação vem da Zernio: só https público, cada redirecionamento conferido (R8)
      const res = await publicFetch(
        url,
        { signal: AbortSignal.timeout(30_000) },
        { httpsOnly: true, maxRedirects: 3 },
      );
      if (!res.ok) throw new Error(`gravação ${res.status}`);
      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.byteLength <= MAX_RECORDING_BYTES) {
        const path = `${job.account_id}/${p.call_id}.mp3`;
        const up = await db.storage
          .from("call-recordings")
          .upload(path, buf, { contentType: "audio/mpeg", upsert: true });
        patch["recording_path"] = up.error ? null : path;
        patch["recording_status"] = up.error ? "failed" : "stored";
      }
    }
  }
  if (Object.keys(patch).length)
    await db
      .from("calls")
      .update(patch as never)
      .eq("id", p.call_id);
  await db
    .from("zernio_calls")
    .update({ synced_at: new Date().toISOString() })
    .eq("account_id", job.account_id)
    .eq("zernio_call_id", p.zernio_call_id);
  // Resumo, nota, opt-out falado e termos: a mesma rotina das outras ligações.
  if (transcript || patch["recording_status"] === "stored")
    await db.rpc("enqueue_job", {
      _account: job.account_id,
      _kind: "call.process",
      _payload: { call_id: p.call_id },
      _dedupe: `call.process:${p.call_id}`,
    });
  return { transcript: Boolean(transcript), recording: patch["recording_status"] ?? "none" };
});

// A cada 15 min: número de saída perto de queimar avisa os gestores (no máximo 1 aviso a cada 6 h).
registerPeriodic("zernio.number_health", async () => {
  if (new Date().getUTCMinutes() % 15 !== 0) return;
  const db = admin();
  const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const { data: active } = await db
    .from("calls")
    .select("account_id")
    .eq("direction", "outbound")
    .gte("started_at", since)
    .limit(1000);
  const accounts = [...new Set((active ?? []).map((r) => r.account_id))].slice(0, 100);
  for (const accountId of accounts) {
    const rows = await numberHealth(accountId, 24).catch(() => []);
    for (const r of rows.filter((x) => x.verdict.level === "risk")) {
      if (!(await allowOnce(`zernio:health:${accountId}:${r.number}`, 1, 6 * 3600))) continue;
      const { data: managers } = await db
        .from("memberships")
        .select("user_id")
        .eq("account_id", accountId)
        .eq("is_active", true)
        .in("role", ["owner", "admin", "manager"]);
      for (const m of (managers ?? []).slice(0, 10))
        await db.rpc("notify_user", {
          _account: accountId,
          _user: m.user_id,
          _kind: "number_health",
          _title: `Número ${r.number} pode ser bloqueado`,
          _body: r.verdict.reasons.join(". "),
          _link: "/canais?aba=numeros",
        });
    }
  }
});

export const registered = true;

// Aviso da Zernio parado em "received" (a requisição foi cortada antes de terminar): processa de
// novo, no máximo 20 por minuto. Sem isto, a mensagem do cliente sumia da Caixa para sempre.
registerPeriodic("zernio.events_retry", async () => {
  const db = admin();
  const now = Date.now();
  const { data: stuck } = await db
    .from("inbound_events")
    .select("id, event_type, external_id, payload, created_at")
    .eq("provider", "zernio")
    .eq("status", "received")
    .lte("created_at", new Date(now - RETRY_MIN_AGE_MS).toISOString())
    .gte("created_at", new Date(now - RETRY_MAX_AGE_MS).toISOString())
    .order("created_at", { ascending: true })
    .limit(20);
  if (!stuck?.length) return;
  const { processEvent } = await import("@/backend/providers/zernio-webhook.server");
  const { markEvent } = await import("@/backend/providers/zernio-ingest.server");
  for (const e of stuck) {
    if (!isStuck(e.created_at, now)) continue;
    const accountId = accountOfDedupe(e.external_id);
    if (!accountId) {
      await markEvent(e.id, "ignored", "sem conta na chave do aviso");
      continue;
    }
    try {
      const result = await processEvent(accountId, e.event_type ?? "unknown", e.payload as never);
      await markEvent(e.id, result);
    } catch (err) {
      await markEvent(
        e.id,
        "error",
        String(err instanceof Error ? err.message : err).slice(0, 500),
      );
    }
  }
});

// Aviso da Zernio enfileirado pelo webhook: processa fora da requisição (resposta rápida à Zernio).
registerJob("zernio.event", async (job) => {
  const p = job.payload as { event_id?: number };
  if (!p.event_id || !job.account_id) return { skipped: "sem aviso" };
  const db = admin();
  const { data: e } = await db
    .from("inbound_events")
    .select("id, event_type, payload, status")
    .eq("id", p.event_id)
    .maybeSingle();
  if (!e) return { skipped: "aviso não encontrado" };
  if (e.status !== "received") return { skipped: `já ${e.status}` };
  const { processEvent } = await import("@/backend/providers/zernio-webhook.server");
  const { markEvent } = await import("@/backend/providers/zernio-ingest.server");
  try {
    const result = await processEvent(
      job.account_id,
      e.event_type ?? "unknown",
      e.payload as never,
    );
    await markEvent(e.id, result);
    return { result };
  } catch (err) {
    await markEvent(e.id, "error", String(err instanceof Error ? err.message : err).slice(0, 500));
    throw err;
  }
});
