import { hasChannel } from "@/lib/edition";
import { useState } from "react";
import {
  CalendarCheck2,
  CalendarX2,
  ChevronLeft,
  Clock,
  Globe2,
  Loader2,
  MapPin,
  Video,
} from "lucide-react";
import { toast } from "sonner";

import { Logo } from "@/components/layout/Logo";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/functions";
import { initials } from "@/lib/format";

import { bookSlot, usePublicPage, usePublicSlots, type BookResult } from "./api";
import { SlotPicker } from "./SlotPicker";
import { dayLabel } from "./day-label";
import type { Slot } from "./slots";

const LOCATION: Record<string, { icon: typeof Video; label: string }> = {
  nexus_meet: { icon: Video, label: "Videochamada (link enviado na confirmação)" },
  phone: { icon: Clock, label: "Ligação telefônica" },
  in_person: { icon: MapPin, label: "Presencial" },
  custom: { icon: MapPin, label: "Local combinado" },
};

// Página pública de agendamento: escolhe o dia, o horário, preenche os dados e recebe o convite.
export function PublicBookingPage({ slug }: { slug: string }) {
  const page = usePublicPage(slug);
  const slots = usePublicSlots(slug, page.isSuccess);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [done, setDone] = useState<BookResult | null>(null);

  if (page.isError)
    return (
      <Frame>
        <div className="py-20 text-center">
          <CalendarX2 className="mx-auto size-10 text-subtle" />
          <h1 className="mt-4 font-display text-[22px] font-medium">
            Página de agendamento indisponível
          </h1>
          <p className="mt-2 text-[14px] text-muted-foreground">{errorMessage(page.error)}</p>
        </div>
      </Frame>
    );
  if (page.isPending)
    return (
      <Frame>
        <Skeleton className="h-[420px] w-full rounded-[28px]" />
      </Frame>
    );
  const p = page.data;
  const tz = p.time_zone;
  const Loc = LOCATION[p.location] ?? LOCATION["nexus_meet"]!;

  if (done) return <Confirmed result={done} page={p} />;

  return (
    <Frame>
      <div className="grid overflow-hidden rounded-[32px] border border-border bg-surface md:grid-cols-[300px_1fr]">
        <aside className="relative overflow-hidden bg-[#001F35] p-7 text-white">
          <div
            className="hero-orb pointer-events-none absolute -top-20 -right-20 size-56 rounded-full bg-white/10 blur-3xl"
            aria-hidden
          />
          <p className="text-[11px] font-medium tracking-[0.18em] text-white/60 uppercase">
            {p.account_name}
          </p>
          {p.host && (
            <div className="mt-5 flex items-center gap-3">
              {p.host.avatar_url ? (
                <img src={p.host.avatar_url} alt="" className="size-11 rounded-full object-cover" />
              ) : (
                <span className="grid size-11 place-items-center rounded-full bg-white/15 text-[13px] font-semibold">
                  {initials(p.host.name)}
                </span>
              )}
              <span className="text-[14px] text-white/80">{p.host.name}</span>
            </div>
          )}
          <h1 className="mt-5 font-display text-[26px] leading-tight font-medium">{p.title}</h1>
          {p.description && (
            <p className="mt-3 text-[14px] leading-relaxed text-white/75">{p.description}</p>
          )}
          <ul className="mt-6 space-y-2.5 text-[13px] text-white/80">
            <li className="flex items-center gap-2">
              <Clock className="size-4 text-white/60" /> {p.duration_min} minutos
            </li>
            <li className="flex items-center gap-2">
              <Loc.icon className="size-4 text-white/60" /> {p.location_detail ?? Loc.label}
            </li>
            <li className="flex items-center gap-2">
              <Globe2 className="size-4 text-white/60" /> Horários de {tz.replace("_", " ")}
            </li>
          </ul>
        </aside>

        <section className="p-6 sm:p-8">
          {slot ? (
            <BookingForm
              slug={slug}
              slot={slot}
              tz={tz}
              questions={p.questions}
              onBack={() => setSlot(null)}
              onDone={setDone}
            />
          ) : (
            <>
              <h2 className="text-[16px] font-medium">Escolha um dia e horário</h2>
              <SlotPicker
                slots={slots.data?.slots ?? []}
                tz={tz}
                pending={slots.isPending}
                onPick={setSlot}
              />
            </>
          )}
        </section>
      </div>
    </Frame>
  );
}

