import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  HeartPulse,
  Phone,
  Bot,
  UserPlus,
  Video,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { ContactAvatar } from "@/components/common/ContactAvatar";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useSetForecastCategory } from "@/features/commerce/api";
import { ContactPicker, type PickedContact } from "@/features/contacts/components/ContactPicker";
import { formatRelative } from "@/lib/format";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";

import { FORECAST_LABEL } from "../forecast-suggestion";
import { HEALTH_LABEL, dealHealth, type DealHealth } from "../health";
import {
  DEAL_ROLES,
  DEAL_ROLE_LABEL,
  useAddParticipant,
  useDealParticipants,
  useDealRoom,
  useDecideSuggestion,
  useForecastSuggestion,
  useRemoveParticipant,
  useSetParticipantRole,
  type DealRole,
  type DealRoom as Room,
} from "../room-api";
import type { DealRow } from "../types";

const HEALTH_TONE: Record<DealHealth["level"], string> = {
  good: "bg-primary-soft text-foreground",
  attention: "bg-primary-soft text-primary",
  risk: "bg-danger/10 text-danger",
  closed: "bg-surface-2 text-muted-foreground",
};

// O negócio como sala: saúde, sugestão de forecast, quem participa do lado do cliente, o que a IA viu
// e as reuniões e ligações ligadas ao negócio.
export function DealRoom({ accountId, deal }: { accountId: string; deal: DealRow }) {
  const room = useDealRoom(deal.id);
  if (room.isPending)
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 rounded-[24px]" />
        <Skeleton className="h-32 rounded-[24px]" />
      </div>
    );
  const r = room.data;
  return (
    <div className="space-y-4">
      <SuggestionBanner accountId={accountId} deal={deal} />
      {r && <HealthCard deal={deal} room={r} />}
      <Participants accountId={accountId} dealId={deal.id} />
      {r && <AiSaw room={r} />}
      {r && <Touches room={r} />}
    </div>
  );
}

