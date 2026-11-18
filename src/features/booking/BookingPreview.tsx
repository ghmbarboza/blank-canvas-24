import { useMemo, useState } from "react";
import { Clock, Eye, MapPin, Phone, Video } from "lucide-react";

import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

import type { BookingPage } from "./api";
import { computeSlots, zonedParts, type Availability, type Slot } from "./slots";

const LOCATION: Record<string, { icon: typeof Video; label: string }> = {
  nexus_meet: { icon: Video, label: "Videochamada" },
  phone: { icon: Phone, label: "Ligação" },
  in_person: { icon: MapPin, label: "Presencial" },
  custom: { icon: MapPin, label: "Local combinado" },
};

const WEEK = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const PREVIEW_DAYS = 21;

type Props = {
  page: BookingPage;
  accountName: string;
  timeZone: string;
  url: string;
};

interface DayCell {
  date: string;
  day: number;
  slots: Slot[];
}

// Monta as três próximas semanas a partir do domingo desta semana, com os horários do expediente.
function buildDays(page: BookingPage, timeZone: string, now: number): DayCell[] {
  const slots = computeSlots({
    timeZone,
    now,
    availability: (page.availability ?? {}) as Availability,
    durationMin: page.duration_min,
    bufferMin: page.buffer_min,
    stepMin: page.step_min,
    minNoticeMin: page.min_notice_min,
    windowDays: Math.min(page.window_days, PREVIEW_DAYS),
    busy: [],
  });
  const byDate = new Map<string, Slot[]>();
  for (const s of slots) byDate.set(s.date, [...(byDate.get(s.date) ?? []), s]);
  const today = zonedParts(now, timeZone);
  const start = now - today.weekday * 86_400_000;
  return Array.from({ length: PREVIEW_DAYS }, (_, i) => {
    const p = zonedParts(start + i * 86_400_000, timeZone);
    const date = `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
    return { date, day: p.day, slots: byDate.get(date) ?? [] };
  });
}

// Prévia do que o cliente vê ao abrir o link: quem recebe, duração, local e os dias com horário.
export function BookingPreview({ page, accountName, timeZone, url }: Props) {
  const days = useMemo(() => buildDays(page, timeZone, Date.now()), [page, timeZone]);
  const firstOpen = days.find((d) => d.slots.length > 0);
  const [picked, setPicked] = useState<string | null>(null);
  const selected = days.find((d) => d.date === picked && d.slots.length > 0) ?? firstOpen;
  const Loc = LOCATION[page.location] ?? LOCATION["nexus_meet"]!;
  const monthText = selected
    ? new Date(`${selected.date}T12:00:00`).toLocaleDateString("pt-BR", {
        month: "long",
        year: "numeric",
      })
    : "";
  const monthLabel = monthText.charAt(0).toUpperCase() + monthText.slice(1);

  return (
    <section aria-labelledby="booking-preview" className="flex flex-col gap-4">
      <h2 id="booking-preview" className="eyebrow flex items-center gap-2">
        <Eye className="size-3.5" aria-hidden /> Prévia da página pública
      </h2>
      <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-lift">
        <div className="flex items-center gap-3 border-b border-border bg-surface-2 px-4 py-2.5">
          <span className="flex gap-1.5" aria-hidden>
            <span className="size-2.5 rounded-full bg-surface-3" />
            <span className="size-2.5 rounded-full bg-surface-3" />
            <span className="size-2.5 rounded-full bg-surface-3" />
          </span>
          <span className="min-w-0 flex-1 truncate rounded-md border border-border bg-surface px-3 py-1 text-center font-mono text-[11px] text-subtle">
            {url.replace(/^https?:\/\//, "")}
          </span>
        </div>
        <div className="grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="border-b border-border p-6 lg:border-r lg:border-b-0">
            <span className="grid size-11 place-items-center rounded-full bg-primary text-[13px] font-semibold text-primary-foreground">
              {initials(accountName)}
            </span>
            <p className="mt-5 text-[12px] text-muted-foreground">{accountName}</p>
            <p className="font-display text-[22px] leading-tight font-semibold">{page.title}</p>
            <ul className="mt-4 space-y-2 text-[13px] text-muted-foreground">
              <li className="flex items-center gap-2">
                <Clock className="size-4 text-subtle" aria-hidden /> {page.duration_min} min
              </li>
              <li className="flex items-center gap-2">
                <Loc.icon className="size-4 text-subtle" aria-hidden />
                {page.location_detail ?? Loc.label}
              </li>
            </ul>
            {page.description && (
              <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">
                {page.description}
              </p>
            )}
          </div>
          <div className="p-6">
            <p className="font-display text-[16px] font-semibold">Escolha o dia e o horário</p>
            <p className="mt-0.5 text-[12px] text-subtle">{monthLabel}</p>
            <div className="mt-4 grid grid-cols-7 gap-1 text-center">
              {WEEK.map((w) => (
                <span key={w} className="pb-1 text-[11px] text-subtle">
                  {w}
                </span>
              ))}
              {days.map((d) => {
                const open = d.slots.length > 0;
                const isSel = selected?.date === d.date;
                return (
                  <button
                    key={d.date}
                    type="button"
                    disabled={!open}
                    onClick={() => setPicked(d.date)}
                    aria-pressed={isSel}
                    aria-label={`${d.day}: ${open ? `${d.slots.length} horários` : "sem horário"}`}
                    className={cn(
                      "mx-auto grid size-9 place-items-center rounded-full text-[13px] tabular-nums transition-colors",
                      "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      open ? "font-medium text-foreground hover:bg-surface-2" : "text-subtle/60",
                      isSel && "bg-primary text-primary-foreground hover:bg-primary",
                    )}
                  >
                    {d.day}
                  </button>
                );
              })}
            </div>
            {selected ? (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {selected.slots.slice(0, 8).map((s) => (
                  <span
                    key={s.start}
                    className="rounded-full border border-border px-3 py-1 text-[12px] tabular-nums"
                  >
                    {s.label}
                  </span>
                ))}
                {selected.slots.length > 8 && (
                  <span className="px-1 py-1 text-[12px] text-subtle">
                    +{selected.slots.length - 8}
                  </span>
                )}
              </div>
            ) : (
              <p className="mt-4 text-[13px] text-muted-foreground">
                Nenhum dia aberto nas próximas três semanas. Edite o expediente do link.
              </p>
            )}
          </div>
        </div>
      </div>
      <p className="text-[12px] text-subtle">
        Mostra o expediente do link. Na página de verdade, o que já está ocupado na agenda de quem
        atende some da lista.
      </p>
    </section>
  );
}
