import { createFileRoute } from "@tanstack/react-router";

// IA sob demanda (a edge function `ai` foi retirada; revisão de segurança de 04/11, S6):
//   classify { contactId }      → reclassifica o contato (o automático roda pela fila em ai.classify)
//   suggest  { conversationId } → 3 sugestões de resposta para o atendente
// As duas: vendedor só no que é dele, 30 por hora por pessoa.
export const Route = createFileRoute("/api/ai")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/backend/http.server")).preflight(),
      POST: async (ctx) => {
        const h = await import("@/backend/http.server");
        return h.handle(async (req) => {
          const body = await h.readJson<{
            accountId?: string;
            action?: string;
            contactId?: string;
            conversationId?: string;
          }>(req);
          const caller = await h.requireMember(req, body.accountId, "member");
          const notMine = (owner: string | null | undefined) =>
            caller.role === "seller" && !!owner && owner !== caller.userId;
          const aiFailed = (err: unknown): never => {
            if (err instanceof h.HttpError) throw err;
            throw new h.HttpError(
              502,
              err instanceof Error ? err.message : "IA indisponível",
              "ai_failed",
            );
          };

          if (body.action === "suggest") {
            if (!h.isUuid(body.conversationId))
              throw new h.HttpError(400, "Conversa inválida", "bad_conversation");
            const s = await import("@/backend/ai/suggest.server");
            const conv = await s.conversationOwner(caller.accountId, body.conversationId);
            if (!conv) throw new h.HttpError(404, "Conversa não encontrada", "not_found");
            if (notMine(conv.contact?.owner_user_id))
              throw new h.HttpError(403, "Conversa de outro vendedor", "forbidden");
            await h.rateLimit(
              `ai:suggest:${caller.userId}`,
              30,
              3600,
              "Muitas sugestões em pouco tempo. Espere uns minutos.",
            );
            try {
              return h.json({ suggestions: await s.suggestReplies(caller.accountId, conv) });
            } catch (err) {
              return aiFailed(err);
            }
          }

          if (body.action !== "classify") throw new h.HttpError(400, "Ação inválida", "bad_action");
          if (!h.isUuid(body.contactId))
            throw new h.HttpError(400, "Contato inválido", "bad_contact");
          const { data: c } = await h
            .admin()
            .from("contacts")
            .select("owner_user_id")
            .eq("id", body.contactId)
            .eq("account_id", caller.accountId)
            .maybeSingle();
          if (!c) throw new h.HttpError(404, "Contato não encontrado", "not_found");
          if (notMine(c.owner_user_id))
            throw new h.HttpError(403, "Contato de outro vendedor", "forbidden");
          await h.rateLimit(`ai:classify:${caller.userId}`, 30, 3600);
          const { classifyContact } = await import("@/backend/ai/classify.server");
          try {
            const r = await classifyContact(caller.accountId, body.contactId);
            if (!r)
              throw new h.HttpError(
                422,
                "Ainda não há conversa com esse contato para a IA ler",
                "no_history",
              );
            return h.json(r);
          } catch (err) {
            return aiFailed(err);
          }
        })(ctx);
      },
    },
  },
});
