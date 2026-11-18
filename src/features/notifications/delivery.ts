// Canais extras das notificações (e-mail e push no navegador): catálogo de tipos para a tela de
// preferências e o conteúdo de cada canal. Puro: usado pelo job notify.deliver e pela tela.

import { EDITION, hasChannel, type Edition, type EditionChannel } from "@/lib/edition";

export interface NotificationKind {
  id: string;
  label: string;
  group: "Vendas" | "Atendimento" | "Reuniões e ligações" | "Sistema";
}

export const NOTIFICATION_KINDS: NotificationKind[] = [
  { id: "lead_new", label: "Lead novo", group: "Vendas" },
  { id: "lead_hot", label: "Lead esquentou", group: "Vendas" },
  { id: "contact_assigned", label: "Contato atribuído a você", group: "Vendas" },
  { id: "proposal_viewed", label: "Proposta aberta pelo cliente", group: "Vendas" },
  { id: "proposal_accepted", label: "Proposta aceita", group: "Vendas" },
  { id: "forecast_suggestion", label: "Sugestão de forecast da IA", group: "Vendas" },
  { id: "ticket_assigned", label: "Chamado atribuído a você", group: "Atendimento" },
  {
    id: "sla_warning",
    label: "Prazo perto de vencer ou cliente esperando resposta",
    group: "Atendimento",
  },
  {
    id: "sla_breached",
    label: "Prazo estourado (chamado ou conversa na fila)",
    group: "Atendimento",
  },
  { id: "ai_handoff", label: "IA passou a conversa para você", group: "Atendimento" },
  { id: "meeting_booked", label: "Reunião agendada", group: "Reuniões e ligações" },
  { id: "meeting_minutes", label: "Ata da reunião pronta", group: "Reuniões e ligações" },
  { id: "call_incoming", label: "Ligação chegando", group: "Reuniões e ligações" },
  { id: "tracked_term", label: "Termo monitorado citado", group: "Reuniões e ligações" },
  { id: "automation", label: "Avisos de automações", group: "Sistema" },
  { id: "telephony_balance", label: "Saldo da telefonia", group: "Sistema" },
];

/** Tipos de aviso que dependem de um canal: fora da edição, somem das preferências. */
const KIND_CHANNEL: Record<string, EditionChannel[]> = {
  meeting_minutes: ["video"],
  call_incoming: ["phone"],
  telephony_balance: ["phone"],
  // termos monitorados só existem em ligações e reuniões gravadas
  tracked_term: ["phone", "video"],
};

/** Tipos de aviso que a tela de preferências oferece nesta edição. */
export function notificationKindsFor(edition: Edition = EDITION): NotificationKind[] {
  return NOTIFICATION_KINDS.filter((k) => {
    const needs = KIND_CHANNEL[k.id];
    return !needs || needs.some((c) => hasChannel(c, edition));
  });
}

/** Nome do grupo na tela: sem telefone na edição, "Reuniões e ligações" vira "Agenda". */
export function notificationGroupLabel(
  group: NotificationKind["group"],
  edition: Edition = EDITION,
): string {
  if (group !== "Reuniões e ligações") return group;
  return hasChannel("phone", edition) ? group : "Agenda";
}

export interface Channels {
  app: boolean;
  email: boolean;
  push: boolean;
}

export const DEFAULT_CHANNELS: Channels = { app: true, email: false, push: true };

export interface PrefRow extends Channels {
  kind: string;
}

/** Mesma regra do banco (notification_channels): tipo específico > padrão "*" > padrão do sistema. */
export function resolveChannels(rows: PrefRow[], kind: string): Channels {
  const r = rows.find((x) => x.kind === kind) ?? rows.find((x) => x.kind === "*");
  return r ? { app: r.app, email: r.email, push: r.push } : DEFAULT_CHANNELS;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// O motor de e-mail troca {{variável}}; texto de notificação nunca deve ser lido como variável.
const noVars = (s: string) => s.replace(/\{\{/g, "{ {").replace(/\}\}/g, "} }");

/** Link interno vira absoluto; link externo ou malformado é descartado. */
export function absoluteLink(link: string | null | undefined, base: string): string | null {
  if (!link || !link.startsWith("/") || link.startsWith("//")) return null;
  return `${base.replace(/\/$/, "")}${link}`;
}

export function notificationEmail(
  n: { title: string; body: string | null; link: string | null },
  base: string,
): { subject: string; html: string; text: string } {
  const url = absoluteLink(n.link, base);
  const title = escapeHtml(noVars(n.title));
  const body = n.body ? escapeHtml(noVars(n.body)).replace(/\n/g, "<br>") : "";
  const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#001F35">
<p style="font-size:16px;font-weight:bold;margin:0 0 8px">${title}</p>
${body ? `<p style="font-size:14px;line-height:1.5;margin:0 0 16px;color:#334155">${body}</p>` : ""}
${url ? `<p><a href="${escapeHtml(url)}" style="display:inline-block;background:#B9915B;color:#001F35;font-weight:700;padding:10px 18px;border-radius:10px;text-decoration:none;font-size:14px">Abrir no Vínculo</a></p>` : ""}
<p style="font-size:11px;color:#94a3b8;margin-top:24px">Você recebe este aviso porque ligou o e-mail para este tipo em Ajustes, Notificações.</p>
</div>`;
  const text = [noVars(n.title), n.body ? noVars(n.body) : null, url].filter(Boolean).join("\n\n");
  return { subject: noVars(n.title).slice(0, 200), html, text };
}

export function pushPayload(
  n: { id: string; kind: string; title: string; body: string | null; link: string | null },
  base: string,
) {
  return {
    title: n.title.slice(0, 120),
    body: (n.body ?? "").slice(0, 240),
    url: absoluteLink(n.link, base) ?? base,
    tag: `${n.kind}:${n.id}`,
  };
}
