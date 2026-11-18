// Motor de regras do coach (sem IA, latência < 1 s): objeções comuns, sinais de compra,
// compliance e ritmo da conversa. A IA complementa com dicas a cada ~10 s.
import type { CoachEngine, CoachTip, TranscriptSegment } from "./types";

interface Rule {
  id: string;
  kind: CoachTip["kind"];
  speaker: "seller" | "customer";
  pattern: RegExp;
  title: string;
  text: string;
}

export const DEFAULT_RULES: Rule[] = [
  {
    id: "price",
    kind: "objection",
    speaker: "customer",
    pattern:
      /(t[aá] caro|muito caro|caro demais|fora do (meu )?or[cç]amento|n[aã]o cabe no or[cç]amento)/i,
    title: "Objeção de preço",
    text: "Não dê desconto de cara. Pergunte: “comparado com o quê?” e volte ao valor que resolve a dor dele.",
  },
  {
    id: "think",
    kind: "objection",
    speaker: "customer",
    pattern: /(vou pensar|preciso pensar|deixa eu ver|te retorno|depois eu vejo)/i,
    title: "“Vou pensar”",
    text: "Pergunte o que falta para decidir hoje e combine um próximo passo com data.",
  },
  {
    id: "partner",
    kind: "objection",
    speaker: "customer",
    pattern:
      /(falar com (meu|minha) (s[oó]cio|chefe|esposa|marido|diretor)|n[aã]o decido sozinho)/i,
    title: "Outro decisor",
    text: "Proponha uma conversa rápida com quem decide e ofereça material para ele.",
  },
  {
    id: "competitor",
    kind: "objection",
    speaker: "customer",
    pattern: /(j[aá] (uso|tenho|trabalho com)|concorrente|outra empresa|outro fornecedor)/i,
    title: "Já tem fornecedor",
    text: "Pergunte o que ele mudaria no atual. Mostre a diferença nesse ponto, sem falar mal do concorrente.",
  },
  {
    id: "time",
    kind: "objection",
    speaker: "customer",
    pattern: /(sem tempo|agora n[aã]o d[aá]|muito ocupado|liga (mais tarde|depois))/i,
    title: "Sem tempo agora",
    text: "Peça 1 minuto para o essencial ou já marque o melhor horário para retornar.",
  },
  {
    id: "buy",
    kind: "closing",
    speaker: "customer",
    pattern:
      /(como (fa[cç]o|funciona) (para|pra) (contratar|comprar|fechar)|qual (o )?pr[oó]ximo passo|manda (a )?proposta|quando come[cç]a)/i,
    title: "Sinal de compra",
    text: "Hora de fechar: confirme o que foi combinado e proponha o próximo passo concreto agora.",
  },
  {
    id: "payment",
    kind: "closing",
    speaker: "customer",
    pattern: /(parcel|pix|boleto|cart[aã]o|forma de pagamento)/i,
    title: "Pergunta de pagamento",
    text: "Responda a forma de pagamento e já ofereça enviar o link por WhatsApp.",
  },
  {
    id: "promise",
    kind: "compliance",
    speaker: "seller",
    pattern: /(garanto|garantido|cem por cento|100%|sem risco nenhum)/i,
    title: "Cuidado com promessa",
    text: "Evite garantias absolutas. Diga o que normalmente acontece e o que está no contrato.",
  },
];

let seq = 0;
const nextId = (p: string) => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

export function createRuleEngine(rules: Rule[] = DEFAULT_RULES): CoachEngine {
  let tips: CoachTip[] = [];
  const fired = new Map<string, number>();
  let sellerChars = 0;
  let customerChars = 0;
  let paceWarnedAt = -Infinity;

  return {
    push(seg: TranscriptSegment) {
      if (!seg.final || !seg.text.trim()) return [];
      const fresh: CoachTip[] = [];
      if (seg.speaker === "seller") sellerChars += seg.text.length;
      else customerChars += seg.text.length;
      for (const r of rules) {
        if (r.speaker !== seg.speaker || !r.pattern.test(seg.text)) continue;
        const last = fired.get(r.id) ?? -Infinity;
        if (seg.at - last < 90_000) continue; // não repetir a mesma dica em 90 s
        fired.set(r.id, seg.at);
        fresh.push({
          id: nextId(r.id),
          kind: r.kind,
          title: r.title,
          text: r.text,
          at: seg.at,
          source: "rule",
        });
      }
      const total = sellerChars + customerChars;
      if (total > 1500 && sellerChars / total > 0.65 && seg.at - paceWarnedAt > 120_000) {
        paceWarnedAt = seg.at;
        fresh.push({
          id: nextId("pace"),
          kind: "pace",
          title: "Você está falando muito",
          text: "Faça uma pergunta aberta e deixe o cliente falar.",
          at: seg.at,
          source: "rule",
        });
      }
      tips = [...fresh, ...tips].slice(0, 30);
      return fresh;
    },
    tips: () => tips,
    reset() {
      tips = [];
      fired.clear();
      sellerChars = 0;
      customerChars = 0;
      paceWarnedAt = -Infinity;
    },
  };
}

export function talkRatio(segments: TranscriptSegment[]): number {
  const s = segments
    .filter((x) => x.final && x.speaker === "seller")
    .reduce((a, b) => a + b.text.length, 0);
  const c = segments
    .filter((x) => x.final && x.speaker === "customer")
    .reduce((a, b) => a + b.text.length, 0);
  return s + c === 0 ? 0 : s / (s + c);
}
