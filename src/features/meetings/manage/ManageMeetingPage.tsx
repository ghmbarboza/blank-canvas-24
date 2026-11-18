import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarCheck2,
  CalendarClock,
  CalendarX2,
  CheckCircle2,
  ChevronLeft,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

import { Logo } from "@/components/layout/Logo";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { SlotPicker } from "@/features/booking/SlotPicker";
import { dayLabel } from "@/features/booking/day-label";
import type { Slot } from "@/features/booking/slots";
import { errorMessage } from "@/lib/functions";

import { formatWhen, manageCall, type ManageInfo } from "./api";

type Mode = "home" | "pick" | "cancel";
export type ManageIntent = "confirmar" | "remarcar" | null;

// Página do convidado: confirmar presença, remarcar entre os horários livres ou cancelar.
export function ManageMeetingPage({ token, intent }: { token: string; intent: ManageIntent }) {
  const qc = useQueryClient();
  const info = useQuery({
    queryKey: ["meeting-manage", token],
    retry: false,
    queryFn: () => manageCall<ManageInfo>({ token, action: "info" }),
  });
  const [mode, setMode] = useState<Mode>(intent === "remarcar" ? "pick" : "home");
  const [done, setDone] = useState<{ title: string; text: string } | null>(null);
  const autoConfirmed = useRef(false);

  // "Confirmo presença" do lembrete: confirma ao abrir (robôs de e-mail não rodam JavaScript).
  useEffect(() => {
    const i = info.data;
    if (intent !== "confirmar" || !i || autoConfirmed.current) return;
    autoConfirmed.current = true;
    if (i.confirmed || !i.actions.canConfirm) return;
    manageCall({ token, action: "confirm" })
      .then(() => qc.invalidateQueries({ queryKey: ["meeting-manage", token] }))
      .catch((e: unknown) => toast.error(errorMessage(e)));
  }, [intent, info.data, token, qc]);

  if (info.isPending)
    return (
      <Frame>
        <Skeleton className="h-[320px] w-full rounded-[28px]" />
      </Frame>
    );
  if (info.isError)
    return (
      <Frame>
        <Notice icon={CalendarX2} title="Não conseguimos abrir sua reunião">
          {errorMessage(info.error)}
        </Notice>
      </Frame>
    );
  const i = info.data;
  if (done)
    return (
      <Frame>
        <Notice icon={CalendarCheck2} title={done.title} dark>
          {done.text}
        </Notice>
      </Frame>
    );
  if (i.status === "canceled")
    return (
      <Frame>
        <Notice icon={CalendarX2} title="Esta reunião foi cancelada">
          Se quiser conversar, responda a mensagem do convite que a equipe te atende.
        </Notice>
      </Frame>
    );

  const noShow = i.status === "no_show";
  return (
    <Frame>
      <div className="overflow-hidden rounded-[32px] border border-border bg-surface">
        <header className="relative overflow-hidden bg-[#0A1F3B] p-7 text-white">
          <div
            className="hero-orb pointer-events-none absolute -top-20 -right-20 size-56 rounded-full bg-white/10 blur-3xl"
            aria-hidden
          />
          <p className="text-[11px] font-medium tracking-[0.18em] text-white/60 uppercase">
            {i.account_name}
          </p>
          <h1 className="mt-3 font-display text-[26px] leading-tight font-medium">{i.title}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[14px] text-white/80">
            <span className="inline-flex items-center gap-1.5 first-letter:uppercase">
              <CalendarClock className="size-4" /> {formatWhen(i.scheduled_start, i.time_zone)}
            </span>
            {i.host_name && <span>com {i.host_name}</span>}
          </p>
          {i.confirmed && (
            <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[12px] font-medium">
              <CheckCircle2 className="size-3.5" /> Presença confirmada
            </p>
          )}
        </header>
        <section className="p-6 sm:p-8">
          {mode === "pick" ? (
            <Reschedule
              token={token}
              tz={i.time_zone}
              onBack={() => setMode("home")}
              onDone={(start) =>
                setDone({
                  title: "Reunião remarcada",
                  text: `Novo horário: ${formatWhen(start, i.time_zone)}. Enviamos o convite atualizado para o seu e-mail e WhatsApp.`,
                })
              }
            />
          ) : mode === "cancel" ? (
            <CancelForm
              token={token}
              onBack={() => setMode("home")}
              onDone={() =>
                setDone({
                  title: "Reunião cancelada",
                  text: "Avisamos a equipe. Quando quiser, é só pedir um novo horário.",
                })
              }
            />
          ) : (
            <Home
              info={i}
              noShow={noShow}
              token={token}
              onPick={() => setMode("pick")}
              onCancel={() => setMode("cancel")}
            />
          )}
        </section>
      </div>
    </Frame>
  );
}

