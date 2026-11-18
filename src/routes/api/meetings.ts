import { createFileRoute } from "@tanstack/react-router";

// Reuniões para membros logados: criar sala, entrar (token LiveKit), admitir da sala de espera,
// reenviar convite, gerar link do convidado, cancelar e encerrar.
export const Route = createFileRoute("/api/meetings")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/backend/http.server")).preflight(),
      POST: async (ctx) => {
        const h = await import("@/backend/http.server");
        const m = await import("@/backend/meetings.server");
        const lk = await import("@/backend/providers/livekit.server");
        return h.handle(async (req) => {
          const body = await h.readJson<{
            accountId?: string;
            action?: string;
            meetingId?: string;
            title?: string;
            contactId?: string | null;
            dealId?: string | null;
            eventId?: string | null;
            start?: string | null;
            durationMin?: number;
            sendInvite?: boolean;
            identity?: string;
            allow?: boolean;
            requireAdmit?: boolean;
          }>(req);
          const caller = await h.requireMember(req, body.accountId, "member");
          const db = h.admin();

          if (body.action === "create") {
            const start = body.start ? new Date(body.start) : new Date();
            if (Number.isNaN(start.getTime()))
              throw new h.HttpError(400, "Data inválida", "bad_start");
            const dur = Math.min(240, Math.max(10, Number(body.durationMin ?? 30)));
            for (const [table, id] of [
              ["contacts", body.contactId],
              ["deals", body.dealId],
              ["events", body.eventId],
            ] as const) {
              if (!id) continue;
              if (!h.isUuid(id)) throw new h.HttpError(400, "Identificador inválido", "bad_id");
              const { data } = await db
                .from(table)
                .select("id")
                .eq("id", id)
                .eq("account_id", caller.accountId)
                .maybeSingle();
              if (!data)
                throw new h.HttpError(404, "Registro não encontrado nesta conta", "not_found");
            }
            let title = body.title?.trim();
            if (!title && body.contactId) {
              const { data: c } = await db
                .from("contacts")
                .select("name")
                .eq("id", body.contactId)
                .maybeSingle();
              title = `Reunião com ${c?.name ?? "contato"}`;
            }
            const { meeting, guestToken } = await m.createMeeting({
              accountId: caller.accountId,
              title: title || "Reunião",
              hostUserId: caller.userId,
              contactId: body.contactId ?? null,
              dealId: body.dealId ?? null,
              eventId: body.eventId ?? null,
              start,
              end: new Date(start.getTime() + dur * 60_000),
              createdBy: caller.userId,
              requireAdmit: Boolean(body.requireAdmit),
            });
            if (body.sendInvite && body.contactId)
              await m.enqueueInviteAndReminders(caller.accountId, meeting.id, start);
            return h.json({
              meeting,
              hostUrl: `/sala/${meeting.id}`,
              guestUrl: guestToken ? m.meetingUrl(meeting.id, guestToken) : null,
            });
          }

          if (!h.isUuid(body.meetingId))
            throw new h.HttpError(400, "Reunião inválida", "bad_meeting");
          const { data: meeting } = await db
            .from("meetings")
            .select("*")
            .eq("id", body.meetingId)
            .eq("account_id", caller.accountId)
            .maybeSingle();
          if (!meeting) throw new h.HttpError(404, "Reunião não encontrada", "not_found");
          const isHost = meeting.host_user_id === caller.userId;
          const canManage = isHost || ["owner", "admin", "manager"].includes(caller.role);
          if (caller.role === "seller" && meeting.host_user_id && !isHost)
            throw new h.HttpError(403, "Reunião de outro vendedor", "forbidden");

          if (body.action === "token") {
            if (meeting.status === "canceled")
              throw new h.HttpError(410, "Esta reunião foi cancelada", "canceled");
            const creds = await m.requireLivekit(caller.accountId);
            const { data: prof } = await db
              .from("profiles")
              .select("full_name")
              .eq("id", caller.userId)
              .maybeSingle();
            const name = prof?.full_name || caller.email?.split("@")[0] || "Equipe";
            const identity = `user-${caller.userId}`;
            await db.from("meeting_participants").upsert(
              {
                account_id: caller.accountId,
                meeting_id: meeting.id,
                kind: isHost ? "host" : "member",
                user_id: caller.userId,
                name,
                email: caller.email,
                identity,
              },
              { onConflict: "meeting_id,identity" },
            );
            const token = lk.livekitToken(creds, {
              identity,
              name,
              ttlSeconds: 6 * 3600,
              metadata: JSON.stringify({
                role: isHost ? "host" : "member",
                seller: true,
                meetingId: meeting.id,
              }),
              attributes: { role: isHost ? "host" : "member", seller: "true" },
              video: {
                room: meeting.room_name,
                roomJoin: true,
                canPublish: true,
                canSubscribe: true,
                canPublishData: true,
              },
            });
            return h.json({
              token,
              url: creds.url,
              identity,
              room: meeting.room_name,
              isHost,
              meeting,
            });
          }

          if (body.action === "admit") {
            if (!canManage)
              throw new h.HttpError(403, "Só quem conduz a reunião admite convidados", "forbidden");
            if (!body.identity || !/^[a-z0-9-]{3,80}$/i.test(body.identity))
              throw new h.HttpError(400, "Participante inválido", "bad_identity");
            const creds = await m.requireLivekit(caller.accountId);
            const allow = body.allow !== false;
            if (allow)
              await lk.updateParticipantPermission(creds, meeting.room_name, body.identity, true);
            else await lk.removeParticipant(creds, meeting.room_name, body.identity);
            await db
              .from("meeting_participants")
              .update({ admitted: allow })
              .eq("meeting_id", meeting.id)
              .eq("identity", body.identity);
            return h.json({ ok: true });
          }

          if (body.action === "guest_link") {
            if (!meeting.contact_id)
              throw new h.HttpError(
                422,
                "Vincule um contato à reunião para gerar o convite",
                "no_contact",
              );
            const raw = await m.issueContactToken(caller.accountId, meeting.id, meeting.contact_id);
            return h.json({ url: m.meetingUrl(meeting.id, raw) });
          }

          if (body.action === "invite") {
            if (!meeting.contact_id)
              throw new h.HttpError(422, "Vincule um contato para enviar o convite", "no_contact");
            await db.rpc("enqueue_job", {
              _account: caller.accountId,
              _kind: "meeting.invite",
              _payload: { meeting_id: meeting.id },
              _dedupe: `meeting.invite:${meeting.id}:${Date.now()}`,
            });
            return h.json({ ok: true });
          }

          if (body.action === "cancel" || body.action === "end") {
            if (!canManage) throw new h.HttpError(403, "Sem permissão", "forbidden");
            const status = body.action === "cancel" ? "canceled" : "ended";
            await db
              .from("meetings")
              .update({
                status,
                ...(status === "ended" ? { ended_at: new Date().toISOString() } : {}),
                ...(status === "canceled" ? { canceled_by: "team" } : {}),
              })
              .eq("id", meeting.id);
            if (meeting.event_id)
              await db
                .from("events")
                .update({ status: status === "canceled" ? "canceled" : "done" })
                .eq("id", meeting.event_id);
            await m.cancelQueuedMeetingJobs(meeting.id);
            const creds = await m.livekitCreds(caller.accountId);
            if (creds) await lk.deleteRoom(creds, meeting.room_name).catch(() => undefined);
            if (status === "ended" && meeting.status !== "ended")
              await db.rpc("enqueue_job", {
                _account: caller.accountId,
                _kind: "meeting.minutes",
                _payload: { meeting_id: meeting.id },
                _dedupe: `meeting.minutes:${meeting.id}`,
              });
            return h.json({ ok: true });
          }

          if (body.action === "delete_recording") {
            // LGPD: o gestor apaga a gravação na hora (arquivo do bucket + link), com auditoria
            if (!["owner", "admin", "manager"].includes(caller.role))
              throw new h.HttpError(403, "Só gestor apaga gravação", "forbidden");
            const file = /^storage:\/\/meeting-recordings\/(.+)$/.exec(
              meeting.recording_url ?? "",
            )?.[1];
            if (file) {
              const { error } = await db.storage.from("meeting-recordings").remove([file]);
              if (error) throw new h.HttpError(500, "Não deu para apagar o arquivo", "storage");
            }
            await db.from("meetings").update({ recording_url: null }).eq("id", meeting.id);
            await db.rpc("audit", {
              _account: caller.accountId,
              _action: "recording.deleted",
              _entity: "meeting",
              _entity_id: meeting.id,
              _meta: { file: Boolean(file) },
            });
            return h.json({ ok: true, file: Boolean(file) });
          }

          if (body.action === "minutes") {
            // R9: a ata chama a IA; regerar em loop gasta o crédito da conta
            await h.rateLimit(`ai:minutes:${caller.userId}`, 10, 3600);
            await db.rpc("enqueue_job", {
              _account: caller.accountId,
              _kind: "meeting.minutes",
              _payload: { meeting_id: meeting.id },
              _dedupe: `meeting.minutes:${meeting.id}:${Date.now()}`,
            });
            return h.json({ ok: true });
          }
          throw new h.HttpError(400, "Ação inválida", "bad_action");
        })(ctx);
      },
    },
  },
});
