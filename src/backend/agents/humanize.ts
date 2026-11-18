// Ritmo de gente no texto (§3-bis), sem rede: quebrar a resposta em partes curtas, atraso
// proporcional, tom do cliente, saudação repetida, "é robô?" e a nota da pesquisa conversacional.
import type { AgentStyle } from "@/features/agents/catalog";

/** Quebra a resposta como gente escreve: parágrafos primeiro, depois frases, cada parte ≤ max. */
export function splitMessage(text: string, maxChars: number): string[] {
  const clean = text.replace(/\r/g, "").trim();
  if (!clean) return [];
  const max = Math.max(60, maxChars);
  const parts: string[] = [];
  for (const para of clean.split(/\n{2,}/)) {
    const p = para.trim();
    if (!p) continue;
    if (p.length <= max) {
      parts.push(p);
      continue;
    }
    let cur = "";
    for (const sentence of p.match(/[^.!?\n]+[.!?]*\s*|\n/g) ?? [p]) {
      const s = sentence.replace(/\n/g, " ");
      if ((cur + s).trim().length > max && cur.trim()) {
        parts.push(cur.trim());
        cur = "";
      }
      if (s.trim().length > max * 1.6) {
        // frase enorme: divide em pedaços parecidos (na vírgula, se der), nunca deixa sobra miúda
        for (const piece of balancedCut(s.trim(), max)) parts.push(piece);
        cur = "";
      } else if (s.trim().length > max) {
        // um pouco maior que o limite: gente manda a frase inteira, não corta no fim
        if (cur.trim()) parts.push(cur.trim());
        parts.push(s.trim());
        cur = "";
      } else cur += s;
    }
    if (cur.trim()) parts.push(cur.trim());
  }
  // no máximo 4 mensagens seguidas: o que sobrar junta na última
  if (parts.length > 4) return [...parts.slice(0, 3), parts.slice(3).join(" ")];
  return parts;
}

/** Corta uma frase longa em pedaços de tamanho parecido, preferindo vírgula e depois espaço. */
function balancedCut(sentence: string, max: number): string[] {
  const n = Math.ceil(sentence.length / max);
  const target = Math.ceil(sentence.length / n);
  const out: string[] = [];
  let rest = sentence;
  while (rest.length > Math.max(max * 1.2, target + 8)) {
    const window = rest.slice(0, Math.min(rest.length, target + 8));
    const comma = window.lastIndexOf(", ");
    const space = window.lastIndexOf(" ");
    const at = comma > target * 0.6 ? comma + 1 : space > target * 0.6 ? space : target;
    out.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) out.push(rest);
  return out;
}

/** Atraso antes de mandar uma parte: proporcional ao tamanho, com piso e teto. */
export function typingDelayMs(
  part: string,
  style: Pick<AgentStyle, "ms_per_char" | "max_delay_ms">,
) {
  if (style.max_delay_ms <= 0 || style.ms_per_char <= 0) return 0;
  return Math.min(style.max_delay_ms, Math.max(600, Math.round(part.length * style.ms_per_char)));
}

export interface ToneHints {
  formal: boolean;
  short: boolean;
  usesEmoji: boolean;
}

const EMOJI = /\p{Extended_Pictographic}/u;
const FORMAL =
  /\b(senhor|senhora|prezad[oa]s?|cordialmente|atenciosamente|gostaria|poderia|por gentileza)\b/i;
const SLANG = /\b(vc|tb|blz|vlw|pq|kkk+|rs+|mano|top|beleza)\b/i;

/** Lê o jeito do cliente nas últimas mensagens dele. */
export function toneHints(customerMessages: string[]): ToneHints {
  const recent = customerMessages.slice(-5).filter(Boolean);
  if (recent.length === 0) return { formal: false, short: false, usesEmoji: false };
  const joined = recent.join("\n");
  const avg = recent.reduce((n, m) => n + m.length, 0) / recent.length;
  return {
    formal: FORMAL.test(joined) && !SLANG.test(joined),
    short: avg < 40,
    usesEmoji: EMOJI.test(joined),
  };
}

