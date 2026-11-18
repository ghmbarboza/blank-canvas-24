export const TIMELINE_FILTERS: { id: string; label: string; kinds: string[] }[] = [
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
