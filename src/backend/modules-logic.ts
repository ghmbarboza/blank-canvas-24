// Lógica pura dos recursos extras no servidor (sem banco), para testar sem rede.
import type { ModuleId } from "@/components/layout/modules";

export function isModuleOn(settings: unknown, id: ModuleId): boolean {
  if (!settings || typeof settings !== "object") return false;
  const list = (settings as { modules?: unknown }).modules;
  return Array.isArray(list) && list.includes(id);
}

export function moduleOffMessage(label: string): string {
  return `O recurso "${label}" está desligado nesta conta. Um administrador liga em Ajustes › Recursos extras.`;
}

// Trabalhos da fila que pertencem a um recurso extra. Os demais rodam sempre.
const JOB_MODULE: Record<string, ModuleId> = {
  "automation.step": "automacoes",
  "email.campaign": "campanhas",
  "crm.sync": "gestao",
  "terms.alert": "biblioteca",
};

export function jobModule(kind: string): ModuleId | null {
  return JOB_MODULE[kind] ?? null;
}
