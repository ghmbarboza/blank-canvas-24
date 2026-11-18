// Abre uma marcação do supervisor (supervisor_flags). O índice único é PARCIAL
// (conversation_id, kind) where status = 'open' — permite reabrir uma marcação fechada —, e o
// upsert do PostgREST não consegue usá-lo (42P10 calado: a tabela ficou com 0 linhas até 28/10).
// Por isso: insert simples, e 23505 (já existe uma ABERTA igual) é resultado esperado, não erro.
import { admin } from "@/backend/http.server";
import type { TablesInsert } from "@/integrations/supabase/types";

export type FlagRow = TablesInsert<"supervisor_flags">;

/** O que o insert quis dizer: criou, já havia aberta, ou falhou de verdade. */
export function flagOutcome(
  error: { code?: string; message?: string } | null,
): "created" | "already_open" | "failed" {
  if (!error) return "created";
  return error.code === "23505" ? "already_open" : "failed";
}

export async function openFlag(row: FlagRow): Promise<{ created: boolean; id: string | null }> {
  const { data, error } = await admin().from("supervisor_flags").insert(row).select("id").single();
  const out = flagOutcome(error);
  if (out === "failed") throw new Error(`marcação do supervisor: ${error?.message ?? "sem linha"}`);
  return { created: out === "created", id: data?.id ?? null };
}
