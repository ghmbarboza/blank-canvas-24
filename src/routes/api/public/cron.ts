import { createFileRoute } from "@tanstack/react-router";

// Tick do agendador: o pg_cron chama a cada minuto (public.cron_tick) com x-cron-secret.
export const Route = createFileRoute("/api/public/cron")({
  server: {
    handlers: {
      POST: async (ctx) => {
        const { handle, json, requireCron } = await import("@/backend/http.server");
        return handle(async (req) => {
          await requireCron(req);
          const { runTick, runFastTick } = await import("@/backend/jobs/runner.server");
          const fast = new URL(req.url).searchParams.get("fast") === "1";
          return json({ ok: true, fast, ...(await (fast ? runFastTick() : runTick())) });
        })(ctx);
      },
    },
  },
});
