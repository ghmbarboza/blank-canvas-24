// Erros da conexão do WhatsApp por QR Code (Evolution), em linguagem de dono de empresa: o que
// aconteceu e o que fazer. Puro, sem rede: a tela e os testes usam.

export type EvolutionProblem =
  "url" | "key" | "not_found" | "offline" | "not_configured" | "unknown";

export interface EvolutionHelp {
  problem: EvolutionProblem;
  title: string;
  fix: string;
}

export type UrlCheck = { ok: true; url: string } | { ok: false; message: string };

/**
 * Confere e arruma o endereço do servidor antes de mandar: aceita sem https:// (acrescenta), tira
 * barra final e o /manager que muita gente copia do painel. http:// e endereço local são recusados.
 */
export function checkEvolutionUrl(raw: string): UrlCheck {
  const text = raw.trim();
  if (!text) return { ok: false, message: "Cole o endereço do servidor. Ele começa com https://" };
  if (/\s/.test(text))
    return {
      ok: false,
      message: "O endereço não pode ter espaços. Copie de novo, do começo ao fim.",
    };
  if (/^http:\/\//i.test(text))
    return {
      ok: false,
      message: "O endereço precisa começar com https:// (com o s). Confira com o seu provedor.",
    };
  const withScheme = /^https:\/\//i.test(text) ? text : `https://${text}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return {
      ok: false,
      message: "Esse endereço não parece válido. O formato é https://evolution.suaempresa.com.br",
    };
  }
  const host = parsed.hostname;
  if (!host.includes(".") || /^(localhost|127\.|10\.|192\.168\.)/.test(host))
    return {
      ok: false,
      message: "Use o endereço público do servidor, o que o provedor mandou por e-mail.",
    };
  const path = parsed.pathname.replace(/\/manager\/?.*$/i, "").replace(/\/+$/, "");
  return { ok: true, url: `https://${parsed.host}${path}` };
}

const HELP: Record<EvolutionProblem, Omit<EvolutionHelp, "problem">> = {
  url: {
    title: "O endereço do servidor não foi aceito",
    fix: "Confira se copiou o endereço inteiro, começando com https://, igual ao que o provedor mandou.",
  },
  key: {
    title: "A chave não foi aceita pelo servidor",
    fix: "Copie de novo a chave global (API Key) do e-mail ou do painel do provedor, sem espaços, e cole no campo da chave.",
  },
  not_found: {
    title: "Esse endereço respondeu, mas não é o da Evolution",
    fix: "Use só o endereço principal do servidor, sem /manager nem outra parte no fim.",
  },
  offline: {
    title: "O servidor não respondeu",
    fix: "Ele pode estar fora do ar ou o endereço está errado. Confira o endereço, espere um minuto e tente de novo. Se continuar, fale com o provedor do servidor.",
  },
  not_configured: {
    title: "Falta salvar o servidor",
    fix: "Preencha o endereço e a chave do servidor e clique em Conectar.",
  },
  unknown: {
    title: "Não deu para conectar agora",
    fix: "Tente de novo em instantes. Se continuar, confira o endereço e a chave com o provedor do servidor.",
  },
};

/** Lê a mensagem crua (da função de canais ou do próprio servidor) e diz qual é o problema. */
export function evolutionProblem(raw: string | null | undefined): EvolutionProblem {
  const m = (raw ?? "").toLowerCase();
  if (!m) return "unknown";
  if (/configure o servidor evolution/.test(m)) return "not_configured";
  if (/recusado|informe a url|url https/.test(m)) return "url";
  if (/\b(401|403)\b|unauthorized|forbidden|chave ausente/.test(m)) return "key";
  if (/\b404\b|not found/.test(m)) return "not_found";
  if (
    /\b5\d\d\b|sem conex|network|fetch|sending request|dns|timed? ?out|tempo esgotado|connect|refused|redirect|certificate|tls|unreachable/.test(
      m,
    )
  )
    return "offline";
  return "unknown";
}

export function explainEvolutionError(raw: string | null | undefined): EvolutionHelp {
  const problem = evolutionProblem(raw);
  return { problem, ...HELP[problem] };
}
