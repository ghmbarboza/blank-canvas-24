import { createFileRoute } from "@tanstack/react-router";

// Webhook do LiveKit (assinado com o API secret da conta dona da sala): status da reunião,
// presença dos participantes, início da gravação e ata ao encerrar.
export const Route = createFileRoute("/api/public/livekit")({
  server: {
    handlers: {
      POST: async (ctx) => {
        const h = await import("@/backend/http.server");
        const m = await import("@/backend/meetings.server");
        const lk = await import("@/backend/providers/livekit.server");
        return h.handle(async (req) => {
          // Sem assinatura, 401 antes de ler qualquer coisa; sala desconhecida responde igual a
          // assinatura inválida (não vira oráculo de nome de sala) (S8).
          const auth = req.headers.get("authorization");
          const unsigned = () =>
            new h.HttpError(401, "Assinatura do LiveKit inválida", "bad_signature");
          if (!auth) throw unsigned();
          const raw = await req.text();
          let ev: {
            event?: string;
            room?: { name?: string };
            participant?: { identity?: string; name?: string };
            egressInfo?: {
              egressId?: string;
              roomName?: string;
              fileResults?: { location?: string; filename?: string }[];
              file?: { location?: string };
            };
          };
          try {
            ev = JSON.parse(raw);
          } catch {
            throw new h.HttpError(400, "JSON inválido", "bad_json");
          }
          const roomName = ev.room?.name ?? ev.egressInfo?.roomName;
          if (!roomName || !/^nx-[a-f0-9]{20}$/.test(roomName)) throw unsigned();
          const db = h.admin();
          const { data: meeting } = await db
            .from("meetings")
            .select("*")
            .eq("room_name", roomName)
            .maybeSingle();
          if (!meeting) throw unsigned();
          const creds = await m.livekitCreds(meeting.account_id);
          if (!creds || !lk.verifyLivekitWebhook(creds, auth, raw)) throw unsigned();
          const now = new Date().toISOString();

          switch (ev.event) {
            case "room_started": {
              if (meeting.status === "scheduled")
                await db
                  .from("meetings")
                  .update({ status: "live", started_at: meeting.started_at ?? now })
                  .eq("id", meeting.id);
              const { data: integ } = await db
                .from("account_integrations")
                .select("config")
                .eq("account_id", meeting.account_id)
                .eq("provider", "livekit")
                .maybeSingle();
              const mode = ((integ?.config ?? {}) as Record<string, string>)["record"] ?? "audio";
              if (meeting.record && mode !== "off" && !meeting.egress_id) {
                try {
                  const r = await lk.startRoomEgress(
                    creds,
                    roomName,
                    `nexus/${meeting.account_id}/${meeting.id}-{time}`,
                    mode === "video" ? "video" : "audio",
                    null,
                  );
                  await db.from("meetings").update({ egress_id: r.egress_id }).eq("id", meeting.id);
                } catch (err) {
                  console.error("[livekit] gravação não iniciou", err);
                }
              }
              break;
            }
            case "participant_joined":
              if (ev.participant?.identity)
                await db
                  .from("meeting_participants")
                  .update({ joined_at: now, left_at: null })
                  .eq("meeting_id", meeting.id)
                  .eq("identity", ev.participant.identity);
              if (meeting.status === "scheduled")
                await db
                  .from("meetings")
                  .update({ status: "live", started_at: now })
                  .eq("id", meeting.id);
              break;
            case "participant_left":
              if (ev.participant?.identity)
                await db
                  .from("meeting_participants")
                  .update({ left_at: now })
                  .eq("meeting_id", meeting.id)
                  .eq("identity", ev.participant.identity);
              break;
            case "room_finished": {
              const { count } = await db
                .from("meeting_participants")
                .select("id", { count: "exact", head: true })
                .eq("meeting_id", meeting.id)
                .eq("kind", "contact")
                .not("joined_at", "is", null);
              const noShow = meeting.contact_id && (count ?? 0) === 0;
              await db
                .from("meetings")
                .update({ status: noShow ? "no_show" : "ended", ended_at: now })
                .eq("id", meeting.id);
              if (meeting.event_id)
                await db
                  .from("events")
                  .update({ status: noShow ? "no_show" : "done" })
                  .eq("id", meeting.event_id);
              await db.rpc("emit_event", {
                _account: meeting.account_id,
                _type: noShow ? "meeting.no_show" : "meeting.ended",
                _entity: "meeting",
                _entity_id: meeting.id,
                _payload: { contact_id: meeting.contact_id, deal_id: meeting.deal_id },
              });
              // não compareceu: o contato recebe o link para escolher outro horário
              if (noShow)
                await db.rpc("enqueue_job", {
                  _account: meeting.account_id,
                  _kind: "meeting.no_show",
                  _payload: { meeting_id: meeting.id },
                  _run_at: new Date(Date.now() + 2 * 60_000).toISOString(),
                  _dedupe: `meeting.no_show:${meeting.id}:${meeting.scheduled_start}`,
                });
              if (!noShow)
                await db.rpc("enqueue_job", {
                  _account: meeting.account_id,
                  _kind: "meeting.minutes",
                  _payload: { meeting_id: meeting.id },
                  _run_at: new Date(Date.now() + 30_000).toISOString(),
                  _dedupe: `meeting.minutes:${meeting.id}`,
                });
              break;
            }
            case "egress_ended": {
              const loc =
                ev.egressInfo?.fileResults?.[0]?.location ?? ev.egressInfo?.file?.location ?? null;
              if (loc)
                await db.from("meetings").update({ recording_url: loc }).eq("id", meeting.id);
              break;
            }
            default:
              break;
          }
          return h.json({ ok: true });
        })(ctx);
      },
    },
  },
});
