// Uma rodada da conversa de implantação: grava a fala (sem segredo), chama a IA com as
// ferramentas até ela responder, executa o que ela pediu e grava a resposta com as ações.
import { admin, type Caller } from "@/backend/http.server";
import { callTools } from "@/backend/agents/llm-tools.server";
import { resultText, type Turn } from "@/backend/agents/tool-loop";

import { redact } from "./redact";
import { REPLY, SETUP_TOOLS, setupSystem } from "./spec";
import {
  loadFacts,
  loadSnapshot,
  runSetupTool,
  type SetupAction,
  type SetupCtx,
} from "./tools.server";

const MAX_STEPS = 6;
const FORCE_REPLY_AT = 3;
const HISTORY = 30;
// ferramentas que recebem segredo: o argumento nunca vai para o log
const SECRET_TOOLS = new Set(["conectar_integracao", "conectar_zernio"]);

export interface SetupReply {
  message: {
    id: string;
    role: "assistant";
    content: string;
    actions: SetupAction[];
    created_at: string;
  };
  used: string[];
}

async function history(accountId: string): Promise<Turn[]> {
  const { data } = await admin()
    .from("setup_messages")
    .select("role, content")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(HISTORY);
  return (data ?? [])
    .reverse()
    .map((m) =>
      m.role === "user"
        ? { role: "user" as const, content: m.content }
        : { role: "assistant" as const, content: m.content },
    );
}

function argNames(a: Record<string, unknown>): string[] {
  const inner = a["campos"];
  const names = Object.keys(a);
  if (inner && typeof inner === "object")
    names.push(...Object.keys(inner).map((k) => `campos.${k}`));
  if (typeof inner === "string") names.push("campos(texto)");
  return names;
}

/** Se a IA não escrever nada, a pessoa ao menos sabe o que foi feito. */
export function summaryOf(actions: SetupAction[]): string {
  const done = actions.filter((a) => a.kind !== "error").map((a) => a.label);
  const failed = actions.filter((a) => a.kind === "error").map((a) => a.label);
  const parts = [
    done.length ? `Feito: ${done.join("; ")}.` : "",
    failed.length ? `Não consegui: ${failed.join("; ")}.` : "",
  ].filter(Boolean);
  return `${parts.join(" ") || "Entendi."} O que mais você quer configurar?`;
}

function firstName(caller: Caller) {
  return caller.email?.split("@")[0]?.split(/[._-]/)[0] ?? "a pessoa";
}

export async function runSetupTurn(
  req: Request,
  caller: Caller,
  text: string,
): Promise<SetupReply> {
  const db = admin();
  const said = text.trim().slice(0, 8000);
  const { text: safe } = redact(said);
  const past = await history(caller.accountId);
  await db
    .from("setup_messages")
    .insert({ account_id: caller.accountId, user_id: caller.userId, role: "user", content: safe });

  const ctx: SetupCtx = {
    req,
    caller,
    // o histórico gravado não tem as chaves (••••); por isso a mensagem atual entra inteira
    userText: [
      ...past.filter((t) => t.role === "user").map((t) => (t as { content: string }).content),
      said,
    ].join("\n"),
  };
  const actions: SetupAction[] = [];
  const used: string[] = [];
  // a IA vê o valor real só nesta rodada (para guardar no cofre); o histórico fica com ••••
  const turns: Turn[] = [...past, { role: "user", content: said }];
  let answer = "";

  const seen = new Map<string, string>(); // ferramenta+argumentos → resultado (não repete na rodada)
  for (let step = 0; step < MAX_STEPS && !answer; step++) {
    const [snapshot, facts] = await Promise.all([
      loadSnapshot(caller.accountId),
      loadFacts(caller.accountId),
    ]);
    const system = setupSystem({
      snapshot,
      facts,
      person: firstName(caller),
      today: new Date().toLocaleDateString("pt-BR", {
        dateStyle: "full",
        timeZone: "America/Sao_Paulo",
      }),
    });
    // a partir da 4ª volta só sobra responder: a pessoa sempre recebe uma resposta
    const tools = step >= FORCE_REPLY_AT ? [REPLY] : SETUP_TOOLS;
    const r = await callTools(caller.accountId, "setup_agent", {
      system,
      turns,
      tools,
      maxTokens: 2000,
    });
    const reply = r.calls.find((c) => c.name === REPLY.name);
    const work = r.calls.filter((c) => c.name !== REPLY.name);
    if (!r.calls.length) {
      answer = r.text;
      break;
    }
    if (work.length) {
      // blocos crus só quando todas as chamadas seguem (resultado para cada tool_use do bloco)
      turns.push({
        role: "assistant_tools",
        text: r.text,
        calls: work,
        raw: work.length === r.calls.length ? r.raw : undefined,
      });
      const results = [];
      for (const c of work) {
        const sig = `${c.name}:${JSON.stringify(c.args)}`;
        const started = Date.now();
        let content: string;
        let isError = false;
        if (seen.has(sig)) {
          content = `(já feito nesta conversa: ${seen.get(sig)!.slice(0, 300)}) Não repita; responda à pessoa.`;
        } else {
          try {
            const out = await runSetupTool(ctx, c.name, c.args);
            content = resultText(out.content, 16_000);
            if (out.action) actions.push(out.action);
            used.push(c.name);
          } catch (err) {
            isError = true;
            content = `ERRO: ${err instanceof Error ? err.message : String(err)}`;
            actions.push({ kind: "error", label: content.slice(6, 160), tool: c.name });
          }
          seen.set(sig, content);
          await db.from("agent_tool_calls").insert({
            account_id: caller.accountId,
            kind: "setup",
            tool: c.name,
            // de ferramenta com segredo, só os nomes dos campos (nunca os valores)
            args: (SECRET_TOOLS.has(c.name)
              ? { redigido: true, campos: argNames(c.args) }
              : c.args) as never,
            ok: !isError,
            error: isError ? content.slice(0, 500) : null,
            latency_ms: Date.now() - started,
          });
        }
        results.push({ id: c.id, name: c.name, content: redact(content).text, isError });
      }
      turns.push({ role: "tool_results", results });
    }
    if (reply) answer = String(reply.args["mensagem"] ?? "").trim();
  }
  if (!answer) answer = summaryOf(actions);

  const final = redact(answer.trim() || "Pronto. O que mais posso configurar para você?").text;
  const { data, error } = await db
    .from("setup_messages")
    .insert({
      account_id: caller.accountId,
      role: "assistant",
      content: final.slice(0, 20_000),
      actions: actions as never,
    })
    .select("id, created_at")
    .single();
  if (error || !data) throw new Error(`histórico: ${error?.message ?? "sem linha"}`);
  return {
    message: {
      id: data.id,
      role: "assistant",
      content: final,
      actions,
      created_at: data.created_at,
    },
    used,
  };
}
