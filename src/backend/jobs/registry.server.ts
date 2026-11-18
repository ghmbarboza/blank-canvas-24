// Registro dos tipos de job. Cada fase acrescenta os seus handlers aqui.
import type { Database } from "@/integrations/supabase/types";

export type Job = Database["public"]["Tables"]["jobs"]["Row"];
export type JobResult = Record<string, unknown> | void;
export type JobHandler = (job: Job) => Promise<JobResult>;

const handlers = new Map<string, JobHandler>();

export function registerJob(kind: string, handler: JobHandler) {
  handlers.set(kind, handler);
}

export function handlerFor(kind: string): JobHandler | undefined {
  return handlers.get(kind);
}

export function registeredKinds(): string[] {
  return [...handlers.keys()].sort();
}

// Tarefas periódicas: rodam a cada tick do agendador (1 min), antes da fila de jobs.
// Cada uma deve ser curta e idempotente (ex.: despachar campanhas, vigiar saldo).
type Periodic = { name: string; fn: () => Promise<void> };
const periodic: Periodic[] = [];

export function registerPeriodic(name: string, fn: () => Promise<void>) {
  if (!periodic.some((p) => p.name === name)) periodic.push({ name, fn });
}

export function periodicTasks(): readonly Periodic[] {
  return periodic;
}
