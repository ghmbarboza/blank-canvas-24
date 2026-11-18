import { createFileRoute } from "@tanstack/react-router";

// Qualidade: formulários, configuração, teste, reavaliação, calibração, contestação e cenário de treino.
export const Route = createFileRoute("/api/quality")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/backend/http.server")).preflight(),
      POST: async (ctx) => {
        const h = await import("@/backend/http.server");
        return h.handle(async (req) => {
          const body = await h.readJson<Record<string, unknown>>(req);
          const a = await import("@/backend/quality/actions.server");
          const action = String(body["action"] ?? "");
          // Contestar é do atendente; o resto é do gestor.
          if (action === "dispute.open") {
            const caller = await h.requireMember(req, body["accountId"], "member");
            await h.rateLimit(`quality:dispute:${caller.userId}`, 20, 3600);
            return h.json(await a.openDispute(caller, body));
          }
          const caller = await h.requireMember(req, body["accountId"], "manager");
          switch (action) {
            case "form.save":
              return h.json(
                await a.saveForm(caller, (body["form"] ?? {}) as Record<string, unknown>),
              );
            case "form.template":
              return h.json(await a.formFromTemplate(caller, body["key"]));
            case "settings.save":
              return h.json(
                await a.saveSettings(caller, (body["settings"] ?? {}) as Record<string, unknown>),
              );
            case "test": {
              await h.rateLimit(`quality:test:${caller.accountId}`, 10, 3600);
              return h.json(await a.testNow(caller));
            }
            case "evaluation.retry": {
              if (!h.isUuid(body["evaluationId"]))
                throw new h.HttpError(400, "Avaliação inválida", "bad_id");
              await h.rateLimit(`quality:retry:${caller.accountId}`, 60, 3600);
              const { reevaluate } = await import("@/backend/quality/evaluate.server");
              return h.json(await reevaluate(caller.accountId, body["evaluationId"] as string));
            }
            case "calibration.sample":
              return h.json(await a.calibrationSample(caller, body["size"]));
            case "calibration.save":
              return h.json(await a.saveCalibration(caller, body));
            case "dispute.decide":
              return h.json(await a.decideDispute(caller, body));
            case "training.scenario": {
              await h.rateLimit(`quality:scenario:${caller.accountId}`, 20, 3600);
              return h.json(
                await a.scenarioFromWeakness(caller, body["criterionId"], body["label"]),
              );
            }
            default:
              throw new h.HttpError(400, "Ação inválida", "bad_action");
          }
        })(ctx);
      },
    },
  },
});
