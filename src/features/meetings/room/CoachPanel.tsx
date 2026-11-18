import { useCallback, useMemo, useState } from "react";
import { useDataChannel } from "@livekit/components-react";
import {
  AlertTriangle,
  CheckCircle2,
  Gauge,
  HelpCircle,
  ListChecks,
  MessageCircleWarning,
  Swords,
  Target,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

import { formatMoney } from "@/lib/format";

import { useCoachTips, useDismissTip, useMeeting } from "../api";

export interface LiveTip {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  at: number;
  dismissed?: boolean;
}

const KIND: Record<string, { icon: LucideIcon; label: string; tone: string }> = {
  objection: {
    icon: MessageCircleWarning,
    label: "Objeção",
    tone: "border-white/25 bg-white/[0.08]",
  },
  closing: { icon: Target, label: "Fechamento", tone: "border-[#1F8A5B]/60 bg-[#1F8A5B]/15" },
  battlecard: { icon: Swords, label: "Concorrente", tone: "border-white/20 bg-white/[0.06]" },
  checklist: { icon: ListChecks, label: "Roteiro", tone: "border-white/15 bg-white/[0.04]" },
  compliance: {
    icon: AlertTriangle,
    label: "Cuidado",
    tone: "border-[#B85C5C]/60 bg-[#B85C5C]/15",
  },
  pace: { icon: Gauge, label: "Ritmo", tone: "border-white/15 bg-white/[0.04]" },
  question: { icon: HelpCircle, label: "Pergunta", tone: "border-white/15 bg-white/[0.04]" },
};

interface Props {
  meetingId: string;
  checklist: {
    covered: string[];
    pending: { id: string; label: string; phase: string }[];
    progress: number;
  } | null;
}

// Painel do livecoach: só o vendedor vê. Dicas chegam pelo data channel "coach" (endereçado a ele)
// e, como reserva, pela tabela coach_tips em tempo real.
export function CoachPanel({ meetingId, checklist }: Props) {
  const [live, setLive] = useState<LiveTip[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [state, setState] = useState(checklist);
  const db = useCoachTips(meetingId, true);
  const dismiss = useDismissTip(meetingId);

  const onMessage = useCallback((msg: { payload: Uint8Array }) => {
    try {
      const data = JSON.parse(new TextDecoder().decode(msg.payload)) as {
        tips?: { key?: string; kind: string; title: string; body?: string }[];
        checklist?: Props["checklist"];
      };
      if (data.checklist) setState(data.checklist);
      if (data.tips?.length)
        setLive((prev) =>
          [
            ...data.tips!.map((t, i) => ({
              id: `${t.key ?? t.title}-${Date.now()}-${i}`,
              kind: t.kind,
              title: t.title,
              body: t.body ?? null,
              at: Date.now(),
            })),
            ...prev,
          ].slice(0, 50),
        );
    } catch {
      // mensagem fora do formato: ignora
    }
  }, []);
  useDataChannel("coach", onMessage);

  const tips = useMemo(() => {
    const fromDb: LiveTip[] = (db.data ?? []).map((t) => ({
      id: t.id,
      kind: t.kind,
      title: t.title,
      body: t.body,
      at: new Date(t.created_at).getTime(),
      dismissed: t.dismissed,
    }));
    const seen = new Set<string>();
    return [...live, ...fromDb]
      .sort((a, b) => b.at - a.at)
      .filter((t) => {
        const k = `${t.kind}:${t.title}`;
        if (seen.has(k) || t.dismissed || hidden.has(t.id)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, 12);
  }, [live, db.data, hidden]);

  const pct = Math.round((state?.progress ?? 0) * 100);
  const meeting = useMeeting(meetingId);
  const deal = meeting.data?.deal ?? null;
  const contact = meeting.data?.contact ?? null;

  function hide(t: LiveTip) {
    setHidden((s) => new Set(s).add(t.id));
    // dica que veio do banco fica dispensada também para depois
    if (/^[0-9a-f-]{36}$/.test(t.id)) dismiss.mutate(t.id);
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 text-white">
      <header className="flex items-center gap-3">
        <span className="grid size-8 place-items-center rounded-xl border border-white/10 bg-white/[0.05]">
          <Target className="size-4 text-white/70" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold">Livecoach</p>
          <p className="text-[10px] tracking-[0.16em] text-white/50 uppercase">
            Só você vê · tempo real
          </p>
        </div>
        <span className="relative flex size-2" aria-label="ao vivo">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#1F8A5B] opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-[#1F8A5B]" />
        </span>
      </header>

      {(deal || contact) && (
        <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <p className="text-[10px] tracking-[0.16em] text-white/50 uppercase">
            Contexto do negócio
          </p>
          <div className="mt-2 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold">{deal?.title ?? contact?.name}</p>
              {contact?.name && deal && (
                <p className="truncate text-[12px] text-white/60">{contact.name}</p>
              )}
            </div>
            {deal && (
              <span className="shrink-0 font-display text-[15px] font-semibold tabular-nums">
                {formatMoney(deal.value ?? 0, true)}
              </span>
            )}
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <div className="flex items-center justify-between">
          <p className="text-[10px] tracking-[0.16em] text-white/50 uppercase">
            Roteiro do playbook
          </p>
          <span
            className={cn("text-[12px] font-semibold tabular-nums", pct >= 100 && "text-[#3fae7c]")}
          >
            {pct}%
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.45)] transition-[width] duration-700"
            style={{ width: `${pct}%` }}
          />
        </div>
        {state && state.pending.length > 0 ? (
          <ul className="mt-3 space-y-1">
            {state.covered.length > 0 && (
              <li className="flex items-center gap-2 text-[12px] text-white/40">
                <CheckCircle2 className="size-3.5" /> {state.covered.length}{" "}
                {state.covered.length === 1 ? "item coberto" : "itens cobertos"}
              </li>
            )}
            {state.pending.slice(0, 4).map((p, i) => (
              <li
                key={p.id}
                className={cn(
                  "flex items-start gap-2 rounded-lg text-[12px]",
                  i === 0
                    ? "-mx-2 border border-white/10 bg-white/[0.06] p-2 text-white"
                    : "text-white/75",
                )}
              >
                <span
                  className={cn(
                    "mt-1 size-1.5 shrink-0 rounded-full",
                    i === 0 ? "bg-white" : "bg-white/40",
                  )}
                />
                <span>
                  {p.label}
                  {i === 0 && (
                    <span className="block text-[11px] text-white/50">
                      Próximo do roteiro ({p.phase})
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 flex items-center gap-1.5 text-[12px] text-white/70">
            <CheckCircle2 className="size-3.5" />{" "}
            {state ? "Roteiro obrigatório coberto." : "O coach começa quando a conversa começar."}
          </p>
        )}
      </section>

      <div className="flex items-center gap-2 px-1">
        <Zap className="size-3.5 text-white/50" aria-hidden />
        <p className="text-[10px] tracking-[0.16em] text-white/50 uppercase">Dicas ao vivo</p>
      </div>
      <ul className="-mt-2 min-h-0 flex-1 space-y-2.5 overflow-y-auto pr-1" aria-live="polite">
        {tips.length === 0 && (
          <li className="rounded-2xl border border-dashed border-white/15 p-4 text-[12px] text-white/60">
            Quando o cliente trouxer uma objeção, citar concorrente ou der sinal de compra, a dica
            aparece aqui. Só você vê.
          </li>
        )}
        {tips.map((t, i) => {
          const meta = KIND[t.kind] ?? KIND["question"]!;
          const featured = i === 0;
          return (
            <li
              key={t.id}
              className={cn(
                "relative overflow-hidden rounded-2xl border p-4 transition-opacity",
                meta.tone,
                featured
                  ? "shadow-[0_12px_32px_-14px_rgba(0,0,0,0.6)]"
                  : "opacity-75 hover:opacity-100",
              )}
            >
              {featured && (
                <span className="absolute inset-y-0 left-0 w-1 bg-white/80" aria-hidden />
              )}
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.12em] text-white/80 uppercase">
                  <meta.icon className="size-3" aria-hidden /> {meta.label}
                </span>
                <span className="text-[10px] text-white/45">{ago(t.at)}</span>
              </div>
              <p className="mt-2 text-[13px] leading-snug font-semibold">{t.title}</p>
              {t.body &&
                (featured ? (
                  <div className="mt-3 rounded-xl border border-white/[0.06] bg-black/25 p-3">
                    <p className="text-[10px] tracking-[0.14em] text-white/45 uppercase">
                      Como responder
                    </p>
                    <p className="mt-1 text-[12px] leading-relaxed whitespace-pre-line text-white/90">
                      {t.body}
                    </p>
                  </div>
                ) : (
                  <p className="mt-1 line-clamp-3 text-[12px] leading-relaxed whitespace-pre-line text-white/75">
                    {t.body}
                  </p>
                ))}
              {featured ? (
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => hide(t)}
                    className="flex-1 rounded-full bg-white py-1.5 text-[12px] font-semibold text-[#001F35] transition-transform active:scale-[0.98]"
                  >
                    Usei
                  </button>
                  <button
                    type="button"
                    onClick={() => hide(t)}
                    className="rounded-full border border-white/15 px-3 py-1.5 text-[12px] text-white/70 hover:bg-white/10 hover:text-white"
                  >
                    Dispensar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  aria-label="Dispensar dica"
                  onClick={() => hide(t)}
                  className="absolute top-2 right-2 rounded-full p-1 text-white/50 hover:bg-white/10 hover:text-white"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ago(at: number): string {
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (s < 30) return "agora";
  if (s < 3600) return `há ${Math.max(1, Math.round(s / 60))} min`;
  return `há ${Math.round(s / 3600)} h`;
}
