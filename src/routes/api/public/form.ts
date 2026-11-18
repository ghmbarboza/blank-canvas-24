import { createFileRoute } from "@tanstack/react-router";

// Definição pública de um formulário (para /f/:id e o embed). Só campos, nunca o mapeamento interno.
export const Route = createFileRoute("/api/public/form")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/backend/http.server")).preflight(),
      GET: async (ctx) => {
        const h = await import("@/backend/http.server");
        const { publicForm } = await import("@/backend/capture.server");
        return h.handle(async (req) => {
          const id = new URL(req.url).searchParams.get("id");
          if (!h.isUuid(id)) throw new h.HttpError(400, "Formulário inválido", "bad_form");
          const { data: form } = await h
            .admin()
            .from("forms")
            .select(
              "id, account_id, name, title, description, fields, consent, submit_label, theme, status",
            )
            .eq("id", id)
            .maybeSingle();
          if (!form || form.status !== "active")
            throw new h.HttpError(404, "Formulário indisponível", "not_found");
          const { turnstileSiteKey } = await import("@/backend/providers/turnstile.server");
          const siteKey = await turnstileSiteKey(form.account_id);
          return h.json({ ...publicForm(form), turnstile_site_key: siteKey }, 200, {
            "cache-control": "public, max-age=60",
          });
        })(ctx);
      },
    },
  },
});
