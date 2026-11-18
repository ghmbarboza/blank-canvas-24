import { createFileRoute } from "@tanstack/react-router";

// Convidado entra pelo link do convite (?t=token), sem login. O token vale só para esta sala.
export const Route = createFileRoute("/api/public/meeting-join")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/backend/http.server")).preflight(),
      POST: async (ctx) => {
        const h = await import("@/backend/http.server");
        const m = await import("@/backend/meetings.server");
        const lk = await import("@/backend/providers/livekit.server");
        return h.handle(async (req) => {
          const body = await h.readJson<{
            meetingId?: string;
            t?: string;
            name?: string;
            action?: "info" | "join";
            consent?: boolean;
          }>(req, 4 * 1024);
          if (!h.isUuid(body.meetingId) || !body.t || !/^[a-f0-9]{48}$/.test(body.t))
            throw new h.HttpError(400, "Link de convite inválido", "bad_link");
          const db = h.admin();
          const { data: part } = await db
            .from("meeting_participants")
            .select("*")
            .eq("meeting_id", body.meetingId)
            .eq("token_hash", m.hashToken(body.t))
            .maybeSingle();
          if (!part)
            throw new h.HttpError(
              403,
              "Este link de convite não vale mais. Peça um novo a quem te convidou.",
              "bad_token",
            );
          if (part.token_expires_at && new Date(part.token_expires_at) < new Date())
            throw new h.HttpError(403, "O convite expirou. Peça um novo link.", "expired");
          const { data: meeting } = await db
            .from("meetings")
            .select("*")
            .eq("id", body.meetingId)
            .maybeSingle();
          if (!meeting) throw new h.HttpError(404, "Reunião não encontrada", "not_found");
          if (meeting.status === "canceled")
            throw new h.HttpError(410, "Esta reunião foi cancelada", "canceled");
          const { data: account } = await db
            .from("accounts")
            .select("name, timezone, settings")
            .eq("id", meeting.account_id)
            .single();
          const privacy = ((account?.settings ?? {}) as { privacy?: { recording_notice?: string } })
            .privacy;
          const { data: host } = meeting.host_user_id
            ? await db
                .from("profiles")
                .select("full_name")
                .eq("id", meeting.host_user_id)
                .maybeSingle()
            : { data: null };
          const info = {
            title: meeting.title,
            status: meeting.status,
            scheduled_start: meeting.scheduled_start,
            scheduled_end: meeting.scheduled_end,
            account_name: account?.name ?? "",
            time_zone: account?.timezone ?? "America/Sao_Paulo",
            host_name: host?.full_name ?? null,
            guest_name: part.name,
            recording_notice:
              privacy?.recording_notice ??
              "Esta reunião pode ser gravada e transcrita para registrar o que combinamos.",
            require_admit: meeting.require_admit,
            // sala sem LiveKit ligado: a página mostra "sala indisponível" com o link para remarcar
            room_ready: Boolean(await m.livekitCreds(meeting.account_id)),
            manage_url: await m.manageUrl(meeting.id, meeting.scheduled_end).catch(() => null),
          };
          if (body.action !== "join") return h.json(info);

          if (body.consent !== true)
            throw new h.HttpError(
              422,
              "Confirme que leu o aviso de gravação para entrar",
              "consent_required",
            );
          const creds = await m.requireLivekit(meeting.account_id);
          if (part.contact_id) {
            const cap = await import("@/backend/capture.server");
            await m.recordJoinConsent({
              accountId: meeting.account_id,
              contactId: part.contact_id,
              meetingId: meeting.id,
              notice: info.recording_notice,
              ipHash: cap.ipHash(meeting.account_id, cap.clientIp(req)),
              userAgent: req.headers.get("user-agent"),
            });
          }
          const name =
            String(body.name ?? part.name ?? "Convidado")
              .trim()
              .slice(0, 60) || "Convidado";
          // Sala de espera: entra sem publicar nem ouvir até quem conduz admitir.
          const admitted = !meeting.require_admit || part.admitted === true;
          await db.from("meeting_participants").update({ name }).eq("id", part.id);
          const token = lk.livekitToken(creds, {
            identity: part.identity,
            name,
            ttlSeconds: 4 * 3600,
            metadata: JSON.stringify({ role: "guest", seller: false, meetingId: meeting.id }),
            attributes: { role: "guest", seller: "false" },
            video: {
              room: meeting.room_name,
              roomJoin: true,
              canSubscribe: admitted,
              canPublish: admitted,
              canPublishData: admitted,
            },
          });
          return h.json({
            ...info,
            token,
            url: creds.url,
            identity: part.identity,
            room: meeting.room_name,
            waiting: !admitted,
          });
        })(ctx);
      },
    },
  },
});
