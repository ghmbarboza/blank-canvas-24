import { createFileRoute } from "@tanstack/react-router";

// Porta do worker do livecoach (x-agent-secret): contexto da sala, trechos transcritos e dicas.
const RECORDINGS_BUCKET = "meeting-recordings";

async function recordMode(
  db: ReturnType<typeof import("@/backend/http.server").admin>,
  accountId: string,
): Promise<string> {
  const { data } = await db
    .from("account_integrations")
    .select("config")
    .eq("account_id", accountId)
    .eq("provider", "livekit")
    .maybeSingle();
  return ((data?.config ?? {}) as Record<string, string>)["record"] ?? "audio";
}

export const Route = createFileRoute("/api/agent/meeting")({
  server: {
    handlers: {
      POST: async (ctx) => {
        const h = await import("@/backend/http.server");
        const m = await import("@/backend/meetings.server");
        return h.handle(async (req) => {
          await m.requireAgent(req);
          const body = await h.readJson<{
            action?:
              | "context"
              | "transcript"
              | "tips"
              | "coach"
              | "heartbeat"
              | "recording_upload"
              | "recording_done";
            path?: string;
            seconds?: number;
            ext?: string;
            instance?: string;
            meta?: Record<string, unknown>;
            recent?: { speaker?: string; text?: string }[];
            covered?: string[];
            room?: string;
            segments?: {
              identity?: string;
              name?: string;
              is_seller?: boolean;
              text?: string;
              start_ms?: number;
              end_ms?: number;
            }[];
            tips?: {
              kind?: string;
              title?: string;
              body?: string;
              playbook_item?: string;
              source?: string;
            }[];
          }>(req);
          // Sinal de vida do worker (a cada 60 s): não é de sala nenhuma, vem antes da checagem da sala.
          if (body.action === "heartbeat") {
            const hb = await import("@/features/health/heartbeats");
            const { error } = await h.admin().rpc("record_heartbeat", {
              _service: hb.SERVICES.LIVECOACH_WORKER,
              _instance: hb.cleanInstance(body.instance),
              _meta: hb.cleanMeta(body.meta),
            });
            if (error) throw new h.HttpError(500, error.message, "heartbeat");
            return h.json({ ok: true });
          }
          if (!body.room || !/^nx-[a-f0-9]{20}$/.test(body.room))
            throw new h.HttpError(400, "Sala inválida", "bad_room");
          const meeting = await m.meetingByRoom(body.room);
          const db = h.admin();

          if (body.action === "context") {
            const playbook = await m.loadPlaybook(meeting.playbook_id);
            const [contact, deal, host, products] = await Promise.all([
              meeting.contact_id
                ? db
                    .from("contacts")
                    .select("name, company, ai_summary, ai_intent")
                    .eq("id", meeting.contact_id)
                    .maybeSingle()
                : Promise.resolve({ data: null }),
              meeting.deal_id
                ? db
                    .from("deals")
                    .select("title, value, status")
                    .eq("id", meeting.deal_id)
                    .maybeSingle()
                : Promise.resolve({ data: null }),
              meeting.host_user_id
                ? db
                    .from("profiles")
                    .select("full_name")
                    .eq("id", meeting.host_user_id)
                    .maybeSingle()
                : Promise.resolve({ data: null }),
              db
                .from("products")
                .select("name, price, billing")
                .eq("account_id", meeting.account_id)
                .eq("active", true)
                .limit(40),
            ]);
            return h.json({
              meeting: {
                id: meeting.id,
                account_id: meeting.account_id,
                title: meeting.title,
                status: meeting.status,
              },
              // o worker grava quando a reunião pede e a conta não desligou a gravação no LiveKit;
              // "video" faz o vídeo composto (grade das câmeras) com o áudio misturado
              ...(await (async () => {
                const mode = meeting.record ? await recordMode(db, meeting.account_id) : "off";
                return {
                  record: mode !== "off",
                  record_mode: mode === "video" ? "video" : mode === "off" ? "off" : "audio",
                };
              })()),
              seller_identity: meeting.host_user_id ? `user-${meeting.host_user_id}` : null,
              seller_name: host.data?.full_name ?? null,
              playbook,
              contact: contact.data,
              deal: deal.data,
              catalog: products.data ?? [],
            });
          }

          if (body.action === "recording_upload") {
            const ext = body.ext === "mp4" ? "mp4" : "ogg";
            const path = `${meeting.account_id}/${meeting.id}-${Date.now()}.${ext}`;
            const { data, error } = await db.storage
              .from(RECORDINGS_BUCKET)
              .createSignedUploadUrl(path);
            if (error || !data) throw new h.HttpError(500, "Upload indisponível", "upload");
            return h.json({ path, url: data.signedUrl });
          }

          if (body.action === "recording_done") {
            const path = String(body.path ?? "");
            if (!path.startsWith(`${meeting.account_id}/${meeting.id}-`) || path.includes(".."))
              throw new h.HttpError(400, "Arquivo inválido", "bad_path");
            await db
              .from("meetings")
              .update({ recording_url: `storage://${RECORDINGS_BUCKET}/${path}` })
              .eq("id", meeting.id);
            return h.json({ ok: true });
          }

          if (body.action === "transcript") {
            const rows = (body.segments ?? [])
              .filter((s) => typeof s.text === "string" && s.text.trim())
              .slice(0, 50)
              .map((s) => ({
                account_id: meeting.account_id,
                meeting_id: meeting.id,
                participant_identity: s.identity?.slice(0, 120) ?? null,
                speaker_label: s.name?.slice(0, 120) ?? null,
                is_seller: Boolean(s.is_seller),
                text: s.text!.trim().slice(0, 4000),
                start_ms: Number.isFinite(s.start_ms) ? Math.round(s.start_ms!) : null,
                end_ms: Number.isFinite(s.end_ms) ? Math.round(s.end_ms!) : null,
              }));
            if (rows.length) {
              const { error } = await db.from("meeting_transcripts").insert(rows);
              if (error) throw new h.HttpError(500, error.message, "insert");
            }
            return h.json({ ok: true, saved: rows.length });
          }

          if (body.action === "tips") {
            const KINDS = [
              "checklist",
              "objection",
              "battlecard",
              "closing",
              "compliance",
              "pace",
              "question",
            ];
            const rows = (body.tips ?? [])
              .filter((t) => t.title && KINDS.includes(String(t.kind)))
              .slice(0, 10)
              .map((t) => ({
                account_id: meeting.account_id,
                meeting_id: meeting.id,
                kind: String(t.kind),
                title: String(t.title).slice(0, 200),
                body: t.body ? String(t.body).slice(0, 2000) : null,
                playbook_item: t.playbook_item ? String(t.playbook_item).slice(0, 80) : null,
                source: t.source === "llm" ? "llm" : "keyword",
              }));
            if (rows.length) await db.from("coach_tips").insert(rows);
            return h.json({ ok: true, saved: rows.length });
          }
          if (body.action === "coach") {
            // Camada LLM do coach pelo provedor da conta (ou gateway): o worker não guarda chave de IA.
            await h.rateLimit(`coach:${meeting.id}`, 12, 60, "Coach chamado rápido demais");
            const recent = (body.recent ?? [])
              .filter((r) => typeof r.text === "string" && r.text.trim())
              .slice(-12)
              .map((r) => ({
                speaker: r.speaker === "vendedor" ? ("vendedor" as const) : ("cliente" as const),
                text: r.text!.trim().slice(0, 600),
              }));
            if (!recent.length) return h.json({ tips: [] });
            const { tips } = await import("@/backend/coach.server");
            return h.json({ tips: await tips(meeting, recent, body.covered ?? []) });
          }
          throw new h.HttpError(400, "Ação inválida", "bad_action");
        })(ctx);
      },
    },
  },
});
