import { createFileRoute } from "@tanstack/react-router";

// Implantação (Cris). POST { accountId, action }: (restart = refazer do começo)
//   send   { text }                → uma rodada da conversa (a IA configura pelas ferramentas)
//   index  { path, name, mime }    → arquivo já enviado ao bucket kb-docs vira conhecimento
//   soul   {}                      → a "alma do Nexus" (o que a Nexa aprendeu, versionado)
//   start  { name? }               → primeira mensagem da conversa, no passo do roteiro que falta
//   progress {}                    → o roteiro (única fonte do onboarding) para o indicador do layout
// Passo a passo pela tela (formulário e botão, sem passar pela IA):
//   company { name, segment, sells?, tone? } → passo "Sua empresa"
//   knowledge_text { title?, content }       → texto colado vira documento da base
//   agent_state {} | agent_create { name?, greeting? } | agent_activate {} → atendente de pós-venda
// Só dono e administrador configuram a central.
export const Route = createFileRoute("/api/setup-chat")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/backend/http.server")).preflight(),
      POST: async (ctx) => {
        const h = await import("@/backend/http.server");
        return h.handle(async (req) => {
          const body = await h.readJson<{
            accountId?: string;
            action?: string;
            text?: string;
            path?: string;
            name?: string;
            mime?: string;
          }>(req);
          const caller = await h.requireMember(req, body.accountId, "admin");
          if (body.action === "send") {
            const text = String(body.text ?? "").trim();
            if (!text) throw new h.HttpError(400, "Escreva uma mensagem", "empty");
            await h.rateLimit(`setup-chat:${caller.userId}`, 40, 600);
            const { runSetupTurn } = await import("@/backend/setup-agent/agent.server");
            return h.json(await runSetupTurn(req, caller, text));
          }
          if (body.action === "index") {
            await h.rateLimit(`setup-index:${caller.accountId}`, 60, 3600);
            const { indexUploaded } = await import("@/backend/setup-agent/docs.server");
            const r = await indexUploaded(
              caller.accountId,
              caller.userId,
              String(body.path ?? ""),
              String(body.name ?? "arquivo"),
              body.mime ?? null,
            ).catch((err: unknown) => {
              throw new h.HttpError(
                422,
                err instanceof Error ? err.message : String(err),
                "index_failed",
              );
            });
            return h.json(r);
          }
          if (body.action === "company") {
            const { saveCompanyForm } = await import("@/backend/setup-agent/steps.server");
            return h.json(await saveCompanyForm(caller, body as Record<string, unknown>));
          }
          if (body.action === "knowledge_text") {
            await h.rateLimit(`setup-index:${caller.accountId}`, 60, 3600);
            const { saveKnowledgeText } = await import("@/backend/setup-agent/steps.server");
            return h.json(await saveKnowledgeText(caller, body as Record<string, unknown>));
          }
          if (body.action === "agent_state") {
            const { agentStepState } = await import("@/backend/setup-agent/steps.server");
            return h.json(await agentStepState(caller));
          }
          if (body.action === "agent_create") {
            await h.rateLimit(`agents:create:${caller.accountId}`, 20, 600);
            const { createPostSaleAgent } = await import("@/backend/setup-agent/steps.server");
            return h.json(await createPostSaleAgent(caller, body as Record<string, unknown>));
          }
          if (body.action === "agent_activate") {
            await h.rateLimit(
              `agents:eval:${caller.accountId}`,
              10,
              3600,
              "Muitas avaliações nesta hora. Espere um pouco e tente de novo.",
            );
            const { activatePostSaleAgent } = await import("@/backend/setup-agent/steps.server");
            return h.json(await activatePostSaleAgent(caller));
          }
          if (body.action === "progress") {
            const { loadRoteiro } = await import("@/backend/setup-agent/tools.server");
            return h.json(await loadRoteiro(caller.accountId));
          }
          if (body.action === "start") {
            const { startConversation } = await import("@/backend/setup-agent/tools.server");
            const person = String((body as { name?: string }).name ?? "").slice(0, 40);
            return h.json(await startConversation(caller, person));
          }
          if (body.action === "restart") {
            const { restartConversation } = await import("@/backend/setup-agent/tools.server");
            const person = String((body as { name?: string }).name ?? "").slice(0, 40);
            return h.json(await restartConversation(caller, person));
          }
          if (body.action === "soul") {
            const { loadSoul } = await import("@/backend/setup-agent/tools.server");
            return h.json(await loadSoul(caller.accountId));
          }
          throw new h.HttpError(400, "Ação inválida", "bad_action");
        })(ctx);
      },
    },
  },
});
