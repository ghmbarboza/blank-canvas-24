// Contrato das ferramentas da assistente: o que cada uma recebe e o que devolve para a IA (texto)
// e para a tela (ação com botão, ou um bloco desenhado dentro da conversa).
import type { Caller } from "@/backend/http.server";

import type { StageBlock } from "./stage";

export interface SetupAction {
  kind: "link" | "open" | "done" | "error";
  label: string;
  url?: string;
  to?: string;
  tool: string;
}

export interface ToolRun {
  content: string;
  action?: SetupAction;
  /** bloco que a própria ferramenta desenha na conversa (QR Code, prévia do site, resumo) */
  block?: StageBlock;
  /** valores que são segredo nesta rodada (chave colada): somem do histórico gravado */
  secrets?: string[];
}

export interface SetupCtx {
  req: Request;
  caller: Caller;
  /** O que a pessoa escreveu (esta mensagem e as anteriores): prova de que um e-mail ou uma chave veio dela. */
  userText: string;
}

export type Runner = (ctx: SetupCtx, args: Record<string, unknown>) => Promise<ToolRun>;

export const s = (v: unknown, max = 4000) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Número vindo do modelo (às vezes como texto): inteiro dentro do intervalo, ou null. */
export function intArg(v: unknown, min: number, max: number): number | null {
  const n =
    typeof v === "number"
      ? v
      : typeof v === "string" && v.trim()
        ? Number(v.replace(",", "."))
        : NaN;
  if (!Number.isFinite(n)) return null;
  return Math.max(min, Math.min(max, Math.round(n)));
}

/** true/false vindo do modelo (aceita "sim", "true", "ligar"). undefined = não informado. */
export function boolArg(v: unknown): boolean | undefined {
  if (typeof v === "boolean") return v;
  if (typeof v !== "string") return undefined;
  const t = v.trim().toLowerCase();
  if (["true", "sim", "s", "ligar", "ligado", "on", "1"].includes(t)) return true;
  if (["false", "nao", "não", "n", "desligar", "desligado", "off", "0"].includes(t)) return false;
  return undefined;
}

/** Lista vinda do modelo: array, texto JSON ou um objeto só. */
export function listArg(v: unknown): Record<string, unknown>[] {
  let list: unknown = v;
  if (typeof v === "string") {
    try {
      list = JSON.parse(v);
    } catch {
      return [];
    }
  }
  if (list && typeof list === "object" && !Array.isArray(list)) list = [list];
  return Array.isArray(list)
    ? list.filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null)
    : [];
}

// Site, documento e pesquisa podem trazer instrução escondida. Ação que dá acesso (convite) ou que
// grava credencial só roda com valor que a própria pessoa escreveu na conversa.
export function fromPerson(userText: string, value: string, what: string) {
  if (!value || !userText.includes(value))
    throw new Error(
      `${what} precisa ser escrito por você na conversa; não uso valor vindo de site ou documento`,
    );
}
