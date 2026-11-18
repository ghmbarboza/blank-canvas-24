import { createFileRoute } from "@tanstack/react-router";

// Integrações da conta: salvar (config na coluna, segredos no Vault), testar e ler o estado.
export const Route = createFileRoute("/api/integrations")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/backend/http.server")).preflight(),
      POST: async (ctx) => {
        const h = await import("@/backend/http.server");
        return h.handle(async (req) => {
          const body = await h.readJson<{
            accountId?: string;
            action?: "save" | "test" | "status";
            provider?: string;
            values?: Record<string, string>;
          }>(req);
          const { PROVIDERS, providerDef, secretKeyName } =
            await import("@/features/integrations/providers");
          const db = h.admin();

          if (body.action === "status") {
            const caller = await h.requireMember(req, body.accountId, "member");
            const { data: rows } = await db
              .from("account_integrations")
              .select("provider, status, config, last_error, updated_at")
              .eq("account_id", caller.accountId);
            const { data: keys } = await db.rpc("secret_keys", {
              _account: caller.accountId,
              _scope: "integration",
              _scope_id: caller.accountId,
            });
            const isAdmin = caller.role === "owner" || caller.role === "admin";
            return h.json({
              providers: PROVIDERS.map((p) => {
                const row = (rows ?? []).find((r) => r.provider === p.id);
                const cfg = (row?.config ?? {}) as Record<string, string>;
                return {
                  id: p.id,
                  status: row?.status ?? "off",
                  last_error: row?.last_error ?? null,
                  updated_at: row?.updated_at ?? null,
                  config: isAdmin ? cfg : {},
                  secrets: Object.fromEntries(
                    p.fields
                      .filter((f) => f.secret)
                      .map((f) => [
                        f.key,
                        ((keys as string[] | null) ?? []).includes(secretKeyName(p.id, f.key)),
                      ]),
                  ),
                };
              }),
            });
          }

          const caller = await h.requireMember(req, body.accountId, "admin");
          const def = providerDef(body.provider ?? "");
          if (!def) throw new h.HttpError(400, "Integração desconhecida", "bad_provider");

          const acts = await import("@/backend/integrations-actions.server");
          if (body.action === "save") {
            await acts.saveIntegration(caller, def.id, body.values ?? {});
            return h.json({ ok: true });
          }
          if (body.action === "test")
            return h.json({ ok: true, message: await acts.testIntegration(caller, def.id) });
          throw new h.HttpError(400, "Ação inválida", "bad_action");
        })(ctx);
      },
    },
  },
});
