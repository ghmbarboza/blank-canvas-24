// O que é a central (sempre no menu) e o que é extra (desligado até o gestor ligar em Ajustes).
// Desligar um extra tira do menu e da busca, e a rota dele mostra "Recurso desligado" (os dados
// continuam guardados; o servidor também recusa as ações do extra desligado).
export type ModuleId =
  | "meu_dia"
  | "empresas"
  | "campanhas"
  | "automacoes"
  | "treino"
  | "biblioteca"
  | "metas"
  | "pergunte"
  | "gestao"
  | "incidentes";

export interface ModuleDef {
  id: ModuleId;
  label: string;
  /** Para que serve, em uma frase. */
  what: string;
  /** Quando vale ligar. */
  when: string;
}

export const EXTRA_MODULES: ModuleDef[] = [
  {
    id: "empresas",
    label: "Empresas",
    what: "Agrupa os contatos pela empresa onde trabalham.",
    when: "Quando você vende para outras empresas (B2B).",
  },
  {
    id: "automacoes",
    label: "Automações",
    what: "Regras que agem sozinhas: lembrete, follow-up, mudar etapa do funil.",
    when: "Quando a equipe repete a mesma tarefa todo dia.",
  },
  {
    id: "campanhas",
    label: "Campanhas de e-mail",
    what: "Envio de e-mail em massa para uma lista de contatos.",
    when: "Quando você faz e-mail marketing pelo próprio Nexus.",
  },
  {
    id: "metas",
    label: "Metas e comissão",
    what: "Meta de venda e comissão de cada vendedor.",
    when: "Quando a equipe recebe comissão pelo que vende.",
  },
  {
    id: "treino",
    label: "Treino",
    what: "O vendedor conversa com um cliente simulado pela IA e recebe nota.",
    when: "Para treinar gente nova antes de atender de verdade.",
  },
  {
    id: "biblioteca",
    label: "Biblioteca",
    what: "Busca nas conversas e ligações gravadas e guarda os melhores trechos.",
    when: "Para montar exemplos de bons atendimentos para o time.",
  },
  {
    id: "pergunte",
    label: "Pergunte ao Nexus",
    what: "O gestor pergunta em português e a IA responde com os números.",
    when: "Para quem prefere perguntar a abrir relatório.",
  },
  {
    id: "gestao",
    label: "Gestão",
    what: "Escala da equipe, indicadores e saúde dos clientes.",
    when: "Em operações com turnos e muita gente atendendo.",
  },
  {
    id: "incidentes",
    label: "Incidentes",
    what: "Quando algo quebra para muitos clientes, avisa todos de uma vez.",
    when: "Para quem presta serviço contínuo (internet, sistema, plano).",
  },
  {
    id: "meu_dia",
    label: "Meu dia",
    what: "Agenda, tarefas e leads quentes de cada pessoa numa tela só.",
    when: "Quando o time vende com agenda cheia de compromissos.",
  },
];

export function enabledModules(settings: { modules?: string[] } | null | undefined): Set<string> {
  return new Set(settings?.modules ?? []);
}

// Endereço de cada extra. Campanhas de WhatsApp (/campanhas/whatsapp) é do núcleo: fica de fora.
const MODULE_ROUTES: { prefix: string; id: ModuleId; except?: string[] }[] = [
  { prefix: "/meu-dia", id: "meu_dia" },
  { prefix: "/empresas", id: "empresas" },
  { prefix: "/campanhas", id: "campanhas", except: ["/campanhas/whatsapp"] },
  { prefix: "/automacoes", id: "automacoes" },
  { prefix: "/treino", id: "treino" },
  { prefix: "/biblioteca", id: "biblioteca" },
  { prefix: "/metas", id: "metas" },
  { prefix: "/pergunte", id: "pergunte" },
  { prefix: "/gestao", id: "gestao" },
  { prefix: "/incidentes", id: "incidentes" },
];

const under = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

/** Extra a que o endereço pertence, ou null quando a tela é do núcleo. */
export function moduleForPath(pathname: string): ModuleDef | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  const hit = MODULE_ROUTES.find(
    (r) => under(path, r.prefix) && !(r.except ?? []).some((e) => under(path, e)),
  );
  return hit ? (EXTRA_MODULES.find((m) => m.id === hit.id) ?? null) : null;
}
