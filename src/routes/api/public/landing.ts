import { createFileRoute } from "@tanstack/react-router";

// Landing page publicada (por slug) com o formulário embutido.
export const Route = createFileRoute("/api/public/landing")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/backend/http.server")).preflight(),
      GET: async (ctx) => {
        const h = await import("@/backend/http.server");
        const { publicForm } = await import("@/backend/capture.server");
        return h.handle(async (req) => {
          const slug = new URL(req.url).searchParams.get("slug") ?? "";
          if (!/^[a-z0-9-]{3,62}$/.test(slug))
            throw new h.HttpError(400, "Página inválida", "bad_slug");
          const db = h.admin();
          const { data: page } = await db
            .from("landing_pages")
            .select("id, account_id, title, description, blocks, theme, form_id, published, views")
            .eq("slug", slug)
            .maybeSingle();
          if (!page || !page.published)
            throw new h.HttpError(404, "Página não encontrada", "not_found");
          let form = null;
          if (page.form_id) {
            const { data } = await db
              .from("forms")
              .select("id, name, title, description, fields, consent, submit_label, theme, status")
              .eq("id", page.form_id)
              .maybeSingle();
            if (data && data.status === "active") {
              const { turnstileSiteKey } = await import("@/backend/providers/turnstile.server");
              form = {
                ...publicForm(data),
                turnstile_site_key: await turnstileSiteKey(page.account_id),
              };
            }
          }
          await db
            .from("landing_pages")
            .update({ views: page.views + 1 })
            .eq("id", page.id);
          return h.json({
            id: page.id,
            account_id: page.account_id,
            title: page.title,
            description: page.description,
            blocks: page.blocks,
            theme: page.theme,
            form,
          });
        })(ctx);
      },
    },
  },
});
