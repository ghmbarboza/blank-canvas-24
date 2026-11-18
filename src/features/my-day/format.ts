export function greeting(hour: number): string {
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

// Hora da parede no fuso da conta.
export function wallHour(d: Date, tz: string): number {
  const h = new Intl.DateTimeFormat("pt-BR", { hour: "numeric", hour12: false, timeZone: tz })
    .formatToParts(d)
    .find((p) => p.type === "hour")?.value;
  return Number(h ?? d.getHours()) % 24;
}

export function formatClock(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: tz,
  }).format(new Date(iso));
}

export function formatToday(d: Date, tz: string): string {
  const s = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: tz,
  }).format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const PROVIDERS: Array<[RegExp, string]> = [
  [/(^|\.)meet\.google\.com$/, "Google Meet"],
  [/(^|\.)zoom\.us$/, "Zoom"],
  [/(^|\.)teams\.(microsoft|live)\.com$/, "Teams"],
  [/(^|\.)whereby\.com$/, "Whereby"],
];

// Nome do serviço da reunião pelo domínio do link; desconhecido vira "Link da reunião".
export function meetingProvider(url: string | null): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname;
    return PROVIDERS.find(([re]) => re.test(host))?.[1] ?? "Link da reunião";
  } catch {
    return null;
  }
}

// "há 8 dias" a partir da última mudança.
export function daysSince(iso: string, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000));
}
