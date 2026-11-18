import { createFileRoute } from "@tanstack/react-router";

// Gestão: importador guiado e sincronização com o CRM que o cliente já tem.
// POST { accountId, action, ... }
//   import.preview | import.commit  → gestor
//   crm.status                      → gestor
//   crm.save | crm.test | crm.pause | crm.resume | crm.disconnect → administrador
//   crm.sync_now                    → gestor (enfileira; começa em até 1 minuto)
export const Route = createFileRoute("/api/gestao")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/backend/http.server")).preflight(),
      POST: async (ctx) => {
        const h = await import("@/backend/http.server");
        return h.handle(async (req) => {
          const body = await h.readJson<
            Record<string, unknown> & { accountId?: string; action?: string }
          >(req);
          const action = String(body.action ?? "");
          const { requireModule } = await import("@/backend/modules.server");
          // Tudo aqui é do recurso Gestão (importar, CRM): só com ele ligado (S3).
          const member = async (allowed: "member" | "manager" | "admin") => {
            const caller = await h.requireMember(req, body.accountId, allowed);
            await requireModule(caller, "gestao");
            return caller;
          };

          if (action === "import.preview" || action === "import.commit") {
            const caller = await member("manager");
            await h.rateLimit(
              `gestao:import:${caller.userId}`,
              action === "import.commit" ? 10 : 60,
              3600,
            );
            const imp = await import("@/backend/gestao/import.server");
            const input = imp.parseImportInput(body["payload"]);
            if (action === "import.preview")
              return h.json(await imp.previewImport(caller.accountId, input));
            return h.json(await imp.commitImport(caller.accountId, caller.userId, input));
          }

          if (!action.startsWith("crm.")) throw new h.HttpError(400, "Ação inválida", "bad_action");
          const provider = body["provider"];
          const db = h.admin();

          if (action === "crm.status") {
            const caller = await member("manager");
            const [{ data: conns }, { data: keys }, { data: logs }] = await Promise.all([
              db
                .from("crm_sync_connections")
                .select(
                  "provider, status, direction, settings, connected_label, last_sync_at, last_result, last_error, updated_at",
                )
                .eq("account_id", caller.accountId),
              db.rpc("secret_keys", {
                _account: caller.accountId,
                _scope: "integration",
                _scope_id: caller.accountId,
              }),
              db
                .from("crm_sync_log")
                .select(
                  "id, provider, entity, direction, action, local_id, external_id, detail, created_at",
                )
                .eq("account_id", caller.accountId)
                .order("created_at", { ascending: false })
                .limit(40),
            ]);
            const { tokenKey } = await import("@/backend/gestao/sync.server");
            const saved = (keys as string[] | null) ?? [];
            return h.json({
              connections: conns ?? [],
              tokens: {
                rdstation_crm: saved.includes(tokenKey("rdstation_crm")),
                hubspot: saved.includes(tokenKey("hubspot")),
              },
              log: logs ?? [],
            });
          }

          if (provider !== "rdstation_crm" && provider !== "hubspot")
            throw new h.HttpError(400, "Escolha RD Station CRM ou HubSpot", "bad_provider");
          const sync = await import("@/backend/gestao/sync.server");

          if (action === "crm.sync_now") {
            const caller = await member("manager");
            await h.rateLimit(`gestao:sync:${caller.accountId}`, 12, 3600);
            const { data: conn } = await db
              .from("crm_sync_connections")
              .select("status")
              .eq("account_id", caller.accountId)
              .eq("provider", provider)
              .maybeSingle();
            if (!conn)
              throw new h.HttpError(400, "Conecte e teste antes de sincronizar", "not_connected");
            if (conn.status === "paused")
              throw new h.HttpError(409, "A sincronização está pausada", "paused");
            await db.rpc("enqueue_job", {
              _account: caller.accountId,
              _kind: "crm.sync",
              _payload: { provider },
              _dedupe: `crm.sync:${caller.accountId}:${provider}`,
            });
            return h.json({ ok: true, message: "Sincronização na fila. Começa em até 1 minuto." });
          }

          const caller = await member("admin");

          if (action === "crm.save") {
            const token = typeof body["token"] === "string" ? body["token"].trim() : "";
            const direction = body["direction"];
            const pipelineId = body["pipelineId"];
            if (token.length > 500) throw new h.HttpError(400, "Token longo demais", "too_long");
            if (
              direction !== undefined &&
              direction !== "both" &&
              direction !== "pull" &&
              direction !== "push"
            )
              throw new h.HttpError(400, "Sentido inválido", "bad_direction");
            if (pipelineId !== undefined && pipelineId !== null && !h.isUuid(pipelineId))
              throw new h.HttpError(400, "Funil inválido", "bad_pipeline");
            if (token) {
              const { error } = await db.rpc("secret_set", {
                _account: caller.accountId,
                _scope: "integration",
                _scope_id: caller.accountId,
                _key: sync.tokenKey(provider),
                _value: token,
              });
              if (error) throw new h.HttpError(500, "Não deu para guardar o token", "secret");
            }
            const { data: prev } = await db
              .from("crm_sync_connections")
              .select("settings, direction")
              .eq("account_id", caller.accountId)
              .eq("provider", provider)
              .maybeSingle();
            const settings = { ...((prev?.settings ?? {}) as Record<string, unknown>) };
            if (pipelineId !== undefined) settings["pipeline_id"] = pipelineId;
            const { error } = await db.from("crm_sync_connections").upsert(
              {
                account_id: caller.accountId,
                provider,
                direction:
                  (direction as "both" | "pull" | "push" | undefined) ?? prev?.direction ?? "both",
                settings: settings as never,
                ...(token ? { status: "pending" as const, last_error: null } : {}),
                created_by: caller.userId,
              },
              { onConflict: "account_id,provider" },
            );
            if (error) throw new h.HttpError(500, error.message, "save");
            await db.rpc("audit", {
              _account: caller.accountId,
              _action: "crm_sync.saved",
              _entity: "integration",
              _entity_id: caller.accountId,
              _meta: { provider, direction: direction ?? null },
            });
            return h.json({ ok: true });
          }

          if (action === "crm.test") {
            await h.rateLimit(`gestao:crmtest:${caller.accountId}`, 20, 600);
            const token = await sync.readToken(caller.accountId, provider);
            if (!token)
              throw new h.HttpError(400, "Cole o token e salve antes de testar", "no_token");
            try {
              const label = await sync.adapterFor(provider, token).test();
              await db
                .from("crm_sync_connections")
                .update({ status: "connected", connected_label: label, last_error: null })
                .eq("account_id", caller.accountId)
                .eq("provider", provider);
              return h.json({ ok: true, message: `Conectado: ${label}` });
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              await db
                .from("crm_sync_connections")
                .update({ status: "error", last_error: msg.slice(0, 500) })
                .eq("account_id", caller.accountId)
                .eq("provider", provider);
              throw new h.HttpError(422, msg, "test_failed");
            }
          }

          if (action === "crm.pause" || action === "crm.resume") {
            const { error } = await db
              .from("crm_sync_connections")
              .update({ status: action === "crm.pause" ? "paused" : "connected" })
              .eq("account_id", caller.accountId)
              .eq("provider", provider);
            if (error) throw new h.HttpError(500, error.message, "save");
            return h.json({ ok: true });
          }

          if (action === "crm.disconnect") {
            await db.rpc("secret_set", {
              _account: caller.accountId,
              _scope: "integration",
              _scope_id: caller.accountId,
              _key: sync.tokenKey(provider),
              _value: "",
            });
            await db
              .from("crm_sync_connections")
              .update({ status: "paused", connected_label: null })
              .eq("account_id", caller.accountId)
              .eq("provider", provider);
            return h.json({ ok: true });
          }
          throw new h.HttpError(400, "Ação inválida", "bad_action");
        })(ctx);
      },
    },
  },
});
