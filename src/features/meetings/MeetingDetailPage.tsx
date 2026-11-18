import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Ban,
  Building2,
  CheckCircle2,
  CheckSquare,
  Copy,
  FileAudio,
  Lightbulb,
  Loader2,
  Mail,
  MessageSquare,
  RefreshCw,
  Send,
  ShieldAlert,
  Bot,
  Video,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/EmptyState";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAccount } from "@/lib/account";
import { formatDateTime } from "@/lib/format";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";

import {
  STATUS_LABEL,
  meetingAction,
  meetingKeys,
  useCoachTips,
  useMeeting,
  useMeetingExtras,
  useTranscript,
} from "./api";
import { BriefingCard } from "./BriefingCard";
import { RecordingPlayer } from "./RecordingPlayer";
import { meetingDurationMin } from "./lib";
import { ScoreRubric, ScoreSummary, type MeetingScoreData } from "./ScoreRubric";

interface Minutes {
  summary?: string;
  decisions?: string[];
  objections?: { objection: string; handled: boolean }[];
  next_steps?: { title: string; owner: string; due_in_days: number }[];
  qualification?: Record<string, string>;
  risks?: string[];
  follow_up?: string;
  framework?: string;
}

function formatWhenShort(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: tz,
  })
    .format(new Date(iso))
    .replace(/\./g, "");
}

