import { format, formatDistanceToNowStrict, isToday, isYesterday, isThisWeek } from "date-fns";
import { ptBR } from "date-fns/locale";

const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});
const BRL_COMPACT = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});
const NUMBER = new Intl.NumberFormat("pt-BR");

export function formatMoney(value: number | string | null | undefined, compact = false): string {
  const n = Number(value ?? 0);
  return (compact && Math.abs(n) >= 10_000 ? BRL_COMPACT : BRL).format(Number.isFinite(n) ? n : 0);
}

export function formatNumber(value: number | null | undefined): string {
  return NUMBER.format(value ?? 0);
}

// "14:32", "Ontem", "seg", "12/10" — o que a lista de conversas mostra.
export function formatListTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isToday(d)) return format(d, "HH:mm");
  if (isYesterday(d)) return "Ontem";
  if (isThisWeek(d, { weekStartsOn: 1 })) return format(d, "EEE", { locale: ptBR });
  return format(d, "dd/MM");
}

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  return formatDistanceToNowStrict(new Date(iso), { locale: ptBR, addSuffix: true });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return format(new Date(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
}

export function formatDayLabel(iso: string): string {
  const d = new Date(iso);
  if (isToday(d)) return "Hoje";
  if (isYesterday(d)) return "Ontem";
  return format(d, "d 'de' MMMM", { locale: ptBR });
}

export function initials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

// +55 11 98888-7777 a partir de dígitos brasileiros; outros países ficam como vieram.
export function formatPhone(raw: string | null | undefined): string {
  if (!raw) return "";
  const d = raw.replace(/\D/g, "");
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) {
    const ddd = d.slice(2, 4);
    const rest = d.slice(4);
    const split = rest.length === 9 ? 5 : 4;
    return `+55 ${ddd} ${rest.slice(0, split)}-${rest.slice(split)}`;
  }
  return d.length > 6 ? `+${d}` : raw;
}
