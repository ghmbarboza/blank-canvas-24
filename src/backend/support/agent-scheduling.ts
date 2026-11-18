// Agendamento pelo agente do WhatsApp (puro): quais horários oferecer à IA e como conferir a escolha.
// A IA recebe a lista com códigos (H1, H2…) e devolve o código; o servidor só aceita um código oferecido.

export interface FreeSlot {
  start: string; // ISO UTC
  date: string; // "2026-10-22" no fuso da conta
  label: string; // "14:30"
}

export interface OfferedSlot {
  code: string;
  start: string;
  human: string; // "quinta-feira, 23/10 às 14:30"
}

function weekdayOf(date: string): string {
  return new Intl.DateTimeFormat("pt-BR", { weekday: "long", timeZone: "UTC" }).format(
    new Date(`${date}T12:00:00Z`),
  );
}

/** Espalha a oferta: até `perDay` horários por dia (um de manhã e um à tarde quando der), no máximo `max`. */
export function offerSlots(slots: FreeSlot[], max = 6, perDay = 2): OfferedSlot[] {
  const byDay = new Map<string, FreeSlot[]>();
  for (const s of slots) byDay.set(s.date, [...(byDay.get(s.date) ?? []), s]);
  const picked: FreeSlot[] = [];
  for (const [, list] of [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (picked.length >= max) break;
    const sorted = [...list].sort((a, b) => a.start.localeCompare(b.start));
    const morning = sorted.find((s) => s.label < "12:00");
    const afternoon = sorted.find((s) => s.label >= "13:00");
    const choice = [morning, afternoon].filter((s): s is FreeSlot => Boolean(s));
    for (const s of sorted) if (choice.length < perDay && !choice.includes(s)) choice.push(s);
    picked.push(...choice.slice(0, perDay).sort((a, b) => a.start.localeCompare(b.start)));
  }
  return picked.slice(0, max).map((s, i) => {
    const [, m, d] = s.date.split("-");
    return {
      code: `H${i + 1}`,
      start: s.start,
      human: `${weekdayOf(s.date)}, ${d}/${m} às ${s.label}`,
    };
  });
}

/** Código escolhido pela IA → horário. Qualquer coisa fora da lista oferecida é recusada. */
export function resolveSlotChoice(code: unknown, offered: OfferedSlot[]): OfferedSlot | null {
  if (typeof code !== "string") return null;
  const c = code.trim().toUpperCase();
  return offered.find((o) => o.code === c) ?? null;
}

export function schedulingPrompt(offered: OfferedSlot[]): string {
  if (!offered.length)
    return "AGENDA: não há horários livres nos próximos dias. Se o cliente quiser marcar uma reunião, diga que a equipe vai propor um horário e use action=handoff.";
  return [
    "AGENDA: você pode marcar uma reunião por vídeo com a equipe. Horários livres (use só estes):",
    ...offered.map((o) => `${o.code}: ${o.human}`),
    "Ofereça 2 ou 3 opções quando o cliente quiser conversar ou marcar. Só use action=book com book_slot = código quando o cliente escolher claramente um horário da lista; a reply então confirma o dia e a hora e diz que o link chega por mensagem. Nunca invente horário fora da lista.",
  ].join("\n");
}