function mmss(ms: number | null) {
  if (ms === null) return "";
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

// Detalhe da reunião (direção AIDesigner): título grande, gravação ao lado da nota, resumo da IA
// com a decisão principal e o roteiro do playbook à direita. Ata da IA, nota pela rubrica, transcrição, dicas do coach, convites e gravação.
export function MeetingDetailPage({ meetingId }: { meetingId: string }) {
  const { current, isManager } = useAccount();
  const accountId = current!.accountId;
  const qc = useQueryClient();
  const meeting = useMeeting(meetingId);
  const extras = useMeetingExtras(meetingId);
  const live = meeting.data?.status === "live";
  const transcript = useTranscript(meetingId, live);
  const tips = useCoachTips(meetingId, true);
  const [busy, setBusy] = useState<string | null>(null);

  async function run(
    action: "invite" | "guest_link" | "cancel" | "minutes" | "delete_recording",
    ok: string,
  ) {
    setBusy(action);
    try {
      const r = await meetingAction<{ ok?: boolean; url?: string }>(accountId, meetingId, action);
      if (action === "guest_link" && r.url) {
        await navigator.clipboard.writeText(r.url).catch(() => undefined);
        toast.success("Link do convidado copiado (o anterior deixou de valer)");
      } else toast.success(ok);
      void qc.invalidateQueries({ queryKey: meetingKeys.one(meetingId) });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  if (meeting.isPending)
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-24 w-full rounded-[28px]" />
        <Skeleton className="h-64 w-full rounded-[24px]" />
      </div>
    );
  if (!meeting.data)
    return (
      <EmptyState
        icon={Video}
        title="Reunião não encontrada"
        action={
          <Button asChild variant="outline">
            <Link to="/reunioes">Voltar</Link>
          </Button>
        }
      />
    );
  const m = meeting.data;
  const minutes = (m.minutes ?? null) as Minutes | null;
  const score = m.score as MeetingScoreData | null;
  const tz = current!.timezone || "America/Sao_Paulo";
  const canAct = m.status === "scheduled" || m.status === "live";
  const duration = meetingDurationMin(m);
  const whenIso = m.started_at ?? m.scheduled_start ?? m.created_at;
  const decisions = minutes?.decisions ?? [];
  const [mainDecision, ...otherDecisions] = decisions;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="sticky top-0 z-10 flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-background/90 px-4 py-2.5 backdrop-blur md:px-8">
        <Link
          to="/reunioes"
          aria-label="Voltar para a lista de reuniões"
          className="inline-flex items-center gap-1 rounded-full text-[13px] text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none lg:hidden"
        >
          <ArrowLeft className="size-4" /> Reuniões
        </Link>
        <span className="rounded-full border border-border bg-surface px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground first-letter:uppercase">
          {formatWhenShort(whenIso, tz)}
        </span>
        {duration !== null && (
          <span className="text-[13px] text-muted-foreground tabular-nums">
            Duração: {duration} min
          </span>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {minutes?.summary && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                void navigator.clipboard
                  .writeText(minutes.summary ?? "")
                  .then(() => toast.success("Resumo copiado"))
                  .catch(() => toast.error("Não deu para copiar"))
              }
            >
              <Copy /> Copiar resumo
            </Button>
          )}
          {m.status === "ended" && (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy !== null}
              onClick={() => void run("minutes", "Gerando a ata de novo")}
            >
              {busy === "minutes" ? <Loader2 className="animate-spin" /> : <RefreshCw />} Refazer
              ata
            </Button>
          )}
          {canAct && m.contact_id && (
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={busy !== null}
                onClick={() => void run("guest_link", "")}
              >
                {busy === "guest_link" ? <Loader2 className="animate-spin" /> : <Copy />} Link do
                convidado
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={busy !== null}
                onClick={() => void run("invite", "Convite reenviado por e-mail e WhatsApp")}
              >
                {busy === "invite" ? <Loader2 className="animate-spin" /> : <Send />} Reenviar
                convite
              </Button>
            </>
          )}
          {canAct && (
            <Button
              variant="ghost"
              size="sm"
              className="text-danger hover:text-danger"
              disabled={busy !== null}
              onClick={() => void run("cancel", "Reunião cancelada")}
            >
              <Ban /> Cancelar
            </Button>
          )}
          {canAct && (
            <Button size="sm" asChild>
              <Link to="/sala/$meetingId" params={{ meetingId }}>
                <Video /> {m.status === "live" ? "Entrar agora" : "Abrir a sala"}
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-[1080px] px-4 pt-8 pb-12 md:px-8 md:pt-10">
        <header>
          <p className="mb-1.5 text-[11px] font-medium tracking-[0.08em] text-subtle uppercase">
            Reunião
          </p>
          <h1 className="font-display text-[30px] leading-[1.08] font-medium break-words md:text-[42px]">
            {m.title}
          </h1>
          <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] text-muted-foreground">
            {m.contact ? (
              <>
                <Building2 className="size-4 text-subtle" aria-hidden />
                <Link
                  to="/contatos/$contactId"
                  params={{ contactId: m.contact.id }}
                  className="rounded hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {m.contact.company
                    ? `${m.contact.company}${m.contact.name ? ` · ${m.contact.name}` : ""}`
                    : (m.contact.name ?? "Contato")}
                </Link>
                <span aria-hidden>·</span>
              </>
            ) : null}
            <span className={cn("font-medium", m.status === "live" && "text-foreground")}>
              {STATUS_LABEL[m.status]}
              {m.status === "canceled" && m.canceled_by === "contact" && " pelo cliente"}
            </span>
            {m.guest_confirmed_at && m.status === "scheduled" && (
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-0.5 text-[11px] font-medium text-foreground">
                <CheckCircle2 className="size-3 text-foreground" aria-hidden /> Presença confirmada
              </span>
            )}
            {m.reschedule_count > 0 && (
              <span className="text-[13px] text-subtle">remarcada {m.reschedule_count}x</span>
            )}
          </p>
          {m.status === "canceled" && m.cancel_reason && (
            <p className="mt-2 text-[13px] text-muted-foreground">
              Motivo do cancelamento: {m.cancel_reason}
            </p>
          )}
        </header>

        {(m.recording_url || score) && (
          <div
            className={cn(
              "mt-8 grid gap-6",
              m.recording_url && score && "lg:grid-cols-[minmax(0,1fr)_260px]",
            )}
          >
            {m.recording_url && (
              <section aria-label="Gravação" className="min-w-0">
                <RecordingPlayer url={m.recording_url} />
                {isManager && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="mt-2 h-7 text-subtle hover:text-danger"
                        disabled={busy === "delete_recording"}
                      >
                        Apagar gravação
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Apagar a gravação?</AlertDialogTitle>
                        <AlertDialogDescription>
                          O arquivo some para todos e não dá para desfazer. A ata e a transcrição
                          continuam.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Manter</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => void run("delete_recording", "Gravação apagada")}
                        >
                          Apagar gravação
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </section>
            )}
            {score && <ScoreSummary score={score} />}
          </div>
        )}

        {m.briefing && (m.status === "scheduled" || m.status === "live") && (
          <div className="mt-8">
            <BriefingCard briefing={m.briefing} />
          </div>
        )}

        <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
          <Tabs defaultValue={minutes ? "minutes" : "transcript"} className="min-w-0">
            <TabsList className="mb-5">
              <TabsTrigger value="minutes">Resumo da IA</TabsTrigger>
              <TabsTrigger value="transcript">Transcrição</TabsTrigger>
              <TabsTrigger value="tips">Dicas do coach</TabsTrigger>
            </TabsList>

            <TabsContent value="minutes" className="space-y-8">
              {!minutes ? (
                <EmptyState
                  icon={Bot}
                  title={
                    m.status === "ended"
                      ? "A ata está sendo preparada"
                      : "A ata nasce quando a reunião terminar"
                  }
                  description="A IA lê a transcrição e escreve o resumo, as decisões, as objeções, os próximos passos (que viram tarefas) e a qualificação do negócio."
                  className="py-12"
                />
              ) : (
                <>
                  <section aria-labelledby="ata-resumo">
                    <h2
                      id="ata-resumo"
                      className="flex items-center gap-2 border-b border-border pb-3 font-display text-[20px] font-medium"
                    >
                      <Bot className="size-5" aria-hidden /> Resumo da inteligência
                    </h2>
                    <p className="mt-4 text-[15px] leading-[1.75] whitespace-pre-line">
                      {minutes.summary}
                    </p>
                    {mainDecision && (
                      <div className="mt-6 rounded-r-xl border-l-[3px] border-primary bg-surface-2 px-5 py-4">
                        <p className="text-[14px] font-semibold">Decisão principal</p>
                        <p className="mt-1 text-[14px] leading-relaxed">{mainDecision}</p>
                      </div>
                    )}
                    {otherDecisions.length > 0 && (
                      <div className="mt-4">
                        <p className="mb-1.5 text-[13px] font-medium text-muted-foreground">
                          Outras decisões
                        </p>
                        <Bullets items={otherDecisions} />
                      </div>
                    )}
                  </section>

                  {minutes.next_steps && minutes.next_steps.length > 0 && (
                    <section aria-labelledby="ata-passos">
                      <h2 id="ata-passos" className="text-[16px] font-medium">
                        Próximos passos
                      </h2>
                      <p className="text-[12px] text-subtle">
                        Viraram tarefas na agenda de quem é dono.
                      </p>
                      <ul className="mt-3 divide-y divide-border rounded-xl border border-border bg-surface">
                        {minutes.next_steps.map((n, i) => (
                          <li key={i} className="flex items-start gap-3 px-4 py-3">
                            <CheckSquare
                              className="mt-0.5 size-4 shrink-0 text-subtle"
                              aria-hidden
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-[14px] font-medium">{n.title}</p>
                              <p className="mt-0.5 text-[12px] text-muted-foreground">
                                Responsável: {n.owner} · em {n.due_in_days}{" "}
                                {n.due_in_days === 1 ? "dia" : "dias"}
                              </p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                  <div className="grid gap-4 md:grid-cols-2">
                    {minutes.objections && minutes.objections.length > 0 && (
                      <Card title="Objeções" icon={ShieldAlert}>
                        <ul className="space-y-1.5 text-[13px]">
                          {minutes.objections.map((o, i) => (
                            <li key={i} className="flex items-start gap-2">
                              <span
                                className={cn(
                                  "mt-1 size-2 shrink-0 rounded-full",
                                  o.handled ? "bg-success" : "bg-danger",
                                )}
                                aria-label={o.handled ? "tratada" : "em aberto"}
                              />
                              {o.objection}
                            </li>
                          ))}
                        </ul>
                      </Card>
                    )}
                    {minutes.qualification && Object.keys(minutes.qualification).length > 0 && (
                      <Card
                        title={`Qualificação (${minutes.framework ?? "BANT"})`}
                        icon={CheckSquare}
                      >
                        <dl className="space-y-1.5 text-[13px]">
                          {Object.entries(minutes.qualification).map(([k, v]) => (
                            <div key={k} className="flex gap-3">
                              <dt className="w-28 shrink-0 text-subtle capitalize">
                                {k.replace(/_/g, " ")}
                              </dt>
                              <dd>{v || "—"}</dd>
                            </div>
                          ))}
                        </dl>
                      </Card>
                    )}
                    {minutes.risks && minutes.risks.length > 0 && (
                      <Card title="Riscos do negócio" icon={ShieldAlert}>
                        <Bullets items={minutes.risks} />
                      </Card>
                    )}
                  </div>
                  {minutes.follow_up && (
                    <Card title="Rascunho de follow-up" icon={MessageSquare}>
                      <p className="rounded-xl bg-surface-2 p-3 text-[13px] whitespace-pre-line">
                        {minutes.follow_up}
                      </p>
                      <div className="mt-3 flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            void navigator.clipboard
                              .writeText(minutes.follow_up ?? "")
                              .then(() => toast.success("Copiado"))
                          }
                        >
                          <Copy /> Copiar
                        </Button>
                        {m.contact?.email && (
                          <Button size="sm" variant="outline" asChild>
                            <a
                              href={`mailto:${m.contact.email}?subject=${encodeURIComponent(`Próximos passos: ${m.title}`)}&body=${encodeURIComponent(minutes.follow_up)}`}
                            >
                              <Mail /> Abrir no e-mail
                            </a>
                          </Button>
                        )}
                      </div>
                    </Card>
                  )}
                </>
              )}
            </TabsContent>

            <TabsContent value="transcript">
              {transcript.isPending ? (
                <Skeleton className="h-64 w-full rounded-[24px]" />
              ) : (transcript.data ?? []).length === 0 ? (
                <EmptyState
                  icon={FileAudio}
                  title="Sem transcrição ainda"
                  description="Com a sala ligada ao LiveKit e o agente de transcrição rodando, cada fala aparece aqui em tempo real, separada por pessoa."
                  className="py-12"
                />
              ) : (
                <ol className="space-y-3 rounded-xl border border-border bg-surface p-5">
                  {(transcript.data ?? []).map((t) => (
                    <li
                      key={t.id}
                      className={cn("flex gap-3", t.is_seller && "flex-row-reverse text-right")}
                    >
                      <div
                        className={cn(
                          "max-w-[80%] rounded-2xl px-3.5 py-2",
                          t.is_seller ? "bg-primary text-primary-foreground" : "bg-surface-2",
                        )}
                      >
                        <p className="text-[11px] font-semibold opacity-70">
                          {t.speaker_label ?? (t.is_seller ? "Vendedor" : "Cliente")} ·{" "}
                          {mmss(t.start_ms)}
                        </p>
                        <p className="text-[14px] leading-relaxed">{t.text}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </TabsContent>

            <TabsContent value="tips">
              {(tips.data ?? []).length === 0 ? (
                <EmptyState
                  icon={Lightbulb}
                  title="Nenhuma dica registrada"
                  description="As dicas que o coach mostrou ao vendedor durante a reunião ficam guardadas aqui para revisão."
                  className="py-12"
                />
              ) : (
                <ul className="space-y-2">
                  {(tips.data ?? []).map((t) => (
                    <li
                      key={t.id}
                      className={cn(
                        "rounded-2xl border border-border bg-surface p-4",
                        t.dismissed && "opacity-60",
                      )}
                    >
                      <p className="text-[11px] font-semibold tracking-widest text-subtle uppercase">
                        {t.kind} · {formatDateTime(t.created_at)}
                      </p>
                      <p className="mt-1 text-[14px] font-medium">{t.title}</p>
                      {t.body && (
                        <p className="mt-1 text-[13px] whitespace-pre-line text-muted-foreground">
                          {t.body}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>
          </Tabs>

          <aside className="space-y-4">
            {score ? (
              <ScoreRubric score={score} playbook={m.playbook?.name ?? null} />
            ) : (
              <section className="rounded-xl border border-border bg-surface p-5">
                <p className="text-[14px] font-semibold">Nota da reunião</p>
                <p className="mt-1.5 text-[13px] text-muted-foreground">
                  A nota sai junto com a ata, pelo roteiro do playbook
                  {isManager ? " (Ajustes › Playbooks)" : ""}.
                </p>
              </section>
            )}
            <section className="rounded-xl border border-border bg-surface p-5">
              <p className="mb-3 text-[14px] font-semibold">Participantes</p>
              <ul className="space-y-2 text-[13px]">
                {(extras.data?.participants ?? []).map((p) => (
                  <li key={p.id} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate">
                      {p.name ?? p.email ?? p.identity}
                    </span>
                    <span className="text-[11px] text-subtle">
                      {p.kind === "host"
                        ? "anfitrião"
                        : p.kind === "contact"
                          ? "convidado"
                          : "equipe"}
                    </span>
                    <span
                      className={cn(
                        "size-2 rounded-full",
                        p.joined_at ? "bg-success" : "bg-surface-3",
                      )}
                      aria-label={p.joined_at ? "entrou" : "não entrou"}
                    />
                  </li>
                ))}
              </ul>
            </section>
            {(extras.data?.invites ?? []).length > 0 && (
              <section className="rounded-xl border border-border bg-surface p-5">
                <p className="mb-3 text-[14px] font-semibold">Convites e lembretes</p>
                <ul className="space-y-1.5 text-[12px]">
                  {(extras.data?.invites ?? []).map((i) => (
                    <li key={i.id} className="flex justify-between gap-2">
                      <span>
                        {i.channel === "email"
                          ? "E-mail"
                          : i.channel === "whatsapp"
                            ? "WhatsApp"
                            : "SMS"}{" "}
                        ·{" "}
                        {i.kind === "invite"
                          ? "convite"
                          : i.kind === "reminder_24h"
                            ? "lembrete 24 h"
                            : "lembrete 1 h"}
                      </span>
                      <span className="text-subtle">
                        {i.status === "queued"
                          ? "na fila"
                          : i.status === "sent"
                            ? "enviado"
                            : i.status === "failed"
                              ? "falhou"
                              : "pulado"}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

function Card({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof Bot;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <p className="mb-3 flex items-center gap-1.5 text-[14px] font-semibold">
        <Icon className="size-3.5" /> {title}
      </p>
      {children}
    </section>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5 text-[13px]">
      {items.map((x, i) => (
        <li key={i}>{x}</li>
      ))}
    </ul>
  );
}
