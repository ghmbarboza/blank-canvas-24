import { createFileRoute } from "@tanstack/react-router";

// Importar o que a empresa vende a partir do site. POST { accountId, action }:
//   preview { url }                                   → lê o site e devolve a prévia (nada é gravado)
//   confirm { url, items, company?, saveKnowledge?, fillCompany? } → grava o que a pessoa marcou
// Gestores e administradores: é o mesmo perfil que edita o catálogo.
export const Route = createFileRoute("/api/catalog-import")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/backend/http.server")).preflight(),
      POST: async (ctx) => {
        const h = await import("@/backend/http.server");
        return h.handle(async (req) => {
          const body = await h.readJson<Record<string, unknown>>(req);
          const caller = await h.requireMember(req, body["accountId"], "manager");
          if (body["action"] === "preview") {
            const url = typeof body["url"] === "string" ? body["url"].trim().slice(0, 300) : "";
            if (url.length < 4)
              throw new h.HttpError(400, "Cole o endereço do site (ex.: minhaloja.com.br)", "url");
            await h.rateLimit(
              `catalog-import:${caller.accountId}`,
              20,
              600,
              "Muitas leituras de site seguidas. Espere alguns minutos e tente de novo.",
            );
            const { runPreview } = await import("@/backend/setup-agent/site-import/server");
            try {
              return h.json(await runPreview(caller.accountId, url));
            } catch (err) {
              throw new h.HttpError(
                422,
                err instanceof Error ? err.message : "Não consegui ler o site",
                "site_unreadable",
              );
            }
          }
          if (body["action"] === "confirm") {
            const { confirmSchema } = await import("@/backend/setup-agent/site-import/types");
            const parsed = confirmSchema.safeParse(body);
            if (!parsed.success)
              throw new h.HttpError(
                400,
                "Não consegui ler os itens marcados. Leia o site de novo e confirme.",
                "bad_items",
              );
            // preencher a empresa é configuração da conta: só dono e administrador
            const input = {
              ...parsed.data,
              fillCompany:
                parsed.data.fillCompany && (caller.role === "owner" || caller.role === "admin"),
            };
            const { confirmImport } = await import("@/backend/setup-agent/site-import/server");
            try {
              return h.json(await confirmImport(caller, input));
            } catch (err) {
              throw new h.HttpError(
                422,
                err instanceof Error ? err.message : "Não consegui gravar",
                "import_failed",
              );
            }
          }
          throw new h.HttpError(400, "Ação inválida", "bad_action");
        })(ctx);
      },
    },
  },
});
