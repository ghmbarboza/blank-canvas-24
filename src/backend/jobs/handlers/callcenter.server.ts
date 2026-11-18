// Call center: pós-atendimento pela IA (resumo, tabulação e próxima ação; o atendente só
// confirma) e a limpeza periódica da fila (reserva vencida volta, pós-atendimento esquecido fecha).
import { admin } from "@/backend/http.server";
import { callJson } from "@/backend/llm.server";
import { WRAP_RESULTS, maskSensitive } from "@/features/queue/lib";

import { registerJob, registerPeriodic } from "../registry.server";

interface WrapOut {
  resumo: string;
  motivo: string;
  resultado: (typeof WRAP_RESULTS)[number];
  proxima_acao: string;
  prazo_dias: number;
}

const MAX_CONTEXT = 12_000;

async function contextFor(w: {
  account_id: string;
  source_table: string;
  source_id: string | null;
  subject: string | null;
  summary: string | null;
  metadata: unknown;
}): Promise<{ text: string; waitTranscript: boolean }> {
  const db = admin();
  const parts: string[] = [];
  if (w.subject) parts.push(`Assunto: ${w.subject}`);
  if (w.summary) parts.push(`Resumo anterior: ${w.summary}`);
  let waitTranscript = false;
  const callId =
    w.source_table === "calls"
      ? w.source_id
      : ((w.metadata as { call_id?: string } | null)?.call_id ?? null);
  if (callId) {
    const { data: c } = await db
      .from("calls")
      .select("transcript, summary, recording_status, disposition_reason, duration_seconds")
      .eq("id", callId)
      .maybeSingle();
    if (c) {
      if (c.summary) parts.push(`Resumo da ligação: ${c.summary}`);
      if (c.transcript) parts.push(`Transcrição:\n${c.transcript}`);
      else if (c.recording_status === "pending") waitTranscript = true;
      if (c.disposition_reason) parts.push(`Situação: ${c.disposition_reason}`);
    }
  }
  if (w.source_table === "conversations" && w.source_id) {
    const { data: msgs } = await db
      .from("messages")
      .select("direction, sender_type, body, transcript, is_private, created_at")
      .eq("conversation_id", w.source_id)
      .order("created_at", { ascending: false })
      .limit(40);
    const lines = (msgs ?? [])
      .reverse()
      .filter((m) => m.body || m.transcript)
      .map((m) => {
        const who = m.is_private
          ? "Nota interna"
          : m.direction === "in"
            ? "Cliente"
            : m.sender_type === "ai"
              ? "IA"
              : "Atendente";
        return `${who}: ${m.transcript ?? m.body}`;
      });
    if (lines.length) parts.push(`Conversa:\n${lines.join("\n")}`);
  }
  if (w.source_table === "tickets" && w.source_id) {
    const { data: t } = await db
      .from("tickets")
      .select("subject, description, status, priority")
      .eq("id", w.source_id)
      .maybeSingle();
    if (t) parts.push(`Chamado (${t.priority}, ${t.status}): ${t.subject}\n${t.description ?? ""}`);
    const { data: ev } = await db
      .from("ticket_events")
      .select("kind, body")
      .eq("ticket_id", w.source_id)
      .order("created_at", { ascending: false })
      .limit(20);
    const lines = (ev ?? []).filter((e) => e.body).map((e) => `${e.kind}: ${e.body}`);
    if (lines.length) parts.push(`Histórico do chamado:\n${lines.reverse().join("\n")}`);
  }
  return { text: maskSensitive(parts.join("\n\n")).slice(-MAX_CONTEXT), waitTranscript };
}

registerJob("workitem.wrapup", async (job) => {
  const p = job.payload as { work_item_id?: string; force?: boolean };
  if (!p.work_item_id) return { skipped: "sem item" };
  const db = admin();
  const { data: w } = await db
    .from("work_items")
    .select("*")
    .eq("id", p.work_item_id)
    .maybeSingle();
  if (!w) return { skipped: "item não existe" };
  if (w.status !== "wrap_up") return { skipped: `item em ${w.status}` };
  if (!p.force && (w.wrap as { summary?: string } | null)?.summary)
    return { skipped: "já preenchido" };

  const ctx = await contextFor(w);
  // Ligação ainda sem transcrição: espera o call.process (até 3 novas tentativas do job).
  if (ctx.waitTranscript && (job.attempts ?? 0) < 3)
    throw new Error("aguardando a transcrição da ligação");
  if (ctx.text.length < 40) {
    await db
      .from("work_items")
      .update({
        wrap: {
          summary: w.subject ?? "Atendimento sem conteúdo registrado",
          reason: "",
          result: "",
          next_action: "",
          source: "vazio",
        },
      })
      .eq("id", w.id);
    return { filled: false, reason: "sem conteúdo" };
  }
  const { data, model } = await callJson<WrapOut>(w.account_id, "workitem.wrapup", {
    system:
      "Você preenche o pós-atendimento de um call center brasileiro. Leia o atendimento e devolva: um resumo em 2 a 4 frases (o que o cliente queria e o que foi feito), o motivo do contato em até 6 palavras, o resultado (uma das opções) e a próxima ação concreta (quem faz o quê), ou vazio se nada ficou pendente. Use só o que está no texto. Não invente valores, prazos nem promessas. Português do Brasil, direto.",
    messages: [{ role: "user", content: ctx.text }],
    schemaName: "pos_atendimento",
    schema: {
      type: "object",
      properties: {
        resumo: { type: "string" },
        motivo: { type: "string" },
        resultado: { type: "string", enum: [...WRAP_RESULTS] },
        proxima_acao: { type: "string" },
        prazo_dias: { type: "integer", minimum: 0, maximum: 30 },
      },
      required: ["resumo", "motivo", "resultado", "proxima_acao", "prazo_dias"],
    },
    maxTokens: 600,
  });
  const result = WRAP_RESULTS.includes(data.resultado) ? data.resultado : "";
  await db
    .from("work_items")
    .update({
      wrap: {
        summary: String(data.resumo ?? "").slice(0, 1500),
        reason: String(data.motivo ?? "").slice(0, 120),
        result,
        next_action: String(data.proxima_acao ?? "").slice(0, 300),
        next_due_days: Number.isInteger(data.prazo_dias) ? data.prazo_dias : 1,
        model,
        at: new Date().toISOString(),
      },
    })
    .eq("id", w.id);
  return { filled: true, model };
});

registerPeriodic("callcenter.housekeeping", async () => {
  await admin().rpc("cc_housekeeping");
});

// Referenciado em handlers.server.ts para o módulo não ser descartado no build.
export const registered = true;