function SuggestionBanner({ accountId, deal }: { accountId: string; deal: DealRow }) {
  const q = useForecastSuggestion(deal.id);
  const decide = useDecideSuggestion(deal.id);
  const setCategory = useSetForecastCategory(accountId);
  const s = q.data;
  if (!s || deal.status !== "open") return null;
  const down =
    ["commit", "best_case", "pipeline"].indexOf(s.suggested_category) >
    ["commit", "best_case", "pipeline"].indexOf(s.current_category);
  const busy = decide.isPending || setCategory.isPending;

  async function apply() {
    try {
      await setCategory.mutateAsync({
        dealId: deal.id,
        category: s!.suggested_category,
        custom: (deal.custom ?? {}) as Record<string, unknown>,
      });
      await decide.mutateAsync({ id: s!.id, status: "applied" });
      toast.success(`Forecast agora em ${FORECAST_LABEL[s!.suggested_category]}`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <section
      aria-label="Sugestão de forecast"
      className="rounded-[24px] bg-[#001F35] p-4 text-white"
    >
      <p className="flex items-center gap-1.5 text-[11px] tracking-wide text-white/60 uppercase">
        <Bot className="size-3.5" aria-hidden /> A IA leu a última reunião
      </p>
      <p className="mt-1.5 flex items-center gap-1.5 text-[15px] font-semibold">
        {down ? <ArrowDownRight className="size-4" /> : <ArrowUpRight className="size-4" />}
        Mover de {FORECAST_LABEL[s.current_category]} para {FORECAST_LABEL[s.suggested_category]}?
      </p>
      {s.reasons.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-[12px] text-white/75">
          {s.reasons.slice(0, 4).map((x) => (
            <li key={x}>• {x}</li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex gap-2">
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => void apply()}>
          Aplicar
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-white hover:bg-white/10 hover:text-white"
          disabled={busy}
          onClick={() =>
            decide.mutate(
              { id: s.id, status: "ignored" },
              { onError: (e) => toast.error(errorMessage(e)) },
            )
          }
        >
          Ignorar
        </Button>
      </div>
    </section>
  );
}

function HealthCard({ deal, room }: { deal: DealRow; room: Room }) {
  const h = dealHealth({
    status: deal.status,
    lastTouchAt: room.last_touch_at,
    nextActivityAt: room.next_activity_at,
    overdueActivities: Number(room.overdue_activities ?? 0),
    proposal: room.proposal,
    risks: room.last_minutes?.risks ?? [],
    temperature: room.contact?.temperature ?? null,
    expectedCloseDate: deal.expected_close_date,
  });
  if (h.level === "closed") return null;
  return (
    <section
      aria-label="Saúde do negócio"
      className="rounded-[24px] border border-border bg-surface p-4"
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "grid size-12 shrink-0 place-items-center rounded-full font-display text-[17px] font-semibold tabular-nums",
            HEALTH_TONE[h.level],
          )}
        >
          {h.score}
        </span>
        <div className="min-w-0">
          <p className="eyebrow flex items-center gap-1">
            <HeartPulse className="size-3.5" aria-hidden /> Saúde do negócio
          </p>
          <p className="text-[15px] font-semibold">{HEALTH_LABEL[h.level]}</p>
        </div>
      </div>
      <ul className="mt-3 flex flex-wrap gap-1.5">
        {h.reasons.map((x) => (
          <li
            key={x.text}
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-[11px]",
              x.tone === "down"
                ? "border-danger/30 bg-danger/5 text-danger"
                : "border-border bg-surface-2 text-muted-foreground",
            )}
          >
            {x.text}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Participants({ accountId, dealId }: { accountId: string; dealId: string }) {
  const q = useDealParticipants(dealId);
  const add = useAddParticipant(accountId, dealId);
  const setRole = useSetParticipantRole(dealId);
  const remove = useRemoveParticipant(dealId);
  const [picked, setPicked] = useState<PickedContact | null>(null);
  const [role, setRoleNew] = useState<DealRole>("influenciador");
  const list = q.data ?? [];

  function addPicked() {
    if (!picked) return;
    add.mutate(
      { contactId: picked.id, role },
      {
        onSuccess: () => {
          setPicked(null);
          toast.success("Participante incluído");
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  }

  return (
    <section aria-labelledby="deal-people" className="space-y-2.5">
      <p id="deal-people" className="eyebrow">
        Quem participa do lado do cliente
      </p>
      {list.length === 0 && !q.isPending && (
        <p className="text-[12px] text-muted-foreground">
          Inclua quem decide, quem influencia e quem vai usar. Ajuda a ver se falta falar com
          alguém.
        </p>
      )}
      {list.length > 0 && (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">
          {list.map((p) => (
            <li key={p.id} className="flex items-center gap-2.5 px-3 py-2">
              <ContactAvatar
                name={p.contact?.name ?? null}
                src={p.contact?.avatar_url ?? null}
                size={28}
              />
              <div className="min-w-0 flex-1">
                {p.contact ? (
                  <Link
                    to="/contatos/$contactId"
                    params={{ contactId: p.contact.id }}
                    className="block truncate text-[13px] font-medium hover:underline"
                  >
                    {p.contact.name ?? "Sem nome"}
                  </Link>
                ) : (
                  <span className="text-[13px] text-subtle">Contato removido</span>
                )}
                {p.contact?.job_title && (
                  <p className="truncate text-[11px] text-subtle">{p.contact.job_title}</p>
                )}
              </div>
              <Select
                value={p.role}
                onValueChange={(v) =>
                  setRole.mutate(
                    { id: p.id, role: v as DealRole },
                    { onError: (e) => toast.error(errorMessage(e)) },
                  )
                }
              >
                <SelectTrigger className="h-8 w-36 text-[12px]" aria-label="Papel no negócio">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEAL_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {DEAL_ROLE_LABEL[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button
                type="button"
                aria-label={`Tirar ${p.contact?.name ?? "participante"} do negócio`}
                onClick={() =>
                  remove.mutate(p.id, { onError: (e) => toast.error(errorMessage(e)) })
                }
                className="rounded-full p-1.5 text-subtle hover:bg-surface-2 hover:text-danger"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {!list.some((p) => p.role === "decisor") && list.length > 0 && (
        <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <AlertTriangle className="size-3.5" aria-hidden /> Ninguém marcado como decisor ainda.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-dashed border-border p-2.5">
        <UserPlus className="size-4 shrink-0 text-subtle" aria-hidden />
        <div className="min-w-0 flex-1">
          <ContactPicker accountId={accountId} value={picked} onChange={setPicked} />
        </div>
        <Select value={role} onValueChange={(v) => setRoleNew(v as DealRole)}>
          <SelectTrigger className="h-8 w-36 text-[12px]" aria-label="Papel do novo participante">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DEAL_ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {DEAL_ROLE_LABEL[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" type="button" disabled={!picked || add.isPending} onClick={addPicked}>
          Incluir
        </Button>
      </div>
    </section>
  );
}

function AiSaw({ room }: { room: Room }) {
  const c = room.contact;
  const m = room.last_minutes;
  const call = room.last_call;
  const hasAny = Boolean(c?.ai_summary || c?.ai_intent || m?.summary || call?.summary);
  return (
    <section aria-labelledby="deal-ai" className="space-y-2.5">
      <p id="deal-ai" className="eyebrow flex items-center gap-1">
        <Bot className="size-3.5" aria-hidden /> O que a IA viu
      </p>
      {!hasAny && (
        <p className="text-[12px] text-muted-foreground">
          Quando houver conversa, reunião com ata ou ligação resumida, a leitura da IA aparece aqui.
        </p>
      )}
      {(c?.ai_summary || c?.ai_intent) && (
        <div className="rounded-2xl bg-primary-soft/50 p-3 text-[13px]">
          {c.ai_intent && (
            <p className="font-medium">
              Intenção: <span className="font-normal">{c.ai_intent}</span>
            </p>
          )}
          {c.ai_summary && <p className="mt-1 text-muted-foreground">{c.ai_summary}</p>}
          {c.ai_next_step && <p className="mt-1.5 text-[12px]">Próximo passo: {c.ai_next_step}</p>}
          {c.classified_at && (
            <p className="mt-1 text-[11px] text-subtle">Lido {formatRelative(c.classified_at)}</p>
          )}
        </div>
      )}
      {m?.summary && (
        <div className="rounded-2xl border border-border bg-surface p-3 text-[13px]">
          <p className="mb-1 flex items-center justify-between gap-2 text-[12px] text-subtle">
            <Link
              to="/reunioes/$meetingId"
              params={{ meetingId: m.meeting_id }}
              className="font-medium text-foreground hover:underline"
            >
              Ata: {m.title}
            </Link>
            <span>{formatRelative(m.at)}</span>
          </p>
          <p className="text-muted-foreground">{m.summary}</p>
          {m.risks.length > 0 && (
            <ul className="mt-2 space-y-0.5">
              {m.risks.map((x) => (
                <li key={x} className="flex gap-1.5 text-[12px] text-danger">
                  <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden /> {x}
                </li>
              ))}
            </ul>
          )}
          {m.next_steps.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-[12px]">
              {m.next_steps.slice(0, 5).map((n) => (
                <li key={n.title}>
                  • {n.title}{" "}
                  <span className="text-subtle">
                    ({n.owner === "cliente" ? "cliente" : "vendedor"})
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {call?.summary && (
        <div className="rounded-2xl border border-border bg-surface p-3 text-[13px]">
          <p className="mb-1 flex items-center justify-between text-[12px] text-subtle">
            <span className="font-medium text-foreground">Última ligação</span>
            <span>{formatRelative(call.at)}</span>
          </p>
          <p className="text-muted-foreground">{call.summary}</p>
        </div>
      )}
    </section>
  );
}

const MEETING_STATUS: Record<string, string> = {
  scheduled: "Agendada",
  live: "Ao vivo",
  ended: "Encerrada",
  canceled: "Cancelada",
  no_show: "Não compareceu",
};
const CALL_STATUS: Record<string, string> = {
  completed: "Atendida",
  missed: "Perdida",
  no_answer: "Sem resposta",
  busy: "Ocupado",
  failed: "Falhou",
  voicemail: "Caixa postal",
  in_progress: "Em andamento",
  ringing: "Tocando",
  canceled: "Cancelada",
};

function Touches({ room }: { room: Room }) {
  if (room.meetings.length === 0 && room.calls.length === 0) return null;
  return (
    <section aria-labelledby="deal-touches" className="space-y-2.5">
      <p id="deal-touches" className="eyebrow">
        Reuniões e ligações
      </p>
      <ul className="divide-y divide-border rounded-2xl border border-border bg-surface text-[13px]">
        {room.meetings.map((m) => (
          <li key={m.id}>
            <Link
              to="/reunioes/$meetingId"
              params={{ meetingId: m.id }}
              className="flex items-center gap-2.5 px-3 py-2 hover:bg-surface-2"
            >
              <Video className="size-3.5 shrink-0 text-subtle" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{m.title}</span>
              <span className="text-[11px] text-subtle">
                {MEETING_STATUS[m.status] ?? m.status}
                {m.score !== null && ` · nota ${m.score}`} · {formatRelative(m.at)}
              </span>
            </Link>
          </li>
        ))}
        {room.calls.map((c) => (
          <li key={c.id}>
            <Link
              to="/ligacoes"
              search={{ chamada: c.id }}
              className="flex items-center gap-2.5 px-3 py-2 hover:bg-surface-2"
            >
              <Phone className="size-3.5 shrink-0 text-subtle" aria-hidden />
              <span className="min-w-0 flex-1 truncate">
                {c.direction === "inbound" ? "Recebida" : "Feita"} ·{" "}
                {CALL_STATUS[c.status] ?? c.status}
                {c.seconds ? ` · ${Math.max(1, Math.round(c.seconds / 60))} min` : ""}
              </span>
              <span className="text-[11px] text-subtle">{formatRelative(c.at)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
