import { createFileRoute } from "@tanstack/react-router";

import { parseAgentChannel } from "@/features/agents/catalog";

// Equipe de IA: criar a partir de modelo ou por conversa, simulador, suíte e avaliação (com custo
// antes de rodar), Composio (chave do cliente, conectar, ações) e "Pergunte ao Vínculo".
// Leitura e edição simples (persona, regras, ferramentas, ligar/desligar) vão direto ao banco com RLS.
export const Route = createFileRoute("/api/agents")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/backend/http.server")).preflight(),
      POST: async (ctx) => {
        const h = await import("@/backend/http.server");
        const run = async (req: Request): Promise<Response> => {
          const body = await h.readJson<
            Record<string, unknown> & { accountId?: string; action?: string }
          >(req);
          const action = String(body.action ?? "");
          const str = (k: string, max = 2000) =>
            String(body[k] ?? "")
              .trim()
              .slice(0, max);
          const agentId = () => {
            const id = body["agentId"];
            if (!h.isUuid(id)) throw new h.HttpError(400, "Agente inválido", "bad_agent");
            return id;
          };
          const ensureAgent = async (accountId: string, id: string) => {
            const { data } = await h
              .admin()
              .from("ai_agents")
              .select("id")
              .eq("id", id)
              .eq("account_id", accountId)
              .maybeSingle();
            if (!data) throw new h.HttpError(404, "Agente não encontrado", "not_found");
          };

          if (action === "ask") {
            const caller = await h.requireMember(req, body.accountId, "member");
            const { requireModule } = await import("@/backend/modules.server");
            await requireModule(caller, "pergunte");
            await h.rateLimit(
              `ask:${caller.userId}`,
              30,
              600,
              "Muitas perguntas seguidas. Espere uns minutos.",
            );
            const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
            const { askNexus } = await import("@/backend/agents/ask.server");
            return h.json(await askNexus(caller, token, str("question")));
          }

          const caller = await h.requireMember(req, body.accountId, "manager");
          const ev = await import("@/backend/agents/eval.server");

          if (action === "template.create") {
            await h.rateLimit(`agents:create:${caller.accountId}`, 20, 600);
            return h.json(
              await ev.createFromTemplate(
                caller.accountId,
                caller.userId,
                str("template", 40),
                parseAgentChannel(body["channel"]),
              ),
            );
          }
          if (action === "agent.draft_from_text") {
            await h.rateLimit(`agents:create:${caller.accountId}`, 20, 600);
            return h.json(
              await ev.draftAgentFromText(
                caller.accountId,
                caller.userId,
                str("text"),
                parseAgentChannel(body["channel"]),
              ),
            );
          }
          if (action === "agent.simulate") {
            const id = agentId();
            await ensureAgent(caller.accountId, id);
            await h.rateLimit(
              `agents:sim:${caller.userId}`,
              60,
              600,
              "Muitos testes seguidos. Espere uns minutos.",
            );
            const raw = Array.isArray(body["history"]) ? (body["history"] as unknown[]) : [];
            const history = raw
              .map((m) => m as { role?: unknown; content?: unknown })
              .filter(
                (m) =>
                  (m.role === "user" || m.role === "assistant") && typeof m.content === "string",
              )
              .map((m) => ({
                role: m.role as "user" | "assistant",
                content: String(m.content).slice(0, 2000),
              }))
              .slice(-16);
            if (!history.length || history[history.length - 1]!.role !== "user")
              throw new h.HttpError(400, "Escreva uma mensagem de cliente", "empty");
            const { simulate } = await import("@/backend/agents/orchestrator.server");
            const started = Date.now();
            return h.json({
              ...(await simulate(caller.accountId, id, history)),
              ms: Date.now() - started,
            });
          }
          if (action === "approval.decide") {
            const id = body["approvalId"];
            const decision = body["decision"];
            if (!h.isUuid(id)) throw new h.HttpError(400, "Aprovação inválida", "bad_approval");
            if (decision !== "approve" && decision !== "reject")
              throw new h.HttpError(400, "Decida aprovar ou recusar", "bad_decision");
            const { data: own } = await h
              .admin()
              .from("agent_approvals")
              .select("id")
              .eq("id", id)
              .eq("account_id", caller.accountId)
              .maybeSingle();
            if (!own) throw new h.HttpError(404, "Aprovação não encontrada", "not_found");
            const { decideApproval } = await import("@/backend/agents/orchestrator.server");
            const r = await decideApproval(id, decision, caller.userId).catch((err: unknown) => {
              throw new h.HttpError(
                409,
                err instanceof Error ? err.message : String(err),
                "approval_failed",
              );
            });
            return h.json(r);
          }
          if (action === "engine.set") {
            const engine = body["engine"] === "agents_sdk" ? "agents_sdk" : "classic";
            const adminCaller = await h.requireMember(req, body.accountId, "admin");
            const db = h.admin();
            const { data: acc } = await db
              .from("accounts")
              .select("settings")
              .eq("id", adminCaller.accountId)
              .single();
            const cur = (acc?.settings ?? {}) as Record<string, unknown>;
            const ai = (cur["ai"] ?? {}) as Record<string, unknown>;
            const { error } = await db
              .from("accounts")
              .update({ settings: { ...cur, ai: { ...ai, engine } } as never })
              .eq("id", adminCaller.accountId);
            if (error) throw new h.HttpError(500, "Não consegui salvar o motor", "save_failed");
            return h.json({ engine });
          }
          if (action === "suite.generate") {
            const id = agentId();
            await h.rateLimit(`agents:suite:${caller.accountId}`, 20, 600);
            return h.json(await ev.generateSuite(caller.accountId, id, caller.userId));
          }
          if (action === "eval.estimate") {
            const id = agentId();
            await ensureAgent(caller.accountId, id);
            return h.json(await ev.estimate(caller.accountId, id));
          }
          if (action === "eval.start") {
            const id = agentId();
            await ensureAgent(caller.accountId, id);
            if (body["confirmCost"] !== true)
              throw new h.HttpError(
                400,
                "Confirme o custo estimado antes de rodar",
                "confirm_cost",
              );
            await h.rateLimit(
              `agents:eval:${caller.accountId}`,
              10,
              3600,
              "Muitas avaliações nesta hora.",
            );
            return h.json(
              await ev.startRun(caller.accountId, id, caller.userId, body["activate"] === true),
            );
          }

          // ── Composio (só administrador mexe na chave) ──
          const cp = await import("@/backend/agents/composio.server");
          if (action === "composio.save_key") {
            const admin = await h.requireMember(req, body.accountId, "admin");
            return h.json({ message: await cp.saveKey(admin.accountId, str("apiKey", 300)) });
          }
          if (action === "composio.test")
            return h.json({ message: await cp.testKey(caller.accountId) });
          if (action === "composio.connect")
            return h.json(
              await cp.connectLink(caller.accountId, caller.userId, str("toolkit", 60)),
            );
          if (action === "composio.refresh")
            return h.json({ connections: await cp.refreshConnections(caller.accountId) });
          if (action === "composio.disconnect") {
            await cp.disconnect(caller.accountId, str("toolkit", 60));
            return h.json({ ok: true });
          }
          if (action === "composio.tools")
            return h.json({ tools: await cp.listTools(caller.accountId, str("toolkit", 60)) });
          throw new h.HttpError(400, "Ação inválida", "bad_action");
        };
        return h.handle(async (req) => {
          try {
            return await run(req);
          } catch (err) {
            if (err instanceof h.HttpError) throw err;
            // erro da IA ou inesperado: o usuário recebe o que aconteceu e o que fazer
            const { friendlyAiError } = await import("@/backend/agents/ai-errors");
            const f = friendlyAiError(err);
            console.error("[agents]", f?.code ?? "inesperado", err);
            if (f) throw new h.HttpError(f.status, f.message, f.code);
            throw new h.HttpError(
              500,
              "Não deu para concluir agora. Tente de novo em instantes; se continuar, avise o suporte.",
              "failed",
            );
          }
        })(ctx);
      },
    },
  },
});
