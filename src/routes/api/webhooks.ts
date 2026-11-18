import { BRAND } from "@/lib/brand";
import { createFileRoute } from "@tanstack/react-router";

// Webhooks de saída: criar endpoint (o segredo aparece uma única vez), rotacionar e mandar um ping.
export const Route = createFileRoute("/api/webhooks")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/backend/http.server")).preflight(),
      POST: async (ctx) => {
        const h = await import("@/backend/http.server");
        return h.handle(async (req) => {
          const body = await h.readJson<{
            accountId?: string;
            action?: string;
            url?: string;
            events?: string[];
            description?: string;
            id?: string;
          }>(req);
          const caller = await h.requireMember(req, body.accountId, "admin");
          const db = h.admin();
          const { webhookSecretKey, signPayload } = await import("@/backend/jobs/webhooks.server");
          const { randomBytes } = await import("node:crypto");
          const { assertPublicUrl, publicFetch } = await import("@/backend/net-guard.server");

          if (body.action === "create" || body.action === "rotate") {
            let id = body.id;
            if (body.action === "create") {
              const url = String(body.url ?? "").trim();
              if (!/^https:\/\/[^\s]+$/.test(url))
                throw new h.HttpError(400, "Use uma URL https://", "bad_url");
              await assertPublicUrl(url, { httpsOnly: true }).catch((e: unknown) => {
                throw new h.HttpError(
                  400,
                  e instanceof Error ? `URL recusada: ${e.message}` : "URL recusada",
                  "bad_url",
                );
              });
              const events = (body.events ?? []).filter((e) => /^[a-z_]+\.[a-z_]+$|^\*$/.test(e));
              if (events.length === 0)
                throw new h.HttpError(400, "Escolha ao menos um evento", "no_events");
              const { data, error } = await db
                .from("webhook_endpoints")
                .insert({
                  account_id: caller.accountId,
                  url,
                  events,
                  description: body.description ?? null,
                  created_by: caller.userId,
                })
                .select("id")
                .single();
              if (error) throw new h.HttpError(500, error.message, "insert");
              id = data.id;
            }
            if (!h.isUuid(id)) throw new h.HttpError(400, "Endpoint inválido", "bad_id");
            const { data: ep } = await db
              .from("webhook_endpoints")
              .select("id")
              .eq("id", id)
              .eq("account_id", caller.accountId)
              .maybeSingle();
            if (!ep) throw new h.HttpError(404, "Endpoint não encontrado", "not_found");
            const secret = `whsec_${randomBytes(24).toString("hex")}`;
            const { error } = await db.rpc("secret_set", {
              _account: caller.accountId,
              _scope: "integration",
              _scope_id: caller.accountId,
              _key: webhookSecretKey(id),
              _value: secret,
            });
            if (error) throw new h.HttpError(500, "Não deu para guardar o segredo", "secret");
            await db.rpc("audit", {
              _account: caller.accountId,
              _action: `webhook.${body.action}`,
              _entity: "webhook",
              _entity_id: id,
              _meta: {},
            });
            return h.json({ id, secret });
          }

          if (body.action === "ping") {
            if (!h.isUuid(body.id)) throw new h.HttpError(400, "Endpoint inválido", "bad_id");
            const { data: ep } = await db
              .from("webhook_endpoints")
              .select("id, url")
              .eq("id", body.id)
              .eq("account_id", caller.accountId)
              .maybeSingle();
            if (!ep) throw new h.HttpError(404, "Endpoint não encontrado", "not_found");
            const { data: secret } = await db.rpc("secret_get", {
              _scope: "integration",
              _scope_id: caller.accountId,
              _key: webhookSecretKey(ep.id),
            });
            const payload = JSON.stringify({
              type: "ping",
              created_at: new Date().toISOString(),
              data: { message: `Teste do ${BRAND.name}` },
            });
            const ts = Math.floor(Date.now() / 1000);
            try {
              // confere o destino agora (DNS pode ter mudado) e não segue redirecionamento (R8)
              const res = await publicFetch(
                ep.url,
                {
                  method: "POST",
                  headers: {
                    "content-type": "application/json",
                    "x-vinculo-timestamp": String(ts),
                    "x-vinculo-signature": `sha256=${signPayload((secret as string) ?? "", ts, payload)}`,
                  },
                  body: payload,
                  signal: AbortSignal.timeout(8_000),
                },
                { httpsOnly: true },
              );
              return h.json({ ok: res.ok, status: res.status });
            } catch (err) {
              return h.json({
                ok: false,
                status: 0,
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }
          throw new h.HttpError(400, "Ação inválida", "bad_action");
        })(ctx);
      },
    },
  },
});