function Home({
  info,
  noShow,
  token,
  onPick,
  onCancel,
}: {
  info: ManageInfo;
  noShow: boolean;
  token: string;
  onPick: () => void;
  onCancel: () => void;
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const { canConfirm, canCancel, canReschedule } = info.actions;
  async function confirm() {
    setBusy(true);
    try {
      await manageCall({ token, action: "confirm" });
      await qc.invalidateQueries({ queryKey: ["meeting-manage", token] });
      toast.success("Presença confirmada. Até lá!");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  if (!canConfirm && !canCancel && !canReschedule)
    return (
      <p className="text-[14px] text-muted-foreground">
        Esta reunião já aconteceu ou não pode mais ser alterada por aqui. Se precisar, responda a
        mensagem do convite.
      </p>
    );
  return (
    <div className="grid gap-3">
      <p className="text-[14px] text-muted-foreground">
        {noShow
          ? "Sentimos sua falta. Escolha outro horário que funcione melhor para você."
          : "O que você quer fazer?"}
      </p>
      {canConfirm && !info.confirmed && (
        <Button size="lg" disabled={busy} onClick={() => void confirm()}>
          {busy ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Confirmo presença
        </Button>
      )}
      {canReschedule && (
        <Button size="lg" variant={noShow ? "default" : "outline"} onClick={onPick}>
          <CalendarClock /> Escolher outro horário
        </Button>
      )}
      {canCancel && (
        <Button variant="ghost" className="text-muted-foreground" onClick={onCancel}>
          Cancelar a reunião
        </Button>
      )}
    </div>
  );
}

function Reschedule({
  token,
  tz,
  onBack,
  onDone,
}: {
  token: string;
  tz: string;
  onBack: () => void;
  onDone: (start: string) => void;
}) {
  const slots = useQuery({
    queryKey: ["meeting-manage-slots", token],
    retry: false,
    queryFn: () => manageCall<ManageInfo>({ token, action: "info", slots: true }),
  });
  const [picked, setPicked] = useState<Slot | null>(null);
  const [busy, setBusy] = useState(false);
  async function save(s: Slot) {
    setBusy(true);
    try {
      const r = await manageCall<{ start: string }>({
        token,
        action: "reschedule",
        start: s.start,
      });
      onDone(r.start);
    } catch (e) {
      toast.error(errorMessage(e));
      setPicked(null);
      await slots.refetch();
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <button
        type="button"
        onClick={picked ? () => setPicked(null) : onBack}
        className="mb-3 inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-3.5" /> Voltar
      </button>
      {picked ? (
        <div className="grid gap-4">
          <p className="rounded-2xl bg-surface-2 px-4 py-3 text-[14px] font-medium first-letter:uppercase">
            {dayLabel(picked.date, tz).full} às {picked.label}
          </p>
          <Button size="lg" disabled={busy} onClick={() => void save(picked)}>
            {busy && <Loader2 className="animate-spin" />} Confirmar novo horário
          </Button>
        </div>
      ) : (
        <>
          <h2 className="text-[16px] font-medium">Escolha um novo dia e horário</h2>
          {slots.isError ? (
            <p className="mt-4 text-[13px] text-danger">{errorMessage(slots.error)}</p>
          ) : (
            <SlotPicker
              slots={slots.data?.slots ?? []}
              tz={tz}
              pending={slots.isPending}
              onPick={setPicked}
            />
          )}
        </>
      )}
    </div>
  );
}

function CancelForm({
  token,
  onBack,
  onDone,
}: {
  token: string;
  onBack: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  async function cancel() {
    setBusy(true);
    try {
      await manageCall({ token, action: "cancel", reason });
      onDone();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="grid gap-4">
      <h2 className="text-[16px] font-medium">Cancelar a reunião?</h2>
      <label className="grid gap-1.5 text-[13px] text-muted-foreground">
        Se quiser, conte o motivo (opcional)
        <Textarea
          rows={3}
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button variant="destructive" disabled={busy} onClick={() => void cancel()}>
          {busy && <Loader2 className="animate-spin" />} Sim, cancelar
        </Button>
        <Button variant="ghost" onClick={onBack}>
          Voltar
        </Button>
      </div>
    </div>
  );
}

function Notice({
  icon: Icon,
  title,
  children,
  dark = false,
}: {
  icon: typeof CalendarX2;
  title: string;
  children: React.ReactNode;
  dark?: boolean;
}) {
  return (
    <div
      className={
        dark
          ? "rounded-[32px] bg-[#0A1F3B] px-8 py-12 text-center text-white"
          : "rounded-[32px] border border-border bg-surface px-8 py-12 text-center"
      }
    >
      <Icon className={dark ? "mx-auto size-10" : "mx-auto size-10 text-subtle"} />
      <h1 className="mt-4 font-display text-[24px] font-medium">{title}</h1>
      <p
        className={
          dark ? "mt-2 text-[14px] text-white/80" : "mt-2 text-[14px] text-muted-foreground"
        }
      >
        {children}
      </p>
    </div>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="atmosphere min-h-dvh bg-background">
      <header className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-5">
        <Logo className="w-8" />
        <span className="text-[12px] text-subtle">Sua reunião</span>
      </header>
      <main className="mx-auto max-w-2xl px-4 pb-16">{children}</main>
    </div>
  );
}
