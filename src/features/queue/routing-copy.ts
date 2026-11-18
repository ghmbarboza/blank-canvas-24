// Textos da tela Fila e roteamento: a fila como uma frase que o gestor lê de bate-pronto,
// com os pedaços que mudam destacados, e quem da equipe atende cada fila.

import { OVERFLOW_LABEL, channelLabel, type AgentState } from "./lib";

/** Bolinha de presença: verde só para disponível de verdade. */
export const PRESENCE_DOT: Record<AgentState, string> = {
  available: "bg-success",
  busy: "bg-primary",
  wrap_up: "bg-warm",
  paused: "bg-border-strong",
  offline: "bg-surface-3 ring-1 ring-border-strong",
};

export interface Segment {
  text: string;
  strong?: boolean;
}

function orList(values: string[]): Segment[] {
  const out: Segment[] = [];
  values.forEach((v, i) => {
    if (i > 0) out.push({ text: i === values.length - 1 ? " ou " : ", " });
    out.push({ text: v, strong: true });
  });
  return out;
}

/** "Se o cliente chegar por WhatsApp ou Telefone, vai para quem sabe suporte (nível 3 ou mais)." */
export function queueSentence(q: {
  channels: string[];
  skills: string[];
  required_level: number;
  sla_seconds: number;
  overflow: string;
}): Segment[] {
  const channels = q.channels.map(channelLabel);
  const head: Segment[] = channels.length
    ? [{ text: "Se o cliente chegar por " }, ...orList(channels), { text: ", " }]
    : [{ text: "Sem canal escolhido, nada entra aqui. " }];
  const skill = q.skills[0];
  const who: Segment[] = skill
    ? [
        { text: "vai para quem sabe " },
        { text: skill, strong: true },
        { text: q.required_level > 1 ? ` (nível ${q.required_level} ou mais)` : "" },
      ]
    : [{ text: "vai para " }, { text: "qualquer pessoa da equipe", strong: true }];
  const sla: Segment[] = q.channels.includes("voice")
    ? [{ text: ". Atender em até " }, { text: `${q.sla_seconds} s`, strong: true }]
    : [];
  const overflow = OVERFLOW_LABEL[q.overflow] ?? q.overflow;
  return [
    ...head,
    ...who,
    ...sla,
    { text: ". Se ninguém estiver livre, " },
    { text: overflow },
    { text: "." },
  ].filter((s) => s.text);
}

/** Quem pode receber da fila: ativo na fila e com a habilidade no nível pedido (sem habilidade: todos). */
export function queueMembers<
  T extends {
    userId: string;
    agent: { is_active: boolean } | null;
    skills: { skill: string; level: number }[];
  },
>(q: { skills: string[]; required_level: number }, team: T[]): T[] {
  const skill = q.skills[0];
  return team.filter(
    (m) =>
      Boolean(m.agent?.is_active) &&
      (!skill || m.skills.some((s) => s.skill === skill && s.level >= q.required_level)),
  );
}

/** Uso por canal frente ao limite: "acima" quando passa do que a pessoa aguenta ao mesmo tempo. */
export function capacityTone(used: number, cap: number): "idle" | "ok" | "full" | "over" {
  if (cap <= 0) return used > 0 ? "over" : "idle";
  if (used > cap) return "over";
  if (used === cap) return "full";
  return used === 0 ? "idle" : "ok";
}
