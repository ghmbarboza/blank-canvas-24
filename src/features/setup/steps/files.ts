// O que a base de conhecimento aceita pela tela, e por que um arquivo é recusado. Puro.
export const ACCEPT = ".pdf,.docx,.txt,.md";
const ACCEPTED = /\.(pdf|docx|txt|md)$/i;
export const MAX_BYTES = 20 * 1024 * 1024;

type Picked = Pick<File, "name" | "size">;

/** Separa o que dá para ler do que não dá, com o motivo em português. */
export function sortFiles<T extends Picked>(files: T[]): { ok: T[]; refused: string[] } {
  const ok: T[] = [];
  const refused: string[] = [];
  for (const f of files) {
    if (!ACCEPTED.test(f.name)) refused.push(`${f.name}: use PDF, Word (.docx) ou texto (.txt)`);
    else if (f.size > MAX_BYTES) refused.push(`${f.name}: passa de 20 MB, divida o arquivo`);
    else if (f.size === 0) refused.push(`${f.name}: o arquivo está vazio`);
    else ok.push(f);
  }
  return { ok, refused };
}
