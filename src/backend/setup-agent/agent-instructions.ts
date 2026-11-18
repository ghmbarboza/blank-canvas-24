// As orientações que o dono dá ao atendente pela conversa ("seja mais direto", "nunca prometa
// prazo") ficam num bloco próprio no fim das instruções. Assim dá para acrescentar, trocar e tirar
// uma orientação sem mexer no texto do modelo pronto. Puro, testado.

export const OWNER_MARK = "Orientações do dono da empresa (siga sempre, acima do resto):";
const UNKNOWN_PREFIX = "Quando não souber responder: ";
const HANDOFF_PREFIX = "Passe a conversa para uma pessoa da equipe quando: ";
const MAX_RULES = 20;
const MAX_INSTRUCTIONS = 12_000;

const clean = (v: string) =>
  v
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[-•]\s*/, "")
    .slice(0, 400);
const norm = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function split(instructions: string): { base: string; rules: string[]; tail: string[] } {
  const lines = instructions.split("\n");
  const at = lines.findIndex((l) => l.trim() === OWNER_MARK);
  if (at < 0) return { base: instructions.trim(), rules: [], tail: [] };
  const rules: string[] = [];
  let i = at + 1;
  for (; i < lines.length && lines[i]!.startsWith("- "); i++) rules.push(lines[i]!.slice(2).trim());
  return {
    base: lines.slice(0, at).join("\n").trim(),
    rules,
    // o que veio depois do bloco (a saudação, por exemplo) continua valendo
    tail: lines.slice(i).filter((l) => l.trim()),
  };
}

function join(base: string, rules: string[], tail: string[]): string {
  const head = [base, ...tail].filter(Boolean).join("\n");
  const out = rules.length
    ? `${head}\n\n${OWNER_MARK}\n${rules.map((r) => `- ${r}`).join("\n")}`
    : head;
  if (out.length > MAX_INSTRUCTIONS)
    throw new Error("as orientações ficaram longas demais: tire alguma antes de acrescentar outra");
  return out;
}

export function ownerRules(instructions: string): string[] {
  return split(instructions).rules;
}

/** Acrescenta orientações (sem repetir a que já existe). */
export function addOwnerRules(instructions: string, add: readonly string[]): string {
  const { base, rules, tail } = split(instructions);
  const next = [...rules];
  for (const raw of add) {
    const r = clean(raw);
    if (r.length < 3) continue;
    if (!next.some((x) => norm(x) === norm(r))) next.push(r);
  }
  if (next.length > MAX_RULES)
    throw new Error(
      `o atendente já tem ${MAX_RULES} orientações: tire alguma antes de acrescentar outra`,
    );
  return join(base, next, tail);
}

/** Tira as orientações que contêm o trecho. Devolve quantas saíram. */
export function removeOwnerRule(
  instructions: string,
  match: string,
): { text: string; removed: number } {
  const { base, rules, tail } = split(instructions);
  const key = norm(clean(match));
  if (key.length < 3) return { text: instructions, removed: 0 };
  const keep = rules.filter((r) => !norm(r).includes(key));
  return { text: join(base, keep, tail), removed: rules.length - keep.length };
}

function setPrefixed(instructions: string, prefix: string, value: string): string {
  const { base, rules, tail } = split(instructions);
  const keep = rules.filter((r) => !r.startsWith(prefix));
  const v = clean(value);
  return join(base, v ? [...keep, `${prefix}${v}`] : keep, tail);
}

/** O que o atendente faz quando não sabe a resposta (uma orientação só; a nova troca a antiga). */
export const setUnknownRule = (instructions: string, value: string) =>
  setPrefixed(instructions, UNKNOWN_PREFIX, value);

/** Quando o atendente passa a conversa para uma pessoa (uma orientação só; a nova troca a antiga). */
export const setHandoffRule = (instructions: string, value: string) =>
  setPrefixed(instructions, HANDOFF_PREFIX, value);
