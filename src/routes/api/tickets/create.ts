import { createFileRoute } from "@tanstack/react-router";

// Abre um chamado de qualquer origem. Aceita o usuário logado ou serviço interno
// (IA de voz, e-mail, webchat) com x-service-secret = segredo do agendador.
export const Route = createFileRoute("/api/tickets/create")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/backend/http.server")).preflight(),
      POST: async (ctx) => {
        const h = await import("@/backend/http.server");
        const { z } = await import("zod");
        return h.handle(async (req) => {
          const parsed = z
            .object({
              accountId: z.string().uuid(),
              subject: z.string().trim().min(1).max(200),
              description: z.string().max(10_000).optional(),
              contactId: z.string().uuid().optional(),
              conversationId: z.string().uuid().optional(),
              priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
              source: z
                .enum([
                  "manual",
                  "conversation",
                  "email",
                  "webchat",
                  "voice",
                  "api",
                  "whatsapp",
                  "form",
                ])
                .default("manual"),
              category: z.string().max(80).optional(),
              ownerUserId: z.string().uuid().optional(),
            })
            .safeParse(await h.readJson(req));
          if (!parsed.success)
            throw new h.HttpError(
              422,
              parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
              "invalid",
            );
          const v = parsed.data;
          const service = req.headers.get("x-service-secret");
          if (service) {
            await h.requireCron(new Request(req.url, { headers: { "x-cron-secret": service } }));
          } else {
            await h.requireMember(req, v.accountId, "member");
          }
          const db = h.admin();
          const { data, error } = await db.rpc("create_ticket", {
            _account: v.accountId,
            _subject: v.subject,
            ...(v.description ? { _description: v.description } : {}),
            ...(v.contactId ? { _contact: v.contactId } : {}),
            ...(v.conversationId ? { _conversation: v.conversationId } : {}),
            _priority: v.priority,
            _source: v.source,
            ...(v.category ? { _category: v.category } : {}),
            ...(v.ownerUserId ? { _owner: v.ownerUserId } : {}),
          });
          if (error)
            throw new h.HttpError(error.code === "42501" ? 403 : 500, error.message, "create");
          const { data: t } = await db
            .from("tickets")
            .select("id, number, resolution_due_at")
            .eq("id", data as string)
            .single();
          return h.json({ success: true, data: t }, 201);
        })(ctx);
      },
    },
  },
});
