// O que é a central (sempre no menu) e o que é extra (desligado até o gestor ligar em Ajustes).
// Conta nova já nasce com os extras de pós-venda ligados (meu_dia, automacoes, gestao): quem liga
// é create_account_for, no banco. Os de venda (captacao, metas, treino...) nascem desligados.
// Desligar um extra tira do menu e da busca, e a rota dele mostra "Recurso desligado" (os dados
// continuam guardados; o servidor também recusa as ações do extra desligado).
import { BRAND } from "@/lib/brand";
import { EDITION, hasChannel, type Edition } from "@/lib/edition";

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
  | "incidentes"
  | "captacao";

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
    id: "meu_dia",
    label: "Meu dia",
    what: "Agenda, tarefas e clientes que pedem atenção de cada pessoa numa tela só.",
    when: "Para começar o dia sabendo com quem falar primeiro.",
  },
  {
    id: "automacoes",
    label: "Automações",
    what: "Faz as regras de pós-venda agirem sozinhas: boas-vindas, pesquisa, lembrete de recompra.",
    when: "Deixe ligado: sem ele as Regras de pós-venda não disparam.",
  },
  {
    id: "gestao",
    label: "Saúde da carteira",
    what: "Mostra quais clientes estão bem e quais estão em risco, além da escala da equipe.",
    when: "Para agir antes de o cliente sumir ou cancelar.",
  },
  {
    id: "biblioteca",
    label: "Biblioteca",
    what: "Busca nas conversas e ligações gravadas e guarda os melhores trechos.",
    when: "Para montar exemplos de bons atendimentos para o time.",
  },
  {
    id: "pergunte",
    label: `Pergunte ao ${BRAND.name}`,
    what: "O gestor pergunta em português e a IA responde com os números.",
    when: "Para quem prefere perguntar a abrir relatório.",
  },
  {
    id: "incidentes",
    label: "Incidentes",
    what: "Quando algo quebra para muitos clientes, avisa todos de uma vez.",
    when: "Para quem presta serviço contínuo (internet, sistema, plano).",
  },
  {
    id: "empresas",
    label: "Empresas",
    what: "Agrupa os clientes pela empresa onde trabalham.",
    when: "Quando os seus clientes são outras empresas (B2B).",
  },
  {
    id: "campanhas",
    label: "Campanhas de e-mail",
    what: "Envio de e-mail em massa para uma lista de contatos.",
    when: `Quando você faz e-mail marketing pelo próprio ${BRAND.name}.`,
  },
  {
    id: "captacao",
    label: "Captação de leads",
    what: "Formulários, origem dos leads e pontuação com rodízio entre vendedores.",
    when: `Quando você também capta cliente novo pelo ${BRAND.name}, além de cuidar de quem já comprou.`,
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
    what: "A pessoa conversa com um cliente simulado pela IA e recebe nota.",
    when: "Para treinar gente nova antes de atender de verdade.",
  },
];

/** Extras que a edição oferece (o que depende de um canal ausente não é oferecido). */
export function extraModulesFor(edition: Edition = EDITION): ModuleDef[] {
  return EXTRA_MODULES.filter((m) => {
    if (m.id === "campanhas") return hasChannel("email", edition);
    // a Biblioteca guarda trechos de ligações e reuniões gravadas: sem os dois, fica vazia
    if (m.id === "biblioteca") return hasChannel("phone", edition) || hasChannel("video", edition);
    return true;
  });
}

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
  { prefix: "/origem", id: "captacao" },
  { prefix: "/formularios", id: "captacao" },
  { prefix: "/sdr", id: "captacao" },
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
