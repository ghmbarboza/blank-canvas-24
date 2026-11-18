// As ferramentas da conversa no formato do AI SDK. Separado do servidor para ser testável com um
// modelo simulado: quem chama injeta como rodar a ferramenta e como registrar. O modelo recebe só
// o texto do resultado; o bloco e a ação vão para a tela (e nunca voltam para o contexto da IA).
import { jsonSchema, tool, type JSONSchema7, type ToolSet } from "ai";

import type { ToolSpec } from "@/backend/agents/tool-loop";

import { redact } from "./redact";
import type { SetupAction, ToolRun } from "./runner-types";
import { toBlock, type StageBlock, type StoredPart } from "./stage";

export interface ToolOutput {
  ok: boolean;
  resultado?: string;
  erro?: string;
  nota?: string;
  acao?: SetupAction;
  bloco?: StageBlock;
}

export interface ToolLog {
  tool: string;
  args: Record<string, unknown>;
  ok: boolean;
  error: string | null;
  latencyMs: number;
}

export interface WorkDeps {
  specs: readonly ToolSpec[];
  run: (name: string, args: Record<string, unknown>) => Promise<ToolRun>;
  /** o que a rodada desenhou e fez, na ordem (vai para o histórico gravado) */
  parts: StoredPart[];
  log?: (entry: ToolLog) => Promise<void> | void;
  /** valores que são segredo nesta rodada (somem do histórico e da resposta) */
  onSecrets?: (values: string[]) => void;
}

const MAX_RESULT = 16_000;

/** Tira da frase os segredos conhecidos desta rodada, além dos de formato conhecido. */
export function hideSecrets(text: string, secrets: Iterable<string>): string {
  let out = text;
  for (const v of [...secrets].sort((a, b) => b.length - a.length))
    if (v.length >= 4) out = out.split(v).join("••••");
  return redact(out).text;
}

/** O que a IA lê de volta: só texto (formato aceito por qualquer modelo do gateway). */
export function modelText(o: ToolOutput): string {
  if (o.nota) return o.nota;
  return o.ok ? (o.resultado ?? "feito") : `ERRO: ${o.erro ?? "falhou"}`;
}

export function buildWorkTools(d: WorkDeps): ToolSet {
  const seen = new Map<string, ToolOutput>(); // ferramenta+argumentos → resultado (não repete)
  const known = new Set<string>();
  return Object.fromEntries(
    d.specs.map((spec) => [
      spec.name,
      tool({
        description: spec.description,
        inputSchema: jsonSchema<Record<string, unknown>>(spec.parameters as JSONSchema7),
        execute: async (raw: Record<string, unknown>): Promise<ToolOutput> => {
          const args = raw && typeof raw === "object" ? raw : {};
          const sig = `${spec.name}:${JSON.stringify(args)}`;
          if (seen.has(sig))
            return { ok: true, nota: "Já feito nesta rodada. Não repita; fale com a pessoa." };
          const started = Date.now();
          let out: ToolOutput;
          try {
            const r = await d.run(spec.name, args);
            if (r.secrets?.length) {
              for (const v of r.secrets) known.add(v);
              d.onSecrets?.(r.secrets);
            }
            out = { ok: true, resultado: hideSecrets(r.content.slice(0, MAX_RESULT), known) };
            if (r.block) {
              out.bloco = r.block;
              d.parts.push({ type: "block", block: r.block });
            }
            if (r.action) {
              out.acao = r.action;
              d.parts.push({ type: "action", action: r.action });
            }
          } catch (err) {
            const msg = hideSecrets(err instanceof Error ? err.message : String(err), known);
            const action: SetupAction = {
              kind: "error",
              label: msg.slice(0, 160),
              tool: spec.name,
            };
            out = { ok: false, erro: msg, acao: action };
            d.parts.push({ type: "action", action });
          }
          seen.set(sig, out);
          await Promise.resolve(
            d.log?.({
              tool: spec.name,
              args,
              ok: out.ok,
              error: out.ok ? null : (out.erro ?? "").slice(0, 500),
              latencyMs: Date.now() - started,
            }),
          ).catch(() => undefined);
          return out;
        },
        toModelOutput: ({ output }) => ({ type: "text", value: modelText(output as ToolOutput) }),
      }),
    ]),
  );
}

export function buildStageTools(specs: readonly ToolSpec[], parts: StoredPart[]): ToolSet {
  return Object.fromEntries(
    specs.map((spec) => [
      spec.name,
      tool({
        description: spec.description,
        inputSchema: jsonSchema<Record<string, unknown>>(spec.parameters as JSONSchema7),
        execute: async (args: Record<string, unknown>): Promise<ToolOutput> => {
          try {
            const block = toBlock(spec.name, args ?? {});
            parts.push({ type: "block", block });
            return { ok: true, bloco: block };
          } catch (err) {
            return { ok: false, erro: err instanceof Error ? err.message : String(err) };
          }
        },
        toModelOutput: ({ output }) => {
          const o = output as ToolOutput;
          return {
            type: "text",
            value: o.ok
              ? "Na tela. Agora fale com a pessoa em uma frase e espere a resposta."
              : `ERRO: ${o.erro}`,
          };
        },
      }),
    ]),
  );
}

/** Erro do provedor de IA em frase de dono de empresa (crédito, limite, fora do ar). */
export function friendlyStreamError(err: unknown): string {
  const e = err as { statusCode?: number; message?: string; name?: string } | null;
  const status = e?.statusCode;
  const msg = String(e?.message ?? err ?? "");
  if (status === 402 || /payment required|insufficient|cr[ée]dit|quota exceeded|billing/i.test(msg))
    return "O crédito de IA deste projeto acabou. Recarregue os créditos do workspace e tente de novo; o que já foi configurado continua salvo.";
  if (status === 429 || /rate limit|too many requests/i.test(msg))
    return "Muita gente usando a IA ao mesmo tempo. Espere uns segundos e toque em Tentar de novo.";
  if (/abort|timeout|timed out/i.test(`${e?.name ?? ""} ${msg}`))
    return "Demorei demais para responder. Toque em Tentar de novo: o que já foi feito continua salvo.";
  if (
    (e as { code?: string } | null)?.code === "ai_budget" ||
    /teto mensal|limite mensal/i.test(msg)
  )
    return "O limite mensal de IA desta conta foi atingido. Aumente o limite em Ajustes ou espere o próximo mês; o que já foi configurado continua salvo.";
  if (/Nenhum provedor de IA/i.test(msg))
    return "A IA ainda não está ligada neste projeto. Confira se o projeto tem a IA do Lovable ativa.";
  return "Não consegui responder agora. Toque em Tentar de novo em instantes.";
}
