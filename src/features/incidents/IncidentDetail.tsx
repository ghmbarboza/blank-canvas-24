import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Check, Loader2, Send, Users } from "lucide-react";
import { toast } from "sonner";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { formatRelative } from "@/lib/format";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";

import {
  IMPACT_LABEL,
  INCIDENT_STATUS_LABEL,
  usePostIncidentUpdate,
  useToggleIncidentPublic,
  type IncidentRow,
  type IncidentStatus,
} from "./api";

const STEPS: IncidentStatus[] = ["investigating", "identified", "monitoring", "resolved"];
const OPEN_TICKET = ["open", "pending", "waiting_customer"];

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function startedLine(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) return `Começou às ${clock(iso)}`;
  return `Começou em ${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "")}, ${clock(iso)}`;
}

// Painel do incidente: o que é, em que passo está, o aviso em lote para os afetados e o histórico.
export function IncidentDetail({
  accountId,
  incident: i,
  canEdit,
  onBack,
}: {
  accountId: string;
  incident: IncidentRow;
  canEdit: boolean;
  onBack: () => void;
}) {
  const current = i.status as IncidentStatus;
  const stepIdx = Math.max(0, STEPS.indexOf(current));
  const openTickets = i.tickets.filter((t) => OPEN_TICKET.includes(t.status));
  const resolved = current === "resolved";

  return (
    <div className="mx-auto w-full max-w-[760px] px-4 pt-6 pb-16 md:px-10 md:pt-10">
      <button
        type="button"
        onClick={onBack}
        className="mb-4 inline-flex items-center gap-1 rounded-full text-[13px] text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none lg:hidden"
      >
        <ArrowLeft className="size-4" /> Incidentes
      </button>

      <p className="flex flex-wrap items-center gap-2 text-[12px]">
        <span
          className={cn(
            "font-semibold",
            i.impact === "critical" && !resolved ? "text-danger" : "text-muted-foreground",
          )}
        >
          Impacto {IMPACT_LABEL[i.impact]?.toLowerCase() ?? i.impact}
        </span>
        <span className="size-1 rounded-full bg-subtle" aria-hidden />
        <span className="text-muted-foreground">{startedLine(i.started_at)}</span>
        {resolved && i.resolved_at && (
          <>
            <span className="size-1 rounded-full bg-subtle" aria-hidden />
            <span className="text-muted-foreground">Resolvido {formatRelative(i.resolved_at)}</span>
          </>
        )}
      </p>
      <h2 className="mt-3 font-display text-[28px] leading-tight font-medium break-words md:text-[34px]">
        {i.title}
      </h2>
      {i.public_summary && (
        <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">{i.public_summary}</p>
      )}

      <section aria-labelledby="inc-steps" className="mt-10">
        <h3 id="inc-steps" className="eyebrow">
          Situação
        </h3>
        <ol className="mt-5 grid grid-cols-4">
          {STEPS.map((s, idx) => {
            const done = idx < stepIdx || (resolved && idx === stepIdx);
            const now = idx === stepIdx && !resolved;
            return (
              <li key={s} className="relative flex flex-col items-start">
                {idx > 0 && (
                  <span
                    aria-hidden
                    className={cn(
                      "absolute top-[11px] right-full h-px w-full",
                      idx <= stepIdx ? "bg-primary" : "bg-border",
                    )}
                  />
                )}
                <span
                  className={cn(
                    "relative z-[1] grid size-6 place-items-center rounded-full border-2",
                    done && "border-primary bg-primary-soft text-foreground",
                    now && "border-primary bg-surface",
                    !done && !now && "border-border bg-surface",
                  )}
                  aria-hidden
                >
                  {done ? (
                    <Check className="size-3.5" />
                  ) : now ? (
                    <span className="size-2 rounded-full bg-primary" />
                  ) : null}
                </span>
                <span
                  className={cn(
                    "mt-2 pr-2 text-[12px] leading-tight",
                    idx === stepIdx ? "font-semibold text-foreground" : "text-subtle",
                  )}
                >
                  {INCIDENT_STATUS_LABEL[s]}
                  {idx === stepIdx && <span className="sr-only"> (agora)</span>}
                </span>
              </li>
            );
          })}
        </ol>
      </section>

      {canEdit && (
        <Composer key={i.id} accountId={accountId} incident={i} openCount={openTickets.length} />
      )}

      <section aria-labelledby="inc-history" className="mt-12">
        <h3 id="inc-history" className="eyebrow">
          Histórico
        </h3>
        <ol className="mt-5 border-l border-border">
          {i.updates.map((u) => (
            <li key={u.id} className="relative pb-6 pl-6">
              <span
                aria-hidden
                className="absolute top-1.5 -left-[5px] size-[9px] rounded-full border-2 border-primary bg-surface"
              />
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[14px] font-semibold">
                  {INCIDENT_STATUS_LABEL[u.status as IncidentStatus] ?? u.status}
                </p>
                <span className="shrink-0 text-[12px] text-subtle tabular-nums">
                  {formatRelative(u.created_at)}
                </span>
              </div>
              <p className="mt-1 text-[14px] leading-relaxed whitespace-pre-wrap text-muted-foreground">
                {u.body}
              </p>
              {u.notified > 0 && (
                <p className="mt-1 text-[12px] text-subtle">
                  {u.notified} {u.notified === 1 ? "cliente avisado" : "clientes avisados"}
                  {u.is_public ? " · na página de status" : ""}
                </p>
              )}
            </li>
          ))}
          <li className="relative pl-6">
            <span
              aria-hidden
              className="absolute top-1.5 -left-[5px] size-[9px] rounded-full bg-border"
            />
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[14px] font-semibold">Incidente aberto</p>
              <span className="shrink-0 text-[12px] text-subtle tabular-nums">
                {formatRelative(i.created_at)}
              </span>
            </div>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {i.tickets.length}{" "}
              {i.tickets.length === 1 ? "chamado agrupado" : "chamados agrupados"}.
            </p>
          </li>
        </ol>
      </section>

      {i.tickets.length > 0 && (
        <section aria-labelledby="inc-tickets" className="mt-10">
          <h3 id="inc-tickets" className="eyebrow">
            Chamados agrupados
          </h3>
          <ul className="mt-3 divide-y divide-border rounded-xl border border-border bg-surface">
            {i.tickets.slice(0, 12).map((t) => (
              <li key={t.id}>
                <Link
                  to="/atendimento"
                  search={{ chamado: t.id }}
                  className="row-wash flex items-center gap-3 px-4 py-2.5 text-[13px] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <span className="shrink-0 text-subtle tabular-nums">#{t.number}</span>
                  <span className="min-w-0 flex-1 truncate">{t.subject}</span>
                  {!OPEN_TICKET.includes(t.status) && (
                    <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-muted-foreground">
                      Fechado
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
          {i.tickets.length > 12 && (
            <p className="mt-2 text-[12px] text-subtle">e mais {i.tickets.length - 12}</p>
          )}
        </section>
      )}
    </div>
  );
}

function Composer({
  accountId,
  incident: i,
  openCount,
}: {
  accountId: string;
  incident: IncidentRow;
  openCount: number;
}) {
  const post = usePostIncidentUpdate(accountId);
  const toggle = useToggleIncidentPublic(accountId);
  const [status, setStatus] = useState<IncidentStatus>(i.status as IncidentStatus);
  const [body, setBody] = useState("");
  const [notify, setNotify] = useState(true);
  const [resolveTickets, setResolveTickets] = useState(false);

  function send() {
    post.mutate(
      {
        incidentId: i.id,
        status,
        body,
        notify,
        resolveTickets: status === "resolved" && resolveTickets,
      },
      {
        onSuccess: (r) => {
          setBody("");
          toast.success(
            notify
              ? `Atualização publicada · ${r.notified} clientes avisados${r.failed ? ` · ${r.failed} falharam` : ""}`
              : "Atualização publicada",
          );
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  }

  return (
    <section aria-labelledby="inc-broadcast" className="mt-12">
      <div className="flex items-center justify-between gap-3">
        <h3 id="inc-broadcast" className="eyebrow">
          Aviso para todos os afetados
        </h3>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium whitespace-nowrap text-muted-foreground">
          <Users className="size-3" aria-hidden /> {openCount}{" "}
          {openCount === 1 ? "chamado aberto" : "chamados abertos"}
        </span>
      </div>
      <div className="mt-3 overflow-hidden rounded-xl border border-border bg-surface focus-within:ring-2 focus-within:ring-ring">
        <Textarea
          rows={4}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="O que aconteceu, o que estamos fazendo e quando esperamos resolver. Vai como resposta em cada chamado agrupado."
          aria-label="Mensagem para os clientes"
          className="resize-none rounded-none border-0 px-4 py-3 text-[14px] shadow-none focus-visible:ring-0"
        />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border bg-surface-2/60 px-4 py-3">
          <Select value={status} onValueChange={(v) => setStatus(v as IncidentStatus)}>
            <SelectTrigger className="h-8 w-auto gap-2 text-[12px]" aria-label="Nova situação">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STEPS.map((s) => (
                <SelectItem key={s} value={s}>
                  {INCIDENT_STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
            <Switch
              checked={notify}
              onCheckedChange={setNotify}
              aria-label="Responder os chamados"
            />
            Responder os chamados
          </label>
          <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
            <Switch
              checked={i.is_public}
              disabled={toggle.isPending}
              onCheckedChange={(v) =>
                toggle.mutate(
                  { id: i.id, isPublic: v },
                  { onError: (e) => toast.error(errorMessage(e)) },
                )
              }
              aria-label="Mostrar na página de status"
            />
            Na página de status
          </label>
          {status === "resolved" && notify && (
            <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
              <Switch
                checked={resolveTickets}
                onCheckedChange={setResolveTickets}
                aria-label="Fechar os chamados"
              />
              E fechar os chamados
            </label>
          )}
          <Button
            onClick={send}
            disabled={post.isPending || !body.trim()}
            className="ml-auto"
            size="sm"
          >
            {post.isPending ? <Loader2 className="animate-spin" /> : <Send />} Enviar atualização
          </Button>
        </div>
      </div>
    </section>
  );
}
