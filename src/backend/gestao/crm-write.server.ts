// Escrita no CRM local usada pelo importador e pela sincronização: acha ou cria funil e etapa,
// e resolve a etapa certa para a situação do negócio. Sempre com account_id explícito.
import { admin } from "@/backend/http.server";

export interface StageRow {
  id: string;
  pipeline_id: string;
  name: string;
  kind: string;
  position: number;
}

export interface PipelineCache {
  pipelines: { id: string; name: string; is_default: boolean }[];
  stages: StageRow[];
}

export async function loadPipelines(accountId: string): Promise<PipelineCache> {
  const db = admin();
  const [{ data: pipelines, error: e1 }, { data: stages, error: e2 }] = await Promise.all([
    db
      .from("pipelines")
      .select("id, name, is_default")
      .eq("account_id", accountId)
      .order("position"),
    db
      .from("pipeline_stages")
      .select("id, pipeline_id, name, kind, position")
      .eq("account_id", accountId)
      .order("position"),
  ]);
  if (e1 || e2) throw new Error(`Não deu para ler os funis: ${(e1 ?? e2)?.message}`);
  return { pipelines: pipelines ?? [], stages: stages ?? [] };
}

const DEFAULT_STAGES = [
  { name: "Novo", kind: "open", probability: 10, color: "slate" },
  { name: "Em conversa", kind: "open", probability: 30, color: "sky" },
  { name: "Proposta", kind: "open", probability: 60, color: "amber" },
  { name: "Ganho", kind: "won", probability: 100, color: "emerald" },
  { name: "Perdido", kind: "lost", probability: 0, color: "rose" },
];

/** Funil pelo nome; sem nome, o padrão; sem nenhum funil na conta, cria "Vendas". */
export async function resolvePipeline(
  accountId: string,
  cache: PipelineCache,
  name: string | null,
  createIfMissing: boolean,
): Promise<string> {
  const db = admin();
  const wanted = (name ?? "").trim().toLowerCase();
  if (wanted) {
    const hit = cache.pipelines.find((p) => p.name.trim().toLowerCase() === wanted);
    if (hit) return hit.id;
  }
  if (!wanted || !createIfMissing) {
    const def = cache.pipelines.find((p) => p.is_default) ?? cache.pipelines[0];
    if (def) return def.id;
  }
  const { data, error } = await db
    .from("pipelines")
    .insert({
      account_id: accountId,
      name: (name ?? "Vendas").trim().slice(0, 80) || "Vendas",
      position: cache.pipelines.length,
      is_default: cache.pipelines.length === 0,
    })
    .select("id, name, is_default")
    .single();
  if (error || !data) throw new Error(`Não deu para criar o funil: ${error?.message}`);
  cache.pipelines.push(data);
  const { data: st, error: se } = await db
    .from("pipeline_stages")
    .insert(
      DEFAULT_STAGES.map((s, i) => ({
        account_id: accountId,
        pipeline_id: data.id,
        name: s.name,
        kind: s.kind,
        probability: s.probability,
        color: s.color,
        position: i,
      })),
    )
    .select("id, pipeline_id, name, kind, position");
  if (se) throw new Error(`Não deu para criar as etapas: ${se.message}`);
  cache.stages.push(...(st ?? []));
  return data.id;
}

/**
 * Etapa pelo nome dentro do funil. Ganho/perdido vão para a etapa daquele tipo. Etapa com nome
 * desconhecido é criada (aberta) antes de "Ganho" quando `createIfMissing`.
 */
export async function resolveStage(
  accountId: string,
  cache: PipelineCache,
  pipelineId: string,
  stageName: string | null,
  status: "open" | "won" | "lost" | null,
  createIfMissing: boolean,
): Promise<string> {
  const stages = cache.stages
    .filter((s) => s.pipeline_id === pipelineId)
    .sort((a, b) => a.position - b.position);
  if (status === "won" || status === "lost") {
    const k = stages.find((s) => s.kind === status);
    if (k) return k.id;
  }
  const wanted = (stageName ?? "").trim().toLowerCase();
  if (wanted) {
    const hit = stages.find((s) => s.name.trim().toLowerCase() === wanted);
    if (hit) return hit.id;
    if (createIfMissing) {
      const firstClosed = stages.find((s) => s.kind !== "open");
      const position = firstClosed ? firstClosed.position - 0.5 : stages.length;
      const { data, error } = await admin()
        .from("pipeline_stages")
        .insert({
          account_id: accountId,
          pipeline_id: pipelineId,
          name: stageName!.trim().slice(0, 60),
          kind: "open",
          probability: 30,
          color: "sky",
          position: Math.max(0, Math.round(position)),
        })
        .select("id, pipeline_id, name, kind, position")
        .single();
      if (error || !data) throw new Error(`Não deu para criar a etapa: ${error?.message}`);
      cache.stages.push(data);
      return data.id;
    }
  }
  const firstOpen = stages.find((s) => s.kind === "open") ?? stages[0];
  if (!firstOpen) throw new Error("O funil não tem etapas. Crie uma etapa e tente de novo.");
  return firstOpen.id;
}

export async function linkExternal(
  accountId: string,
  provider: "rdstation_crm" | "hubspot" | "import",
  entity: "contact" | "company" | "deal",
  localId: string,
  externalId: string,
  remoteUpdatedAt: string | null,
  localSyncedAt: string | null,
): Promise<void> {
  const { error } = await admin()
    .from("external_links")
    .upsert(
      {
        account_id: accountId,
        provider,
        entity,
        local_id: localId,
        external_id: externalId.slice(0, 200),
        remote_updated_at: remoteUpdatedAt,
        local_synced_at: localSyncedAt,
      },
      { onConflict: "account_id,provider,entity,local_id" },
    );
  if (error) throw new Error(`Não deu para guardar o vínculo: ${error.message}`);
}

/** Junta campos personalizados sem apagar o que já existe. */
export function mergeCustom(
  current: unknown,
  incoming: Record<string, string>,
  overwrite: boolean,
): Record<string, unknown> {
  const base =
    current && typeof current === "object" && !Array.isArray(current)
      ? (current as Record<string, unknown>)
      : {};
  if (overwrite) return { ...base, ...incoming };
  const out: Record<string, unknown> = { ...incoming, ...base };
  for (const [k, v] of Object.entries(base)) if (v === null || v === "") out[k] = incoming[k] ?? v;
  return out;
}
