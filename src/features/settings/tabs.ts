export const SETTINGS_TABS = [
  "empresa",
  "equipe",
  "aparencia",
  "recursos",
  "notificacoes",
  "catalogo",
  "campos",
  "playbooks",
  "atendimento",
  "inteligencia",
  "agente",
  "integracoes",
  "email",
  "agenda",
  "telefonia",
  "desenvolvedores",
  "privacidade",
  "auditoria",
] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

export function isSettingsTab(v: unknown): v is SettingsTab {
  return typeof v === "string" && (SETTINGS_TABS as readonly string[]).includes(v);
}
