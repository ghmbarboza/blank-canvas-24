// Tela de erro do servidor. Em pt-BR, com o motivo mais provável e o que fazer: numa cópia (remix)
// recém-criada o erro quase sempre é o banco ainda não estar pronto, e a pessoa não é desenvolvedora.
export interface ErrorPageInfo {
  /** O servidor não tem as variáveis do banco: a cópia não terminou de ligar o Lovable Cloud. */
  backendMissing?: boolean;
  /** Mensagem curta do erro, para quem for ajudar (nunca segredo: só nome e começo da mensagem). */
  detail?: string;
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`).slice(0, 220);

/** As variáveis do banco chegaram ao servidor? Sem elas nenhuma tela funciona. */
export function backendConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env["SUPABASE_URL"] && env["SUPABASE_SERVICE_ROLE_KEY"]);
}

/** Resumo seguro de um erro para mostrar na tela. */
export function errorDetail(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`.slice(0, 180);
  return String(error ?? "").slice(0, 180);
}

export function renderErrorPage(info: ErrorPageInfo = {}): string {
  const title = info.backendMissing
    ? "A cópia ainda não terminou de ser montada"
    : "Esta página não carregou";
  const text = info.backendMissing
    ? "O banco de dados desta cópia ainda não está ligado. No Lovable, espere a criação terminar (se ele perguntar algo, confirme), clique em Publicar e abra o endereço publicado de novo."
    : "Aconteceu um erro do nosso lado. Esta página tenta de novo sozinha em alguns segundos. Se você acabou de fazer a cópia do projeto, espere um minuto: o banco pode estar terminando de ser criado.";
  const detail = info.detail
    ? `<p class="detail">Detalhe para quem for ajudar: ${escapeHtml(info.detail)}</p>`
    : "";
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { font: 15px/1.5 system-ui, -apple-system, sans-serif; background: #fafafa; color: #001f35; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 1.5rem; }
      .card { max-width: 30rem; width: 100%; text-align: center; padding: 2rem; }
      h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
      p { color: #4b5563; margin: 0 0 1.5rem; }
      .detail { font-size: 12px; color: #6b7280; word-break: break-word; }
      .actions { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; margin-bottom: 1.25rem; }
      a, button { padding: 0.5rem 1rem; border-radius: 0.625rem; font: inherit; cursor: pointer; text-decoration: none; border: 1px solid transparent; }
      .primary { background: #b9915b; color: #001f35; font-weight: 600; }
      .secondary { background: #fff; color: #001f35; border-color: #d1d5db; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>${title}</h1>
      <p>${text}</p>
      <div class="actions">
        <button class="primary" onclick="location.reload()">Tentar de novo</button>
        <a class="secondary" href="/">Ir para o início</a>
      </div>
      ${detail}
    </div>
    <script>
      // tenta de novo sozinha, no máximo 5 vezes, para o erro passageiro de cópia recém-criada
      try {
        var k = "erro-tentativas", n = Number(sessionStorage.getItem(k) || "0");
        if (n < 5) { sessionStorage.setItem(k, String(n + 1)); setTimeout(function () { location.reload(); }, 8000); }
      } catch (e) {}
    </script>
  </body>
</html>`;
}
