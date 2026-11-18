// Equipe de IA na fila: avaliação em lotes (agents.eval) e supervisor periódico (5 min por conta).
import { registerJob, registerPeriodic } from "../registry.server";

registerJob("agents.eval", async (job) => {
  const p = job.payload as { run_id?: string; activate?: boolean };
  if (!p.run_id) throw new Error("payload sem avaliação");
  const { runEvalBatch } = await import("@/backend/agents/eval.server");
  return runEvalBatch(p.run_id, p.activate === true);
});

// Suíte de testes do agente recém-criado (casos escritos pela IA a partir da base).
registerJob("agents.suite", async (job) => {
  const p = job.payload as { agent_id?: string; user_id?: string | null };
  if (!p.agent_id || !job.account_id) throw new Error("payload sem agente");
  const { generateSuite } = await import("@/backend/agents/eval.server");
  return generateSuite(job.account_id, p.agent_id, p.user_id ?? null);
});

registerPeriodic("agents.supervisor", async () => {
  const { superviseAll } = await import("@/backend/agents/supervisor.server");
  await superviseAll();
});

export const registered = true;
