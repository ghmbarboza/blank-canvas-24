import type { Role } from "@/lib/account";

export const ROLE_INFO: Record<Role, { label: string; description: string }> = {
  owner: { label: "Dono", description: "Acesso total. Não pode ser alterado aqui." },
  admin: {
    label: "Administrador",
    description: "Tudo do gestor, mais canais, integrações e equipe.",
  },
  manager: { label: "Gestor", description: "Vê tudo e edita o funil." },
  agent: { label: "Atendente", description: "Vê os canais compartilhados." },
  seller: { label: "Vendedor", description: "Vê só os próprios canais, contatos e negócios." },
};

export type AssignableRole = Exclude<Role, "owner">;

export const ASSIGNABLE_ROLES: AssignableRole[] = ["admin", "manager", "agent", "seller"];

export function isAssignableRole(v: string): v is AssignableRole {
  return (ASSIGNABLE_ROLES as string[]).includes(v);
}

export const TIMEZONES: { value: string; label: string }[] = [
  { value: "America/Sao_Paulo", label: "Brasília (São Paulo, Rio, Sul, Sudeste, GO, DF)" },
  { value: "America/Manaus", label: "Manaus (AM)" },
  { value: "America/Belem", label: "Belém (PA, AP)" },
  { value: "America/Fortaleza", label: "Fortaleza (CE, MA, PI, RN, PB)" },
  { value: "America/Recife", label: "Recife (PE, AL, SE)" },
  { value: "America/Cuiaba", label: "Cuiabá (MT, MS)" },
  { value: "America/Porto_Velho", label: "Porto Velho (RO, RR)" },
  { value: "America/Rio_Branco", label: "Rio Branco (AC)" },
  { value: "America/Noronha", label: "Fernando de Noronha" },
];
