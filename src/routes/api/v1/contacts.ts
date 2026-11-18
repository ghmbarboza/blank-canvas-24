import { createFileRoute } from "@tanstack/react-router";

const COLUMNS =
  "id, name, email, phone, company, company_id, job_title, city, tags, source, lifecycle, score, temperature, owner_user_id, custom, created_at, updated_at";

// API pública de contatos: GET lista/busca, POST cria ou atualiza (pelo e-mail ou telefone).
export const Route = createFileRoute("/api/v1/contacts")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/backend/http.server")).preflight(),
      GET: async (ctx) => {
        const h = await import("@/backend/http.server");
        const api = await import("@/backend/public-api.server");
        return h.handle(async (req) => {
          const caller = await api.requireApiKey(req, "contacts:read");
          const url = new URL(req.url);
          const { limit, offset } = api.pageParams(url);
          let q = h
            .admin()
            .from("contacts")
            .select(COLUMNS, { count: "exact" })
            .eq("account_id", caller.accountId);
          const email = url.searchParams.get("email");
          const phone = url.searchParams.get("phone");
          if (email) q = q.eq("email", email.toLowerCase());
          if (phone) q = q.ilike("phone", `%${phone.replace(/\D/g, "")}%`);
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
          const caller = await api.requireApiKey(req, "contacts:write");
          const schema = z.object({
            name: z.string().trim().max(160).optional(),
            email: z.string().trim().toLowerCase().email().optional(),
            phone: z.string().trim().max(30).optional(),
            company: z.string().trim().max(160).optional(),
            job_title: z.string().trim().max(120).optional(),
            city: z.string().trim().max(120).optional(),
            tags: z.array(z.string().max(40)).max(30).optional(),
            source: z.string().trim().max(40).optional(),
            custom: z.record(z.string(), z.unknown()).optional(),
          });
          const parsed = schema.safeParse(await h.readJson(req));
          if (!parsed.success)
            throw new h.HttpError(
              422,
              parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
              "invalid",
            );
          const v = parsed.data;
          if (!v.email && !v.phone && !v.name)
            throw new h.HttpError(422, "Informe e-mail, telefone ou nome", "invalid");
          const db = h.admin();
          const { normalizePhone } = await import("@/features/telephony/lib");
          const phone = normalizePhone(v.phone) ?? undefined;
          let existing: { id: string } | null = null;
          if (v.email)
            existing = (
              await db
                .from("contacts")
                .select("id")
                .eq("account_id", caller.accountId)
                .eq("email", v.email)
                .maybeSingle()
            ).data;
          if (!existing && phone)
            existing = (
              await db
                .from("contacts")
                .select("id")
                .eq("account_id", caller.accountId)
                .eq("phone", phone)
                .maybeSingle()
            ).data;
          const values = Object.fromEntries(
            Object.entries({
              ...v,
              phone,
              source: v.source ?? "api",
              custom: v.custom ?? {},
            }).filter(([, x]) => x !== undefined),
          ) as {
            name?: string;
            email?: string;
            phone?: string;
            company?: string;
            job_title?: string;
            city?: string;
            tags?: string[];
            source: string;
            custom: never;
          };
          const res = existing
            ? await db
                .from("contacts")
                .update(values)
                .eq("id", existing.id)
                .select(COLUMNS)
                .single()
            : await db
                .from("contacts")
                .insert({ ...values, account_id: caller.accountId })
                .select(COLUMNS)
                .single();
          if (res.error) throw new h.HttpError(500, res.error.message, "write");
          return h.json(
            { success: true, data: res.data, created: !existing },
            existing ? 200 : 201,
          );
        })(ctx);
      },
    },
  },
});
