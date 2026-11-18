// Posição em float: o cartão solto entre dois vizinhos fica no meio deles, sem renumerar a coluna.
export const POSITION_GAP = 1024;

export function positionBetween(prev: number | undefined, next: number | undefined): number {
  if (prev === undefined && next === undefined) return POSITION_GAP;
  if (prev === undefined) return (next as number) - POSITION_GAP;
  if (next === undefined) return prev + POSITION_GAP;
  return (prev + next) / 2;
}

// Calcula a posição do item `id` dentro da lista ordenada final da coluna.
export function positionInList(
  ids: string[],
  id: string,
  positionOf: (id: string) => number | undefined,
): number {
  const i = ids.indexOf(id);
  const prevId = i > 0 ? ids[i - 1] : undefined;
  const nextId = i >= 0 ? ids[i + 1] : undefined;
  return positionBetween(
    prevId ? positionOf(prevId) : undefined,
    nextId ? positionOf(nextId) : undefined,
  );
}
