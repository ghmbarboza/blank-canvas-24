import { formatNumber } from "./format";

/** Palavra no singular ou no plural conforme a quantidade (1 → singular; 0 e 2+ → plural). */
export function plural(
  n: number | null | undefined,
  one: string,
  many: string = `${one}s`,
): string {
  return Number(n ?? 0) === 1 ? one : many;
}

/** Quantidade formatada em pt-BR + palavra concordando: "1 negócio", "2 negócios", "3 canais". */
export function countLabel(
  n: number | null | undefined,
  one: string,
  many: string = `${one}s`,
): string {
  return `${formatNumber(Number(n ?? 0))} ${plural(n, one, many)}`;
}
