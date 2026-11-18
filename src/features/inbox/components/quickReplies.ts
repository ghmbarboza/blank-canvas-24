// Respostas rápidas no composer: "/atalho" abre a lista; {nome} vira o primeiro nome do cliente.
export interface QuickReplyLite {
  shortcut: string;
  title: string;
  body: string;
}

// Texto que está sendo digitado como comando (só quando a mensagem inteira é "/algo").
export function slashQuery(text: string): string | null {
  const m = /^\/([a-z0-9_-]*)$/i.exec(text.trim());
  return m ? m[1]!.toLowerCase() : null;
}

export function filterReplies<T extends QuickReplyLite>(list: T[], q: string): T[] {
  const term = q.toLowerCase();
  return list
    .filter((r) => r.shortcut.startsWith(term) || r.title.toLowerCase().includes(term))
    .sort(
      (a, b) =>
        Number(!a.shortcut.startsWith(term)) - Number(!b.shortcut.startsWith(term)) ||
        a.shortcut.localeCompare(b.shortcut),
    )
    .slice(0, 8);
}

export function fillReply(body: string, contactName: string | null | undefined): string {
  const first = (contactName ?? "").trim().split(/\s+/)[0] ?? "";
  return body
    .replace(/\{nome\}/gi, first)
    .replace(/\s+([,!.?])/g, "$1")
    .replace(/ {2,}/g, " ");
}
