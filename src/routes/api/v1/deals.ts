import { createFileRoute } from "@tanstack/react-router";

const COLUMNS =
  "id, title, value, currency, status, pipeline_id, stage_id, contact_id, company_id, owner_user_id, expected_close_date, source, custom, created_at, updated_at";

// API pública de negócios: GET lista; POST cria no funil padrão (primeira etapa) se não vier etapa.
export const Route = createFileRoute("/api/v1/deals")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/backend/http.server")).preflight(),
      GET: async (ctx) => {
        const h = await import("@/backend/http.server");
        const api = await import("@/backend/public-api.server");
        return h.handle(async (req) => {
          const caller = await api.requireApiKey(req, "deals:read");
          const url = new URL(req.url);
          const { limit, offset } = api.pageParams(url);
          let q = h
            .admin()
            .from("deals")
            .select(COLUMNS, { count: "exact" })
            .eq("account_id", caller.accountId);
          const status = url.searchParams.get("status");
          if (status && ["open", "won", "lost"].includes(status)) q = q.eq("status", status);
          const { data, error, count } = await q
            .order("created_at", { ascending: false })
            .range(offset, offset + limit - 1);
          if (error) throw new h.HttpError(500, error.message, "query");
          return h.json({ success: true, data, meta: { total: count ?? 0, limit, offset } });
        })(ctx);
      },
      POST: async (ctx) => {
        const h = await import("@/backend/http.server");
        const api = await import("@/backend/public-api.server");
        const { z } = await import("zod");
        return h.handle(async (req) => {
          const caller = await api.requireApiKey(req, "deals:write");
          const parsed = z
            .object({
              title: z.string().trim().min(1).max(160),
              value: z.number().min(0).optional(),
              contact_id: z.string().uuid().optional(),
              stage_id: z.string().uuid().optional(),
              expected_close_date: z
                .string()
                .regex(/^\d{4}-\d{2}-\d{2}$/)
                .optional(),
              source: z.string().max(40).optional(),
            })
            .safeParse(await h.readJson(req));
          if (!parsed.success)
            throw new h.HttpError(
              422,
              parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
              "invalid",
            );
          const db = h.admin();
          let stage = parsed.data.stage_id
            ? (
                await db
                  .from("pipeline_stages")
                  .select("id, pipeline_id")
                  .eq("id", parsed.data.stage_id)
                  .eq("account_id", caller.accountId)
                  .maybeSingle()
              ).data
            : null;
          if (!stage) {
            const { data: p } = await db
              .from("pipelines")
              .select("id")
              .eq("account_id", caller.accountId)
              .order("is_default", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (!p) throw new h.HttpError(422, "A conta não tem funil", "no_pipeline");
            stage = (
              await db
                .from("pipeline_stages")
                .select("id, pipeline_id")
                .eq("pipeline_id", p.id)
                .eq("account_id", caller.accountId)
                .order("position")
                .limit(1)
                .maybeSingle()
            ).data;
          }
          if (!stage) throw new h.HttpError(422, "Funil sem etapas", "no_stage");
          // contato de outra conta não entra no negócio (R13)
          if (parsed.data.contact_id) {
            const { data: own } = await db
              .from("contacts")
              .select("id")
              .eq("id", parsed.data.contact_id)
              .eq("account_id", caller.accountId)
              .maybeSingle();
            if (!own) throw new h.HttpError(422, "contact_id: contato não encontrado", "invalid");
          }
          const { data, error } = await db
            .from("deals")
            .insert({
              account_id: caller.accountId,
              title: parsed.data.title,
              value: parsed.data.value ?? 0,
              contact_id: parsed.data.contact_id ?? null,
              pipeline_id: stage.pipeline_id,
              stage_id: stage.id,
              expected_close_date: parsed.data.expected_close_date ?? null,
              source: parsed.data.source ?? "api",
            })
            .select(COLUMNS)
            .single();
          if (error) throw new h.HttpError(500, error.message, "write");
          return h.json({ success: true, data }, 201);
        })(ctx);
      },
    },
  },
});
