import { EDITION, hasChannel, type Edition } from "@/lib/edition";

const ALL_TIMELINE_FILTERS: { id: string; label: string; kinds: string[] }[] = [
  { id: "all", label: "Tudo", kinds: [] },
  { id: "messages", label: "Mensagens", kinds: ["message"] },
  { id: "email", label: "E-mails", kinds: ["email"] },
  { id: "calls", label: "Ligações", kinds: ["call"] },
  { id: "meetings", label: "Reuniões", kinds: ["meeting", "event"] },
  { id: "work", label: "Tarefas e notas", kinds: ["activity"] },
  { id: "deals", label: "Negócios", kinds: ["deal", "proposal", "payment"] },
  { id: "ai", label: "IA", kinds: ["classification"] },
  { id: "support", label: "Atendimento", kinds: ["ticket"] },
  { id: "forms", label: "Captação", kinds: ["form"] },
  { id: "automation", label: "Automações", kinds: ["automation"] },
  { id: "privacy", label: "Privacidade", kinds: ["consent"] },
];

/** Filtros da linha do tempo que a edição mostra (sem e-mail e ligação quando o canal não existe). */
export function timelineFiltersFor(edition: Edition = EDITION) {
  return ALL_TIMELINE_FILTERS.filter((f) => {
    if (f.id === "email") return hasChannel("email", edition);
    if (f.id === "calls") return hasChannel("phone", edition);
    return true;
  });
}

export const TIMELINE_FILTERS = timelineFiltersFor();
