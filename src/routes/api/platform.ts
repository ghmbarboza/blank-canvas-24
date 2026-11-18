import { createFileRoute } from "@tanstack/react-router";

// Instalação da plataforma num remix (#20).
// POST { accountId, force? }: o dono/admin garante segredos, tarefas agendadas, endereço e chaves de push.
// O endereço vem da origem do navegador; a prévia do editor do Lovable é recusada pelo banco.
// Endereço vazio: grava. Endereço já gravado: só o DONO troca (force), com a origem conferida no
// /api/health do destino e registro no audit_log (R2, 05/11).
// GET ?accountId=: estado por peça, para o assistente de configuração.
export const Route = createFileRoute("/api/platform")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/backend/http.server")).preflight(),
      GET: async (ctx) => {
        const h = await import("@/backend/http.server");
        return h.handle(async (req) => {
          const accountId = new URL(req.url).searchParams.get("accountId");
          await h.requireMember(req, accountId, "admin");
          const { data, error } = await h.admin().rpc("platform_status");
          if (error) throw new h.HttpError(500, "Não deu para ler a instalação", "status_failed");
          return h.json(data, 200, { "cache-control": "no-store" });
        })(ctx);
      },
      POST: async (ctx) => {
        const h = await import("@/backend/http.server");
        return h.handle(async (req) => {
          const body = await h.readJson<{ accountId?: string; force?: boolean }>(req);
          const caller = await h.requireMember(req, body.accountId, "admin");
          const origin = req.headers.get("origin") ?? new URL(req.url).origin;
          const bu = await import("@/backend/platform/base-url");
          const ownProject = bu.projectRef(process.env["SUPABASE_URL"]);
          const ensure = (force: boolean, o: string | null = origin) =>
            h
              .admin()
              .rpc("garantir_plataforma", o ? { _origin: o, _force: force } : { _force: force });

          // R2: trocar um endereço já gravado é só do dono, e o destino tem de responder no
          // /api/health que é deste projeto. Sem isso, um admin forjava a Origin e o banco passava
          // a mandar o segredo do agendador para o servidor dele.
          if (body.force === true) {
            if (caller.role !== "owner")
              throw new h.HttpError(
                403,
                "Só o dono da conta pode trocar o endereço do app",
                "owner_only",
              );
            if (!(await bu.originServesProject(origin, ownProject)))
              throw new h.HttpError(
                422,
                "Este endereço não respondeu como este app. Abra o assistente pelo endereço publicado e tente de novo.",
                "origin_unverified",
              );
          }

          const changeBase = async (): Promise<Record<string, unknown> | null> => {
            const before = await h.admin().rpc("platform_status");
            const prev = String(
              (before.data as { app_base_url?: unknown } | null)?.app_base_url ?? "",
            );
            const again = await ensure(true);
            if (again.error) return null;
            const next = (again.data ?? {}) as Record<string, unknown>;
            const to = typeof next["app_base_url"] === "string" ? next["app_base_url"] : null;
            if (prev && to !== prev)
              // grava direto com o autor: pelo cliente de serviço, audit() não sabe quem trocou
              await h
                .admin()
                .from("audit_log")
                .insert({
                  account_id: caller.accountId,
                  actor_id: caller.userId,
                  action: "platform.app_base_url_changed",
                  entity: "platform",
                  meta: { from: prev, to, by: caller.email },
                });
            return next;
          };

          // Sem force o banco só grava o endereço quando ainda está vazio. Mesmo vazio, a origem
          // tem de provar que serve este projeto (R2/7): pela service role o banco confia no
          // servidor, e um admin com Origin forjada gravaria o servidor dele no primeiro acesso.
          // Origem que não prova: garante segredos e rotinas, mas não grava endereço (_origin nulo).
          const status = await h.admin().rpc("platform_status");
          const empty = !String(
            (status.data as { app_base_url?: unknown } | null)?.app_base_url ?? "",
          );
          // O DONO grava o primeiro endereço sem essa prova: é o primeiro acesso do remix, o banco
          // já restringe endereço vazio ao dono, e na hospedagem do Lovable o servidor nem sempre
          // consegue chamar o próprio /api/health (sem isso o agendador nunca começava a rodar).
          const firstOrigin =
            empty &&
            caller.role !== "owner" &&
            !(await bu.originServesProject(origin, ownProject))
              ? null
              : origin;
          const { data, error } = await ensure(false, firstOrigin);
          if (error)
            throw new h.HttpError(500, "Não deu para preparar a plataforma", "ensure_failed");
          let result = (data ?? {}) as Record<string, unknown>;
          if (body.force === true && result["origin_mismatch"] === true) {
            const changed = await changeBase();
            if (!changed)
              throw new h.HttpError(500, "Não deu para trocar o endereço", "ensure_failed");
            result = changed;
          }

          // Endereço gravado de outro projeto (remix que nasceu com o do original): o dono troca
          // sozinho pela origem atual, sem esperar o "usar este endereço" (S1). Admin não troca.
          const stored = typeof result["app_base_url"] === "string" ? result["app_base_url"] : "";
          if (
            result["origin_mismatch"] === true &&
            body.force !== true &&
            stored &&
            caller.role === "owner"
          ) {
            const reclaim =
              bu.shouldReclaimBase({
                originMismatch: true,
                originAccepted: result["origin_accepted"] === true,
                ownProject,
                storedProject: await bu.probeProject(stored),
              }) && (await bu.originServesProject(origin, ownProject));
            if (reclaim) {
              const changed = await changeBase();
              if (changed) result = { ...changed, reclaimed: stored };
            }
          }

          const { vapidKeys } = await import("@/backend/push/send.server");
          let vapidCreated = false;
          if (!(await vapidKeys())) {
            const { generateVapidKeys } = await import("@/backend/push/webpush");
            const k = await generateVapidKeys();
            const { data: set } = await h.admin().rpc("platform_set_vapid", {
              _public: k.publicKey,
              _private: k.privateKey,
            });
            vapidCreated = set === true;
          }
          await h.primeAppBaseUrl(true);
          return h.json({ ...result, vapid_created: vapidCreated });
        })(ctx);
      },
    },
  },
});
