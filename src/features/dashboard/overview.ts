// Contas do painel de pós-venda. Tudo puro: recebe o que as consultas devolveram e monta o que a
// tela escreve. Sem dado, devolve o vazio com o próximo passo, nunca um número inventado.
import type { RuleRow } from "@/features/posvenda/api";
import { RULES, type RuleKey } from "@/features/posvenda/rules";
import { countLabel } from "@/lib/plural";

export interface SatisfactionInput {
  nps: number | null;
  nps_responses: number;
  csat_avg: number | null;
  csat_responses: number;
  csat_sent: number;
}

export interface Satisfaction {
  /** O indicador em destaque: NPS quando há resposta, senão a nota média (CSAT). */
  kind: "nps" | "csat" | "none";
  value: string;
  foot: string;
}

const one = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

export function satisfaction(m: SatisfactionInput | undefined): Satisfaction {
  if (!m) return { kind: "none", value: "—", foot: "Carregando as pesquisas" };
  const csat = m.csat_avg === null ? null : `Nota média ${one(m.csat_avg)} de 5`;
  if (m.nps !== null && m.nps_responses > 0) {
    return {
      kind: "nps",
      value: String(Math.round(m.nps)),
      foot: [`NPS de ${countLabel(m.nps_responses, "resposta")}`, csat].filter(Boolean).join(" · "),
    };
  }
  if (m.csat_avg !== null && m.csat_responses > 0) {
    return {
      kind: "csat",
      value: `${one(m.csat_avg)}/5`,
      foot: `Nota média de ${countLabel(m.csat_responses, "resposta")}`,
    };
  }
  return {
    kind: "none",
    value: "—",
    foot:
      m.csat_sent > 0
        ? "Pesquisa enviada, ainda sem resposta"
        : "Ligue a Pesquisa de satisfação nas Regras de pós-venda",
  };
}

export interface RuleLine {
  key: RuleKey;
  title: string;
  on: boolean;
  /** Clientes que já passaram pela regra (entradas na automação dela). */
  reached: number;
}

export interface RulesSummary {
  on: number;
  total: number;
  reached: number;
  lines: RuleLine[];
}

export function rulesSummary(byRule: Partial<Record<RuleKey, RuleRow>>): RulesSummary {
  const lines = RULES.map((def) => {
    const row = byRule[def.key];
    return {
      key: def.key,
      title: def.title,
      on: row?.status === "active",
      reached: row?.stats.total ?? 0,
    };
  });
  return {
    on: lines.filter((l) => l.on).length,
    total: lines.length,
    reached: lines.reduce((s, l) => s + l.reached, 0),
    lines,
  };
}

export interface HeroFacts {
  conversations: number;
  /** null enquanto a saúde da carteira carrega. */
  clients: number | null;
  risk: number;
  waiting: number;
}

/** Frase do topo: só afirma o que o número sustenta. */
export function heroSummary(f: HeroFacts): string {
  if (f.conversations === 0 && !f.clients)
    return "Ainda sem movimento. Conecte o WhatsApp e marque quem já comprou como cliente: o resumo do seu pós-venda aparece aqui.";
  const parts: string[] = [];
  if (f.clients)
    parts.push(
      f.risk > 0
        ? `Você cuida de ${countLabel(f.clients, "cliente")} e ${f.risk === 1 ? "1 está" : `${f.risk} estão`} em risco`
        : `Você cuida de ${countLabel(f.clients, "cliente")}, nenhum em risco`,
    );
  if (f.conversations > 0)
    parts.push(
      `${parts.length ? "a equipe atendeu" : "A equipe atendeu"} ${countLabel(f.conversations, "conversa")} no período`,
    );
  const head = `${parts.join("; ")}.`;
  if (f.waiting > 0)
    return `${head} ${f.waiting === 1 ? "1 cliente espera" : `${f.waiting} clientes esperam`} resposta agora.`;
  return `${head} Ninguém esperando resposta agora.`;
}
