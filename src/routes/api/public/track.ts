import { createFileRoute } from "@tanstack/react-router";

// Visitas do site (script /api/public/widget.js): visitante anônimo por id próprio, sem cookie de terceiros.
export const Route = createFileRoute("/api/public/track")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/backend/http.server")).preflight(),
      POST: async (ctx) => {
        const h = await import("@/backend/http.server");
        const { cleanUtm } = await import("@/features/forms/types");
        return h.handle(async (req) => {
          const body = await h.readJson<{
            accountId?: string;
            visitorId?: string;
            url?: string;
            referrer?: string;
            utm?: unknown;
          }>(req, 8 * 1024);
          if (!h.isUuid(body.accountId))
            throw new h.HttpError(400, "Conta inválida", "bad_account");
          if (typeof body.visitorId !== "string" || !/^[a-z0-9-]{8,64}$/i.test(body.visitorId))
            throw new h.HttpError(400, "Visitante inválido", "bad_visitor");
          let url: URL;
          try {
            url = new URL(String(body.url ?? ""));
          } catch {
            throw new h.HttpError(400, "URL inválida", "bad_url");
          }
          const db = h.admin();
          // O visitorId é escolhido pelo cliente: o teto que vale é por IP e conta (S12).
          if (!(await h.allowOnce(`track:${h.trustedIp(req)}:${body.accountId}`, 600, 3600)))
            return h.json({ ok: true });
          // Limite simples: 120 visitas por visitante por hora.
          const { count } = await db
            .from("page_visits")
            .select("id", { count: "exact", head: true })
            .eq("account_id", body.accountId)
            .eq("visitor_id", body.visitorId)
            .gte("created_at", new Date(Date.now() - 3600_000).toISOString());
          if ((count ?? 0) > 120) return h.json({ ok: true });
          const { data: acc } = await db
            .from("accounts")
            .select("id")
            .eq("id", body.accountId)
            .maybeSingle();
          if (!acc) throw new h.HttpError(404, "Conta não encontrada", "not_found");
          const { data: known } = await db
            .from("page_visits")
            .select("contact_id")
            .eq("account_id", body.accountId)
            .eq("visitor_id", body.visitorId)
            .not("contact_id", "is", null)
            .limit(1);
          await db.from("page_visits").insert({
            account_id: body.accountId,
            visitor_id: body.visitorId,
            contact_id: known?.[0]?.contact_id ?? null,
            url: url.toString().slice(0, 1000),
            path: url.pathname.slice(0, 300),
            referrer: typeof body.referrer === "string" ? body.referrer.slice(0, 500) : null,
            utm: cleanUtm(body.utm),
          });
          return h.json({ ok: true });
        })(ctx);
      },
    },
  },
});