export function tonePrompt(h: ToneHints): string {
  const out: string[] = [];
  out.push(
    h.formal ? "O cliente escreve formal: trate com formalidade." : "Trate de você, natural.",
  );
  if (h.short) out.push("O cliente escreve curto: responda curto, uma ideia por mensagem.");
  out.push(h.usesEmoji ? "Pode usar no máximo um emoji, se couber." : "Não use emoji.");
  return out.join(" ");
}

const GREETING =
  /^\s*(ol[áa]|oi+|bom dia|boa tarde|boa noite|tudo bem\??|tudo bom\??|seja bem[- ]vind[oa])[\s,!.]*/i;

/** Tira a saudação do começo quando a conversa já foi cumprimentada. */
export function stripRepeatedGreeting(reply: string, alreadyGreeted: boolean): string {
  if (!alreadyGreeted) return reply;
  let out = reply;
  for (let i = 0; i < 2 && GREETING.test(out); i += 1) out = out.replace(GREETING, "");
  out = out.trim();
  if (!out) return reply.trim();
  return out.charAt(0).toUpperCase() + out.slice(1);
}

export function startsWithGreeting(text: string): boolean {
  return GREETING.test(text);
}

const B = "(?<![\\p{L}])";
const E = "(?![\\p{L}])";
const ROBOT = new RegExp(
  [
    `${B}(voc[eê]|vc|tu)\\s+(é|e|eh)\\s+(um\\s+|uma\\s+)?(rob[oô]|bot|m[aá]quina|ia|intelig[eê]ncia artificial|humano|humana|gente|pessoa)${E}`,
    `${B}(estou|to|tô)\\s+falando\\s+com\\s+(um\\s+|uma\\s+)?(rob[oô]|bot|m[aá]quina|humano|pessoa)${E}`,
    `^\\s*(é|eh)\\s+(um\\s+)?(rob[oô]|bot)\\s*\\?`,
  ].join("|"),
  "iu",
);

export function asksIfRobot(text: string): boolean {
  return ROBOT.test(text);
}

export function robotPrompt(style: Pick<AgentStyle, "robot_answer">, company: string): string {
  const custom = style.robot_answer.trim();
  return custom
    ? `Se perguntarem se você é robô, responda com esta ideia, nas suas palavras: "${custom.replace(/\{empresa\}/g, company)}". Depois siga atendendo.`
    : "Se perguntarem se você é robô, seja honesta: diga que é a assistente virtual da empresa e siga atendendo. Não diga que é humana.";
}

/**
 * Confere a nota que o modelo extraiu da resposta natural do cliente. O modelo decide;
 * aqui só barra nota fora da escala ou que não aparece em lugar nenhum na fala do cliente.
 */
export function checkSurveyScore(
  kind: "csat" | "nps",
  score: number,
  customerText: string,
): { ok: boolean; score: number; reason?: string } {
  const max = kind === "csat" ? 5 : 10;
  const min = kind === "csat" ? 1 : 0;
  const n = Math.round(score);
  if (!Number.isFinite(score) || n < min || n > max)
    return { ok: false, score: n, reason: `nota fora da escala ${min} a ${max}` };
  const t = customerText.toLowerCase();
  const words: Record<number, string[]> = {
    0: ["zero"],
    1: ["um", "uma"],
    2: ["dois", "duas"],
    3: ["tr[eê]s"],
    4: ["quatro"],
    5: ["cinco"],
    6: ["seis"],
    7: ["sete"],
    8: ["oito"],
    9: ["nove"],
    10: ["dez"],
  };
  const said =
    new RegExp(`(^|[^0-9])${n}([^0-9]|$)`).test(t) ||
    (words[n] ?? []).some((w) => new RegExp(`\\b${w}\\b`).test(t));
  // CSAT pode vir só em palavras ("ótimo", "péssimo"): o modelo traduz; aceitamos se há avaliação.
  const evaluative =
    /(ótim|otim|excelente|perfeit|muito bom|bom|boa|ruim|péssim|pessim|horr[ií]vel|regular|razo[aá]vel|amei|gostei|n[aã]o gostei|top|maravilh)/i;
  if (said || (kind === "csat" && evaluative.test(t))) return { ok: true, score: n };
  return { ok: false, score: n, reason: "a nota não aparece na resposta do cliente" };
}
