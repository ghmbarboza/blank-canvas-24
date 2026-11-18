import { createFileRoute } from "@tanstack/react-router";

// Convidado gerencia a própria reunião pelo link assinado do convite: ver, confirmar presença,
// cancelar ou escolher outro horário livre do anfitrião. Sem login.
export const Route = createFileRoute("/api/public/meeting-manage")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/backend/http.server")).preflight(),
      POST: async (ctx) => {
        const h = await import("@/backend/http.server");
        const mm = await import("@/backend/meeting-manage.server");
        const { MANAGE_TOKEN_RE } = await import("@/backend/meetings/manage-link");
        return h.handle(async (req) => {
          const body = await h.readJson<{
            token?: string;
            action?: "info" | "confirm" | "cancel" | "reschedule";
            start?: string;
            reason?: string;
            slots?: boolean;
          }>(req, 4 * 1024);
          if (typeof body.token !== "string" || !MANAGE_TOKEN_RE.test(body.token))
            throw new h.HttpError(400, "Link inválido", "bad_link");
          const action = body.action ?? "info";
          await h.rateLimit(
            `meeting-manage:${action === "info" ? "r" : "w"}:${h.trustedIp(req)}`,
            action === "info" ? 60 : 12,
            600,
          );
          if (action === "info")
            return h.json(await mm.manageInfo(body.token, body.slots === true));
          if (action === "confirm") return h.json(await mm.confirmPresence(body.token));
          if (action === "cancel")
            return h.json(
              await mm.cancelByGuest(
                body.token,
                typeof body.reason === "string" ? body.reason : null,
              ),
            );
          if (action === "reschedule") {
            if (typeof body.start !== "string")
              throw new h.HttpError(400, "Escolha um horário", "bad_start");
            return h.json(await mm.rescheduleByGuest(body.token, body.start));
          }
          throw new h.HttpError(400, "Ação inválida", "bad_action");
        })(ctx);
      },
    },
  },
});
