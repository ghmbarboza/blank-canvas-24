import { createFileRoute } from "@tanstack/react-router";

// Direitos do titular (LGPD): exportar tudo o que guardamos de um contato e anonimizar.
export const Route = createFileRoute("/api/privacy")({
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
          }>(req);
          // Exportar a ficha inteira e anonimizar são de gestor (não há fluxo de pedido LGPD
          // aprovado para delegar a um atendente).
          const caller = await h.requireMember(req, body.accountId, "manager");
          if (body.action === "export")
            await h.rateLimit(
              `privacy:export:${caller.accountId}:${caller.userId}`,
              20,
              3600,
              "Limite de exportações por hora atingido. Tente de novo mais tarde.",
            );
          if (!h.isUuid(body.contactId))
            throw new h.HttpError(400, "Contato inválido", "bad_contact");
          const db = h.admin();
          const { data: contact } = await db
            .from("contacts")
            .select("*")
            .eq("id", body.contactId)
            .eq("account_id", caller.accountId)
            .maybeSingle();
          if (!contact) throw new h.HttpError(404, "Contato não encontrado", "not_found");
          if (
            caller.role === "seller" &&
            contact.owner_user_id &&
            contact.owner_user_id !== caller.userId
          )
            throw new h.HttpError(403, "Contato de outro vendedor", "forbidden");

          if (body.action === "export") {
            const { data: convs } = await db
              .from("conversations")
              .select("id, channel_id, created_at, status")
              .eq("contact_id", contact.id);
            const ids = (convs ?? []).map((c) => c.id);
            const [messages, activities, deals, events, consents, identities] = await Promise.all([
              ids.length
                ? db
                    .from("messages")
                    .select("conversation_id, direction, type, body, transcript, created_at")
                    .in("conversation_id", ids)
                    .order("created_at")
                : Promise.resolve({ data: [] }),
              db
                .from("activities")
                .select("type, title, body, due_at, done_at, created_at")
                .eq("contact_id", contact.id),
              db
                .from("deals")
                .select("title, value, status, created_at, closed_at")
                .eq("contact_id", contact.id),
              db
                .from("events")
                .select("title, starts_at, ends_at, status")
                .eq("contact_id", contact.id),
              db
                .from("consents")
                .select("channel, status, basis, source, created_at")
                .eq("contact_id", contact.id),
              db.from("contact_identities").select("*").eq("contact_id", contact.id),
            ]);
            await db.rpc("audit", {
              _account: caller.accountId,
              _action: "contact.exported",
              _entity: "contact",
              _entity_id: contact.id,
              _meta: { by: caller.email },
            });
            return h.json({
              exported_at: new Date().toISOString(),
              contact,
              identities: identities.data ?? [],
              conversations: convs ?? [],
              messages: messages.data ?? [],
              activities: activities.data ?? [],
              deals: deals.data ?? [],
              events: events.data ?? [],
              consents: consents.data ?? [],
            });
          }

          if (body.action === "anonymize") {
            const email = contact.email?.toLowerCase();
            const phone = contact.phone?.replace(/\D/g, "");
            const supp = [
              email
                ? {
                    account_id: caller.accountId,
                    channel: "email",
                    address: email,
                    reason: "manual",
                    source: "lgpd",
                  }
                : null,
              phone
                ? {
                    account_id: caller.accountId,
                    channel: "whatsapp",
                    address: phone,
                    reason: "manual",
                    source: "lgpd",
                  }
                : null,
              phone
                ? {
                    account_id: caller.accountId,
                    channel: "voice",
                    address: phone,
                    reason: "dnc",
                    source: "lgpd",
                  }
                : null,
              phone
                ? {
                    account_id: caller.accountId,
                    channel: "sms",
                    address: phone,
                    reason: "manual",
                    source: "lgpd",
                  }
                : null,
            ].filter(Boolean) as {
              account_id: string;
              channel: string;
              address: string;
              reason: string;
              source: string;
            }[];
            if (supp.length)
              await db
                .from("suppressions")
                .upsert(supp, { onConflict: "account_id,channel,address", ignoreDuplicates: true });
            const { data: convs } = await db
              .from("conversations")
              .select("id")
              .eq("contact_id", contact.id);
            const ids = (convs ?? []).map((c) => c.id);
            if (ids.length) {
              await db
                .from("messages")
                .update({
                  body: "[removido a pedido do titular]",
                  transcript: null,
                  media_url: null,
                  sender_name: null,
                  sender_handle: null,
                })
                .in("conversation_id", ids);
              await db
                .from("conversations")
                .update({
                  title: "Contato anonimizado",
                  last_message_preview: null,
                  avatar_url: null,
                })
                .in("id", ids);
            }
            await db.from("contact_identities").delete().eq("contact_id", contact.id);
            await db
              .from("contacts")
              .update({
                name: "Contato anonimizado",
                email: null,
                phone: null,
                avatar_url: null,
                company: null,
                job_title: null,
                city: null,
                notes: null,
                custom: {},
                tags: [],
                ai_summary: null,
                ai_intent: null,
                ai_next_step: null,
                lifecycle: "inactive",
              })
              .eq("id", contact.id);
            await db.rpc("audit", {
              _account: caller.accountId,
              _action: "contact.anonymized",
              _entity: "contact",
              _entity_id: contact.id,
              _meta: { by: caller.email },
            });
            return h.json({ ok: true });
          }
          throw new h.HttpError(400, "Ação inválida", "bad_action");
        })(ctx);
      },
    },
  },
});
