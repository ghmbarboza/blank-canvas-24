// Busca na base de conhecimento (RAG) num lugar só: vetor da pergunta pelo mesmo modelo que
// gravou os trechos + texto em português, fundidos por RRF no banco (kb_search).
import { admin } from "@/backend/http.server";
import { embedOne, vectorLiteral } from "@/backend/llm.server";

export interface KbHit {
  id: string;
  title: string;
  slug: string;
  category: string | null;
  body_md: string;
  visibility: string;
  score: number;
}

export async function searchKb(
  accountId: string,
  question: string,
  opts: { query?: string; limit?: number; publicOnly?: boolean; semantic?: boolean } = {},
): Promise<KbHit[]> {
  const q = question.trim();
  if (!q) return [];
  const vec = opts.semantic === false ? null : await embedOne(accountId, q).catch(() => null);
  const { data, error } = await admin().rpc("kb_search", {
    _account: accountId,
    _query: (opts.query ?? q).slice(0, 500),
    ...(vec ? { _embedding: vectorLiteral(vec.vector), _model: vec.model } : {}),
    _limit: opts.limit ?? 4,
    _public_only: opts.publicOnly ?? false,
  });
  if (error) throw new Error(`busca na base: ${error.message}`);
  return (data ?? []) as KbHit[];
}