function BookingForm({
  slug,
  slot,
  tz,
  questions,
  onBack,
  onDone,
}: {
  slug: string;
  slot: Slot;
  tz: string;
  questions: { id: string; label: string; type: string; required: boolean; options?: string[] }[];
  onBack: () => void;
  onDone: (r: BookResult) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      onDone(
        await bookSlot({ slug, start: slot.start, name, email, phone, answers, consent, website }),
      );
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)}>
      <button
        type="button"
        onClick={onBack}
        className="mb-3 inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-3.5" /> Trocar horário
      </button>
      <p className="rounded-2xl bg-surface-2 px-4 py-3 text-[14px] font-medium first-letter:uppercase">
        {dayLabel(slot.date, tz).full} às {slot.label}
      </p>
      <div className="mt-5 grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="bk-name">Seu nome</Label>
          <Input
            id="bk-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoComplete="name"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="bk-email">E-mail</Label>
            <Input
              id="bk-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="bk-phone">WhatsApp</Label>
            <Input
              id="bk-phone"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(11) 99999-0000"
              autoComplete="tel"
            />
          </div>
        </div>
        {questions.map((q) => (
          <div key={q.id} className="grid gap-1.5">
            <Label htmlFor={`bk-${q.id}`}>
              {q.label}
              {q.required && <span className="text-danger"> *</span>}
            </Label>
            {q.type === "long_text" ? (
              <Textarea
                id={`bk-${q.id}`}
                rows={3}
                value={answers[q.id] ?? ""}
                onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
              />
            ) : q.type === "select" ? (
              <Select
                value={answers[q.id] ?? ""}
                onValueChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))}
              >
                <SelectTrigger id={`bk-${q.id}`}>
                  <SelectValue placeholder="Escolha" />
                </SelectTrigger>
                <SelectContent>
                  {(q.options ?? []).map((o) => (
                    <SelectItem key={o} value={o}>
                      {o}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                id={`bk-${q.id}`}
                value={answers[q.id] ?? ""}
                onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
              />
            )}
          </div>
        ))}
        <input
          type="text"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          tabIndex={-1}
          autoComplete="off"
          aria-hidden
          className="hidden"
        />
        <label className="flex items-start gap-2.5 text-[12px] text-muted-foreground">
          <Checkbox
            checked={consent}
            onCheckedChange={(c) => setConsent(c === true)}
            className="mt-0.5"
          />
          {hasChannel("video")
            ? "Concordo em receber a confirmação e os lembretes por e-mail e WhatsApp e com a gravação e transcrição da reunião para registrar o que for combinado."
            : "Concordo em receber a confirmação e os lembretes pelo WhatsApp."}
        </label>
        <Button
          type="submit"
          size="lg"
          disabled={busy || name.trim().length < 2 || (!email && !phone)}
        >
          {busy && <Loader2 className="animate-spin" />} Confirmar agendamento
        </Button>
      </div>
    </form>
  );
}

function Confirmed({
  result,
  page,
}: {
  result: BookResult;
  page: { title: string; account_name: string };
}) {
  const when = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: result.timeZone,
  }).format(new Date(result.start));
  return (
    <Frame>
      <div className="relative overflow-hidden rounded-[32px] bg-[#001F35] px-8 py-12 text-center text-white">
        <div
          className="hero-orb pointer-events-none absolute -top-24 left-1/2 size-80 -translate-x-1/2 rounded-full bg-white/10 blur-3xl"
          aria-hidden
        />
        <CalendarCheck2 className="relative mx-auto size-10" />
        <h1 className="relative mt-4 font-display text-[28px] font-medium">Reunião confirmada</h1>
        <p className="relative mt-2 text-[15px] text-white/80 first-letter:uppercase">{when}</p>
        <p className="relative mt-1 text-[13px] text-white/60">
          {page.title} · {page.account_name}
        </p>
        {result.message && (
          <p className="relative mx-auto mt-5 max-w-md text-[14px] text-white/80">
            {result.message}
          </p>
        )}
        <p className="relative mx-auto mt-5 max-w-md text-[13px] text-white/70">
          {hasChannel("video")
            ? "Enviamos o convite com o link da sala para o seu e-mail e WhatsApp, com lembretes um dia e uma hora antes."
            : "Você recebe a confirmação e os lembretes pelo WhatsApp."}
        </p>
        {result.joinUrl && (
          <Button asChild className="relative mt-6 bg-white text-[#001F35] hover:bg-white/90">
            <a href={result.joinUrl}>Guardar o link da sala</a>
          </Button>
        )}
      </div>
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="atmosphere min-h-dvh bg-background">
      <header className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-5">
        <Logo className="w-8" />
        <span className="text-[12px] text-subtle">Agendamento</span>
      </header>
      <main className="mx-auto max-w-5xl px-4 pb-16">{children}</main>
    </div>
  );
}
