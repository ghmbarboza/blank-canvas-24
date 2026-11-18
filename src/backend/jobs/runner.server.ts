// Executa os jobs vencidos e despacha o outbox de eventos. Chamado pelo tick do agendador (cron).
import { HttpError, admin } from "@/backend/http.server";
import { NotConfigured } from "@/backend/integrations.server";
import { jobModule, moduleEnabled } from "@/backend/modules.server";
import { SERVICES } from "@/features/health/heartbeats";
import { handlerFor, periodicTasks, type Job } from "./registry.server";
import { loadAllHandlers } from "./handlers.server";
import { dispatchDomainEvents, deliverWebhooks } from "./webhooks.server";

const MAX_MS = 20_000; // a rota tem ~25 s de orçamento; sobra margem para responder

export interface TickReport {
  jobs: { ok: number; failed: number; unknown: number };
  events: number;
  subscriber_errors: string[];
  webhooks: { delivered: number; failed: number };
  ms: number;
}

export async function runTick(): Promise<TickReport> {
  loadAllHandlers();
  const started = Date.now();
  const report: TickReport = {
    jobs: { ok: 0, failed: 0, unknown: 0 },
    events: 0,
    subscriber_errors: [],
    webhooks: { delivered: 0, failed: 0 },
    ms: 0,
  };

  // Sinal de vida do app: sem ele por 3 min, public.check_service_heartbeats abre alerta.
  const { error: hbError } = await admin().rpc("record_heartbeat", {
    _service: SERVICES.APP_CRON,
    _instance: process.env["VERCEL_REGION"] ?? process.env["FLY_REGION"] ?? "default",
    _meta: { at: new Date(started).toISOString() },
  });
  if (hbError) console.error("[tick] sinal de vida não gravado", hbError.message);

  const dispatched = await dispatchDomainEvents();
  report.events = dispatched.count;
  report.subscriber_errors = dispatched.errors;

  for (const task of periodicTasks()) {
    try {
      await task.fn();
    } catch (err) {
      console.error(`[tick] tarefa periódica ${task.name} falhou`, err);
    }
  }

  await drainJobs(started, MAX_MS, report);

  const wh = await deliverWebhooks(Math.max(2_000, MAX_MS - (Date.now() - started)));
  report.webhooks = wh;
  report.ms = Date.now() - started;
  return report;
}

// Executa os trabalhos vencidos até acabar o tempo. Reserva com claim_jobs (prazo de 120 s): duas
// execuções ao mesmo tempo nunca pegam o mesmo trabalho.
async function drainJobs(started: number, budgetMs: number, report: TickReport): Promise<void> {
  while (Date.now() - started < budgetMs) {
    const { data, error } = await admin().rpc("claim_jobs", { _limit: 10, _lease_seconds: 120 });
    if (error) throw new Error(`claim_jobs: ${error.message}`);
    const jobs = (data ?? []) as Job[];
    if (jobs.length === 0) break;
    await Promise.all(
      jobs.map(async (job) => {
        const fn = handlerFor(job.kind);
        if (!fn) {
          report.jobs.unknown += 1;
          await admin().rpc("finish_job", {
            _id: job.id,
            _ok: false,
            _error: `tipo desconhecido: ${job.kind}`,
          });
          return;
        }
        try {
          // Recurso extra desligado na conta: não roda (S3). Termina como pulado, com o motivo.
          const mod = jobModule(job.kind);
          if (mod && job.account_id && !(await moduleEnabled(job.account_id, mod))) {
            report.jobs.ok += 1;
            await admin().rpc("finish_job", {
              _id: job.id,
              _ok: true,
              _result: { skipped: `recurso ${mod} desligado` } as never,
            });
            return;
          }
          const result = await fn(job);
          await admin().rpc("finish_job", {
            _id: job.id,
            _ok: true,
            _result: (result ?? null) as never,
          });
          report.jobs.ok += 1;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          // Integração não conectada não melhora tentando de novo: encerra como pulado, com o motivo.
          if (isNotConfigured(err)) {
            report.jobs.ok += 1;
            await admin().rpc("finish_job", {
              _id: job.id,
              _ok: true,
              _result: { skipped: msg } as never,
            });
            return;
          }
          report.jobs.failed += 1;
          await admin().rpc("finish_job", { _id: job.id, _ok: false, _error: msg });
        }
      }),
    );
  }
}

const FAST_MS = 20_000;
/** Esperas dentro da via rápida para pegar a resposta da IA sem depender da próxima batida. */
const REPLY_WAITS_MS = [600, 800, 1_200] as const;

/**
 * Via rápida (pg_cron a cada 5 s): só eventos e trabalhos vencidos, sem tarefas periódicas nem
 * webhooks de saída. É o que faz a IA responder em segundos em vez de esperar o tique do minuto.
 */
export async function runFastTick(): Promise<TickReport> {
  loadAllHandlers();
  const started = Date.now();
  const report: TickReport = {
    jobs: { ok: 0, failed: 0, unknown: 0 },
    events: 0,
    subscriber_errors: [],
    webhooks: { delivered: 0, failed: 0 },
    ms: 0,
  };
  const dispatched = await dispatchDomainEvents();
  report.events = dispatched.count;
  report.subscriber_errors = dispatched.errors;
  await drainJobs(started, FAST_MS, report);
  // Chegou mensagem nesta rodada: a resposta da IA foi agendada para daqui a 1 a 3 s. Em vez de
  // devolver e esperar a próxima batida do agendador (mais 0 a 5 s), espera aqui e roda de novo.
  if (dispatched.count > 0) {
    for (const waitMs of REPLY_WAITS_MS) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      await drainJobs(started, FAST_MS, report);
    }
  }
  report.ms = Date.now() - started;
  return report;
}

function isNotConfigured(err: unknown): boolean {
  return err instanceof NotConfigured || (err instanceof HttpError && err.status === 412);
}
