import { createFileRoute } from "@tanstack/react-router";

// Saúde do backend publicado: confirma que o runtime enxerga o banco com a service role e mostra
// a idade do último sinal de vida de cada serviço (tick do app, worker do livecoach).
// O selo `degraded` liga quando algum serviço passou de 3 min sem sinal ou há alerta aberto.
// Público vê só ok/degraded/db. O detalhe (serviços, alertas, chaves presentes) exige admin da
// conta: GET /api/health?accountId=<conta> com Authorization: Bearer <sessão>.
export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { json, admin, requireMember } = await import("@/backend/http.server");
        const accountId = new URL(request.url).searchParams.get("accountId");
        const detailed = accountId
          ? await requireMember(request, accountId, "admin").then(
              () => true,
              () => false,
            )
          : false;
        const { serviceStatuses, SERVICES } = await import("@/features/health/heartbeats");
        const hasKey = Boolean(process.env["SUPABASE_SERVICE_ROLE_KEY"]);
        let db = false;
        let services: Record<
          string,
          { age_s: number | null; last_seen: string | null; down: boolean; sleeping: boolean }
        > = {};
        let alerts: { service: string; since: string }[] = [];
        if (hasKey) {
          const { error } = await admin()
            .from("accounts")
            .select("id", { head: true, count: "exact" });
          db = !error;
          if (db) {
            const liveSince = new Date(Date.now() - 2 * 60_000).toISOString();
            const [hb, open, live] = await Promise.all([
              admin().from("service_heartbeats").select("service, instance, last_seen"),
              admin()
                .from("platform_alerts")
                .select("service, opened_at")
                .is("resolved_at", null)
                .order("opened_at", { ascending: false })
                .limit(20),
              admin()
                .from("meetings")
                .select("id", { head: true, count: "exact" })
                .eq("status", "live")
                .is("ended_at", null)
                .lt("started_at", liveSince),
            ]);
            const inDemand = new Set<string>(
              (live.count ?? 0) > 0 ? [SERVICES.LIVECOACH_WORKER] : [],
            );
            services = Object.fromEntries(
              serviceStatuses(
                hb.data ?? [],
                Date.now(),
                undefined,
                inDemand,
                new Set([SERVICES.APP_CRON, ...inDemand]),
              ).map((s) => [
                s.service,
                { age_s: s.age_s, last_seen: s.last_seen, down: s.down, sleeping: s.sleeping },
              ]),
            );
            alerts = (open.data ?? []).map((a) => ({ service: a.service, since: a.opened_at }));
          }
        }
        const degraded = Object.values(services).some((s) => s.down) || alerts.length > 0;
        const { BUILD_SHA } = await import("@/lib/build-info");
        const { projectRef } = await import("@/backend/platform/base-url");
        const base = {
          build: BUILD_SHA,
          // ref do projeto Supabase (já é público no bundle): o remix confere se um endereço é dele
          project: projectRef(process.env["SUPABASE_URL"]),
          ok: hasKey && db,
          degraded,
          db,
          at: new Date().toISOString(),
        };
        return json(
          detailed
            ? {
                ...base,
                service_role: hasKey,
                services,
                alerts,
                // gateway de IA do workspace (recuo quando a conta não cadastrou Anthropic/OpenAI)
                ai_gateway: Boolean(process.env["LOVABLE_API_KEY"]),
              }
            : base,
          hasKey && db ? 200 : 503,
          { "cache-control": "no-store" },
        );
      },
    },
  },
});
