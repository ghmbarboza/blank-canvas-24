// Filtros da lista de campanhas: o que o gestor procura, não o status cru do banco.
export type Scope = "all" | "draft" | "scheduled" | "running" | "done";

export const SCOPES: readonly (readonly [Scope, string])[] = [
  ["all", "Todas"],
  ["draft", "Rascunhos"],
  ["scheduled", "Agendadas"],
  ["running", "Em andamento"],
  ["done", "Encerradas"],
];

export function matchesScope(status: string, scope: Scope): boolean {
  switch (scope) {
    case "all":
      return true;
    case "draft":
      return status === "draft";
    case "scheduled":
      return status === "scheduled";
    case "running":
      return status === "sending" || status === "paused";
    case "done":
      return status === "sent" || status === "canceled";
  }
}

export interface Engagement {
  sent: number;
  opened: number;
  clicked: number;
  openRate: number | null;
  clickRate: number | null;
}

// Números da linha: taxa só quando já houve envio, para não mostrar 0% que é na verdade "ainda não".
export function engagement(
  s: { sent: number | null; opened: number | null; clicked: number | null } | null,
): Engagement {
  const sent = s?.sent ?? 0;
  const opened = s?.opened ?? 0;
  const clicked = s?.clicked ?? 0;
  return {
    sent,
    opened,
    clicked,
    openRate: sent ? opened / sent : null,
    clickRate: sent ? clicked / sent : null,
  };
}
