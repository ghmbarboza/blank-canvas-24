import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Loader2, Phone, Play, ShieldAlert, Bot, UserRound, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useAccount } from "@/lib/account";
import { formatDateTime, formatPhone } from "@/lib/format";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";

import { telephonyApi, type CallRow } from "./api";
import {
  STATUS_LABEL,
  callNextStep,
  formatClock,
  formatDuration,
  isMissedCall,
  transcriptTurns,
  type CallStatus,
} from "./lib";
import { useSoftphone } from "./softphone/softphone-context";

const SENTIMENT: Record<string, string> = {
  positive: "Positivo",
  neutral: "Neutro",
  negative: "Negativo",
};

interface DetailProps {
  accountId: string;
  call: CallRow;
  agentName?: string | undefined;
  userName?: string | undefined;
  /** Já começa tocando (botão de tocar da lista). */
  autoPlay?: boolean | undefined;
  onClose?: (() => void) | undefined;
  /** No painel lateral o título é h2; dentro do Sheet, o SheetTitle. */
  inSheet?: boolean | undefined;
}

// Detalhe da ligação. A gravação só abre por URL assinada de 10 min, e cada play fica na auditoria.
export function CallDetail({
  accountId,
  call,
  agentName,
  userName,
  autoPlay,
  onClose,
  inSheet,
}: DetailProps) {
  const { current } = useAccount();
  const sp = useSoftphone();
  const [audio, setAudio] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const started = useRef(false);
  const notice = (
    (current?.settings as Record<string, unknown> | undefined)?.["privacy"] as
      { recording_notice?: string } | undefined
  )?.recording_notice;
  const stored = call.recording_status === "stored";

  async function play() {
    setLoading(true);
    try {
      setAudio((await telephonyApi.recording(accountId, call.id)).url);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (autoPlay && stored && !started.current) {
      started.current = true;
      void play();
    }
    // play é estável o bastante: depende só de accountId e call.id, que trocam o componente (key).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPlay, stored]);

  const dc = (call.data_collection ?? {}) as Record<string, { value?: unknown }>;
  const evals = (call.scorecard ?? {}) as Record<string, { result?: string; rationale?: string }>;
  const other = call.direction === "inbound" ? call.from_number : call.to_number;
  const missed = isMissedCall(call);
  const next = callNextStep(call.metadata);
  const turns = transcriptTurns(call.transcript_segments, call.transcript);
  const name = call.contacts?.name ?? (formatPhone(other) || "Número oculto");
  const agentLabel = call.voice_agent_id ? `IA ${agentName ?? "de voz"}` : (userName ?? null);
  const who = agentLabel ?? "Sem atendente";
  const Title = inSheet ? SheetTitle : "h2";
  const Desc = inSheet ? SheetDescription : "p";

  return (
    <div className="space-y-6 px-5 pt-5 pb-10 sm:px-6">
      <header>
        <div className="flex items-center justify-between gap-2">
          <p
            className={cn(
              "text-[11px] font-semibold tracking-[0.14em] uppercase",
              missed ? "text-danger" : "text-subtle",
            )}
          >
            {call.direction === "inbound" ? "Recebida" : "Feita"} ·{" "}
            {STATUS_LABEL[call.status as CallStatus] ?? call.status}
          </p>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar detalhe da ligação"
              className="grid size-8 place-items-center rounded-full border border-border text-muted-foreground hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <X className="size-4" aria-hidden />
            </button>
          )}
        </div>
        <Title className="mt-2 font-display text-[26px] leading-tight font-semibold">{name}</Title>
        <Desc className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
          {call.contacts?.name && other && (
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Phone className="size-3.5" aria-hidden /> {formatPhone(other)}
            </span>
          )}
          <span className="tabular-nums">{formatDateTime(call.started_at)}</span>
          <span>· {who}</span>
        </Desc>
      </header>

      <section aria-label="Gravação" className="rounded-2xl border border-border bg-surface p-4">
        {stored ? (
          audio ? (
            <audio controls autoPlay src={audio} className="w-full">
              <track kind="captions" />
            </audio>
          ) : (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => void play()}
                disabled={loading}
                aria-label="Tocar a gravação"
                className="grid size-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-primary transition-transform hover:scale-[1.03] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none active:scale-[0.97] disabled:opacity-60"
              >
                {loading ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Play className="ml-0.5 size-4 fill-current" aria-hidden />
                )}
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium">Ouvir gravação</p>
                <p className="truncate text-[11px] text-subtle">
                  {notice ? `Aviso dado: “${notice}”` : "Quem ouve fica registrado (LGPD)."}
                </p>
              </div>
              <span className="text-[12px] tabular-nums text-muted-foreground">
                {formatDuration(call.billseconds ?? call.duration_seconds)}
              </span>
            </div>
          )
        ) : (
          <p className="text-[13px] text-muted-foreground">
            {call.recording_status === "pending"
              ? "Gravação sendo processada. Aparece aqui em alguns minutos."
              : call.recording_status === "failed"
                ? "A gravação não pôde ser baixada da operadora."
                : missed
                  ? "Ligação não atendida: não há gravação."
                  : "Esta ligação não foi gravada."}
          </p>
        )}
        <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3 text-center">
          <Stat
            label="Duração"
            value={
              call.answered_at ? formatDuration(call.billseconds ?? call.duration_seconds) : "—"
            }
          />
          <Stat label="Nota" value={call.score === null ? "—" : String(call.score)} />
          <Stat
            label="Clima"
            value={call.sentiment ? (SENTIMENT[call.sentiment] ?? call.sentiment) : "—"}
          />
        </dl>
      </section>

      {call.disposition_reason && call.status === "failed" && (
        <p className="flex gap-2 rounded-2xl bg-danger/10 p-3 text-[12px] text-danger">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {call.disposition_reason}
        </p>
      )}

      {call.summary && (
        <section aria-labelledby={`resumo-${call.id}`}>
          <h3 id={`resumo-${call.id}`} className="eyebrow mb-2 flex items-center gap-1.5">
            <Bot className="size-3.5" aria-hidden /> Resumo da IA
          </h3>
          <p className="border-l-2 border-border-strong pl-4 text-[15px] leading-relaxed">
            {call.summary}
          </p>
        </section>
      )}

      {(next || missed) && (
        <section className="rounded-2xl bg-primary p-5 text-primary-foreground shadow-primary">
          <p className="text-[13px] font-semibold">Próxima ação</p>
          <p className="mt-1 text-[13px] leading-relaxed opacity-80">
            {next ??
              "O cliente tentou falar com vocês e ninguém atendeu. Retorne enquanto o assunto está quente."}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {sp && other && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  void sp.dial({
                    contactId: call.contact_id,
                    phone: other,
                    name: call.contacts?.name ?? null,
                  })
                }
                disabled={sp.dialing}
              >
                <Phone /> {missed ? "Ligar de volta" : "Ligar"}
              </Button>
            )}
            {call.contact_id && (
              <Button asChild size="sm" variant="secondary">
                <Link to="/contatos/$contactId" params={{ contactId: call.contact_id }}>
                  <UserRound /> Abrir ficha
                </Link>
              </Button>
            )}
          </div>
        </section>
      )}

      {Object.keys(evals).length > 0 && (
        <section>
          <h3 className="eyebrow mb-2">Avaliação</h3>
          <ul className="space-y-1.5">
            {Object.entries(evals).map(([k, v]) => (
              <li key={k} className="flex items-start gap-2 text-[12px]">
                <span
                  className={cn(
                    "mt-0.5 shrink-0 rounded-full px-1.5 text-[10px] font-medium",
                    v.result === "success"
                      ? "bg-primary-soft text-foreground"
                      : v.result === "failure"
                        ? "bg-danger/10 text-danger"
                        : "bg-surface-2 text-subtle",
                  )}
                >
                  {v.result === "success" ? "ok" : v.result === "failure" ? "falhou" : "?"}
                </span>
                <span>
                  <span className="font-medium">{k.replace(/_/g, " ")}</span>
                  {v.rationale && (
                    <span className="block text-muted-foreground">{v.rationale}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {Object.keys(dc).length > 0 && (
        <section>
          <h3 className="eyebrow mb-2">Dados coletados</h3>
          <dl className="grid gap-1 text-[12px]">
            {Object.entries(dc).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3">
                <dt className="text-subtle">{k.replace(/_/g, " ")}</dt>
                <dd className="text-right font-medium">{String(v?.value ?? "—")}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <section aria-labelledby={`transcricao-${call.id}`}>
        <h3 id={`transcricao-${call.id}`} className="eyebrow mb-3">
          Transcrição
        </h3>
        {turns.length > 0 ? (
          <ol className="space-y-4">
            {turns.map((t, i) => (
              <li
                key={i}
                className={cn(
                  "border-l-2 pl-3",
                  t.who === "agent" ? "border-primary" : "border-border",
                )}
              >
                <p className="text-[12px] font-semibold">
                  {t.who === "agent"
                    ? (agentLabel ?? "Atendente")
                    : (call.contacts?.name ?? "Cliente")}
                  {t.at !== null && (
                    <span className="ml-2 font-normal tabular-nums text-subtle">
                      {formatClock(t.at)}
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-[13px] leading-relaxed">{t.text}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-[13px] text-muted-foreground">
            {missed
              ? "Sem conversa para transcrever."
              : "Sem transcrição. Conecte o Deepgram em Ajustes › Integrações para transcrever as ligações gravadas."}
          </p>
        )}
      </section>
    </div>
  );
}

interface SheetProps {
  accountId: string;
  call: CallRow | null;
  onClose: () => void;
  agentName?: string | undefined;
  userName?: string | undefined;
  autoPlay?: boolean | undefined;
}

// Em telas menores o detalhe abre por cima da lista.
export function CallDetailSheet({ call, onClose, ...rest }: SheetProps) {
  return (
    <Sheet open={Boolean(call)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-lg">
        {call && <CallDetail key={call.id} call={call} inSheet {...rest} />}
      </SheetContent>
    </Sheet>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col-reverse">
      <dt className="text-[11px] text-subtle">{label}</dt>
      <dd className="font-display text-[15px] font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
