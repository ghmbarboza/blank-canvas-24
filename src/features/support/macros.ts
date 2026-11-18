// Macros (respostas prontas) com variáveis e intenção. Puro: usado na inbox, no chamado e no servidor.

export interface MacroVars {
  contactName?: string | null | undefined;
  contactEmail?: string | null | undefined;
  agentName?: string | null | undefined;
  companyName?: string | null | undefined;
  ticketNumber?: number | string | null | undefined;
  ticketSubject?: string | null | undefined;
  orderRef?: string | null | undefined;
  today?: Date | undefined;
}

/** Variáveis que o gestor pode usar no texto (mostradas na tela de edição). */
export const MACRO_VARIABLES: { token: string; label: string }[] = [
  { token: "{{contato.primeiro_nome}}", label: "Primeiro nome do cliente" },
  { token: "{{contato.nome}}", label: "Nome completo do cliente" },
  { token: "{{contato.email}}", label: "E-mail do cliente" },
  { token: "{{atendente.nome}}", label: "Seu nome" },
  { token: "{{empresa.nome}}", label: "Nome da sua empresa" },
  { token: "{{chamado.numero}}", label: "Número do chamado" },
  { token: "{{chamado.assunto}}", label: "Assunto do chamado" },
  { token: "{{pedido}}", label: "Número do pedido" },
  { token: "{{data.hoje}}", label: "Data de hoje" },
];

function first(name: string | null | undefined): string {
  return (name ?? "").trim().split(/\s+/)[0] ?? "";
}

function resolve(key: string, v: MacroVars): string | null {
  const today = v.today ?? new Date();
  const map: Record<string, string | null | undefined> = {
    "contato.primeiro_nome": first(v.contactName),
    "contato.nome": v.contactName?.trim(),
    "contato.email": v.contactEmail,
    "atendente.nome": first(v.agentName),
    "empresa.nome": v.companyName,
    "chamado.numero": v.ticketNumber != null ? `#${v.ticketNumber}` : null,
    "chamado.assunto": v.ticketSubject,
    pedido: v.orderRef,
    "data.hoje": today.toLocaleDateString("pt-BR"),
  };
  const val = map[key];
  return val ? String(val) : null;
}

/**
 * Troca as variáveis pelo valor. A variável sem valor some (sem deixar "{{...}}" para o cliente)
 * e entra em `missing`, para a tela avisar o atendente antes de enviar.
 */
export function renderMacro(body: string, vars: MacroVars): { text: string; missing: string[] } {
  const missing: string[] = [];
  const text = body
    // Formato antigo das respostas rápidas: {nome} = primeiro nome.
    .replace(/\{nome\}/gi, () => {
      const v = first(vars.contactName);
      if (!v) missing.push("contato.primeiro_nome");
      return v;
    })
    .replace(/\{\{\s*([a-z_.]+)\s*\}\}/gi, (_m, key: string) => {
      const v = resolve(key.toLowerCase(), vars);
      if (v === null) missing.push(key.toLowerCase());
      return v ?? "";
    })
    .replace(/[ \t]+([,!.?;:])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/,\s*([!.?])/g, "$1")
    .trim();
  return { text, missing: [...new Set(missing)] };
}

export interface MacroLite {
  id: string;
  shortcut: string;
  title: string;
  body: string;
  intents: string[];
  use_count: number;
}

function tokens(s: string): Set<string> {
  return new Set(
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 3),
  );
}

/**
 * Ordem das macros para uma conversa quando a IA não está disponível: intenção igual primeiro,
 * depois as palavras em comum com a última mensagem do cliente, depois as mais usadas.
 */
export function rankMacros<T extends MacroLite>(
  list: T[],
  intent: string | null,
  lastText: string,
): T[] {
  const words = tokens(lastText);
  const it = (intent ?? "").toLowerCase().trim();
  const score = (m: T) => {
    let s = 0;
    if (it && m.intents.some((x) => x.toLowerCase() === it)) s += 100;
    const mw = tokens(`${m.title} ${m.body} ${m.intents.join(" ")}`);
    for (const w of words) if (mw.has(w)) s += 5;
    return s + Math.min(10, Math.log2(1 + m.use_count));
  };
  return [...list]
    .map((m) => ({ m, s: score(m) }))
    .sort((a, b) => b.s - a.s || a.m.shortcut.localeCompare(b.m.shortcut))
    .map((x) => x.m);
}

/** Intenções sugeridas para cadastrar nas macros (o gestor pode escrever outras). */
export const COMMON_INTENTS = [
  "saudação",
  "status do pedido",
  "troca ou devolução",
  "cancelamento",
  "segunda via",
  "preço",
  "reclamação",
  "agendamento",
  "suporte técnico",
  "encerramento",
];
