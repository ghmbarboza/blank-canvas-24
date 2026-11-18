import { createFileRoute } from "@tanstack/react-router";

// Página de status pública: incidentes abertos e os resolvidos nos últimos 30 dias, com as atualizações.
export const Route = createFileRoute("/api/public/status")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/backend/http.server")).preflight(),
      GET: async (ctx) => {
        const h = await import("@/backend/http.server");
        return h.handle(async (req) => {
          const slug = (new URL(req.url).searchParams.get("slug") ?? "").toLowerCase();
          if (!/^[a-z0-9-]{1,60}$/.test(slug))
            throw new h.HttpError(404, "Página não encontrada", "not_found");
          const db = h.admin();
          const { data: acc } = await db
            .from("accounts")
            .select("id, name")
            .eq("slug", slug)
            .maybeSingle();
          if (!acc) throw new h.HttpError(404, "Página não encontrada", "not_found");
          const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
          const { data: incidents } = await db
            .from("incidents")
            .select("id, title, status, impact, public_summary, started_at, resolved_at")
            .eq("account_id", acc.id)
            .eq("is_public", true)
            .or(`status.neq.resolved,resolved_at.gte.${since}`)
            .order("started_at", { ascending: false })
            .limit(30);
          const ids = (incidents ?? []).map((i) => i.id);
          const { data: updates } = ids.length
            ? await db
                .from("incident_updates")
                .select("incident_id, status, body, created_at")
                .in("incident_id", ids)
                .eq("is_public", true)
                .order("created_at", { ascending: false })
                .limit(300)
            : { data: [] };
          return h.json(
            {
              company: acc.name,
              incidents: (incidents ?? []).map((i) => ({
                ...i,
                updates: (updates ?? []).filter((u) => u.incident_id === i.id),
              })),
            },
            200,
            { "cache-control": "public, max-age=30" },
          );
        })(ctx);
      },
    },
  },
});
