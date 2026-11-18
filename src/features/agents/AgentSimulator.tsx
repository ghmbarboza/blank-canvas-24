import { useRef, useState } from "react";
import {
  ArrowRightLeft,
  Check,
  Hand,
  Loader2,
  RotateCcw,
  Send,
  UserRound,
  Wrench,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";

import { agentsApi, type Agent, type SimResult } from "./api";
import { useDecideApproval } from "./autopilot/api";

type Line =
  | { kind: "user"; text: string }
  | { kind: "ai"; text: string; meta: SimResult }
  | { kind: "error"; text: string };

// Simulador lateral: o gestor faz o papel do cliente. Ações que mudariam algo (marcar, cobrar)
// rodam simuladas; nada sai para cliente de verdade.
export function AgentSimulator({ accountId, agent }: { accountId: string; agent: Agent }) {
  const [lines, setLines] = useState<Line[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [decided, setDecided] = useState<Record<string, "approve" | "reject">>({});
  const decide = useDecideApproval(accountId);
  const end = useRef<HTMLDivElement>(null);

  // piloto automático: a rodada parou na ação sensível; aqui o gestor faz o papel do aprovador
  function settle(meta: SimResult, decision: "approve" | "reject") {
    if (!meta.approvalId) return;
    const id = meta.approvalId;
    setDecided((d) => ({ ...d, [id]: decision }));
    decide.mutate(
      { approvalId: id, decision },
      {
        onSuccess: (r) =>
          setLines((cur) => [
            ...cur,
            {
              kind: "ai",
              text: r.reply,
              meta: {
                ...meta,
                reply: r.reply,
                agent: r.agent ?? meta.agent,
                approvalId: null,
                handoffs: [],
                toolsCalled: [],
                ms: 0,
              },
            },
          ]),
        onError: (e) => setLines((cur) => [...cur, { kind: "error", text: errorMessage(e) }]),
      },
    );
  }

  async function send() {
    const msg = text.trim();
    if (!msg || busy) return;
    const next: Line[] = [...lines, { kind: "user", text: msg }];
    setLines(next);
    setText("");
    setBusy(true);
    const history = next
      .filter((l): l is Exclude<Line, { kind: "error" }> => l.kind !== "error")
      .map((l) => ({ role: l.kind === "user" ? "user" : "assistant", content: l.text }));
    try {
      const r = await agentsApi<SimResult>(accountId, "agent.simulate", {
        agentId: agent.id,
        history,
      });
      setLines((cur) => [...cur, { kind: "ai", text: r.reply || "(sem resposta)", meta: r }]);
    } catch (e) {
      setLines((cur) => [...cur, { kind: "error", text: errorMessage(e) }]);
    } finally {
      setBusy(false);
      requestAnimationFrame(() => end.current?.scrollIntoView({ behavior: "smooth" }));
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto bg-background px-5 py-4" aria-live="polite">
        {lines.length === 0 && (
          <p className="mx-auto max-w-sm py-10 text-center text-[13px] text-muted-foreground">
            Escreva como um cliente escreveria. Teste uma dúvida da sua base, um pedido de desconto
            fora da regra e um "quero falar com uma pessoa". Nada é enviado de verdade.
          </p>
        )}
        {lines.map((l, i) =>
          l.kind === "user" ? (
            <div
              key={i}
              className="ml-auto max-w-[80%] rounded-2xl rounded-br-md bg-surface px-3.5 py-2 text-[14px]"
            >
              {l.text}
            </div>
          ) : l.kind === "error" ? (
            <p key={i} className="text-[13px] text-danger">
              {l.text}
            </p>
          ) : (
            <div key={i} className="max-w-[85%]">
              <div className="rounded-2xl rounded-bl-md bg-primary px-3.5 py-2 text-[14px] whitespace-pre-wrap text-primary-foreground">
                {l.text}
              </div>
              <Meta r={l.meta} />
              {l.meta.approvalId ? (
                <div className="mt-2 rounded-xl border border-primary-line bg-primary-soft p-2.5">
                  <p className="flex items-center gap-1.5 text-[12px] font-medium">
                    <Hand className="size-3.5" /> Esperando o seu sim:{" "}
                    {l.meta.reason.replace(/^aguardando aprovação: /, "")}
                  </p>
                  {decided[l.meta.approvalId] ? (
                    <p className="mt-1.5 text-[11.5px] text-muted-foreground">
                      {decided[l.meta.approvalId] === "approve" ? "Aprovado" : "Recusado"}
                      {decide.isPending ? "… retomando" : ""}
                    </p>
                  ) : (
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => settle(l.meta, "reject")}>
                        <X className="size-3.5" /> Recusar
                      </Button>
                      <Button size="sm" onClick={() => settle(l.meta, "approve")}>
                        <Check className="size-3.5" /> Aprovar
                      </Button>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          ),
        )}
        {busy && (
          <p className="flex items-center gap-2 text-[12px] text-subtle">
            <Loader2 className="size-3.5 animate-spin" /> {agent.name} está digitando…
          </p>
        )}
        <div ref={end} />
      </div>
      <form
        className="flex items-end gap-2 border-t border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Recomeçar conversa"
          onClick={() => setLines([])}
        >
          <RotateCcw />
        </Button>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={1}
          placeholder="Mensagem do cliente…"
          className="min-h-10 flex-1 resize-none"
          aria-label="Mensagem do cliente"
        />
        <Button type="submit" size="icon" disabled={busy || !text.trim()} aria-label="Enviar">
          <Send />
        </Button>
      </form>
    </div>
  );
}

function Meta({ r }: { r: SimResult }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-subtle">
      {r.agent && <span>{r.agent}</span>}
      {r.handoffs.map((h, i) => (
        <span key={i} className="inline-flex items-center gap-1">
          <ArrowRightLeft className="size-3" aria-hidden /> {h.split(":")[0]}
        </span>
      ))}
      {r.action === "handoff" && (
        <span className={cn("inline-flex items-center gap-1 text-foreground")}>
          <UserRound className="size-3" aria-hidden /> passou para a equipe: {r.reason}
        </span>
      )}
      {r.toolsCalled.length > 0 && (
        <span className="inline-flex items-center gap-1">
          <Wrench className="size-3" aria-hidden /> {r.toolsCalled.join(", ")}
        </span>
      )}
      <span className="tabular-nums">{(r.ms / 1000).toFixed(1)} s</span>
    </div>
  );
}
