import { createFileRoute } from "@tanstack/react-router";

// SAC superior: macros sugeridas, rascunho de artigo, incidente em massa.
export const Route = createFileRoute("/api/sac")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/backend/http.server")).preflight(),
      POST: async (ctx) => {
        const h = await import("@/backend/http.server");
        return h.handle(async (req) => {
          const body = await h.readJson<Record<string, unknown>>(req);
          const s = await import("@/backend/support/sac.server");
          const action = String(body["action"] ?? "");
          if (action === "macro.suggest") {
            const caller = await h.requireMember(req, body["accountId"], "member");
            await h.rateLimit(`sac:macro:${caller.userId}`, 60, 600);
            return h.json(
              await s.suggestMacros(caller, {
                conversationId: body["conversationId"],
                ticketId: body["ticketId"],
              }),
            );
          }
          if (action === "macro.used") {
            const caller = await h.requireMember(req, body["accountId"], "member");
            return h.json(await s.macroUsed(caller, body["id"]));
          }
          const caller = await h.requireMember(req, body["accountId"], "manager");
          if (action.startsWith("incident.")) {
            const { requireModule } = await import("@/backend/modules.server");
            await requireModule(caller, "incidentes");
          }
          switch (action) {
            case "kb.draft": {
              if (!h.isUuid(body["ticketId"]))
                throw new h.HttpError(400, "Chamado inválido", "bad_id");
              const { data: t } = await h
                .admin()
                .from("tickets")
                .select("id")
                .eq("id", body["ticketId"] as string)
                .eq("account_id", caller.accountId)
                .maybeSingle();
              if (!t) throw new h.HttpError(404, "Chamado não encontrado", "not_found");
              await h.rateLimit(`sac:kbdraft:${caller.accountId}`, 30, 3600);
              return h.json(await s.draftArticleFromTicket(t.id));
            }
            case "incident.suggest":
              return h.json(await s.incidentSuggestions(caller));
            case "incident.link":
              return h.json(await s.linkTickets(caller, body["incidentId"], body["ticketIds"]));
            case "incident.update": {
              await h.rateLimit(`sac:incident:${caller.accountId}`, 30, 3600);
              return h.json(await s.postIncidentUpdate(caller, body));
            }
            default:
              throw new h.HttpError(400, "Ação inválida", "bad_action");
          }
        })(ctx);
      },
    },
  },
});
