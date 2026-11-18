// Colisão entre atendentes (#61): quem mais está nesta conversa e se está digitando.
// Puro: o hook de Realtime entrega o estado de presença e isto decide o que mostrar.

export interface PresenceMeta {
  user_id: string;
  typing: boolean;
}

export interface Viewer {
  userId: string;
  name: string;
  typing: boolean;
}

/** Outras pessoas na conversa (sem eu), uma vez cada, quem digita primeiro. */
export function othersInConversation(
  state: Record<string, PresenceMeta[]>,
  myId: string | null,
  nameOf: (userId: string) => string | undefined,
): Viewer[] {
  const byUser = new Map<string, Viewer>();
  for (const metas of Object.values(state)) {
    for (const m of metas) {
      if (!m?.user_id || m.user_id === myId) continue;
      const prev = byUser.get(m.user_id);
      byUser.set(m.user_id, {
        userId: m.user_id,
        name: nameOf(m.user_id) ?? "Alguém da equipe",
        typing: Boolean(prev?.typing || m.typing),
      });
    }
  }
  return [...byUser.values()].sort((a, b) => Number(b.typing) - Number(a.typing));
}

/** A frase da faixa: digitar pesa mais que só estar vendo. */
export function collisionText(viewers: Viewer[]): string | null {
  if (!viewers.length) return null;
  const typing = viewers.filter((v) => v.typing);
  const list = (vs: Viewer[]) =>
    vs.length === 1
      ? vs[0]!.name
      : `${vs
          .slice(0, -1)
          .map((v) => v.name)
          .join(", ")} e ${vs[vs.length - 1]!.name}`;
  if (typing.length)
    return `${list(typing)} ${typing.length === 1 ? "está" : "estão"} digitando uma resposta. Combine antes para o cliente não receber duas.`;
  return `${list(viewers)} ${viewers.length === 1 ? "também está" : "também estão"} nesta conversa.`;
}
