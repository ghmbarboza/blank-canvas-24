import type { LinkProps } from "@tanstack/react-router";
import {
  BarChart3,
  Bot,
  Building2,
  CalendarDays,
  CircleHelp,
  ClipboardCheck,
  ClipboardList,
  Crosshair,
  GraduationCap,
  Headphones,
  HeartHandshake,
  HeartPulse,
  Inbox,
  KanbanSquare,
  LayoutDashboard,
  Library,
  LifeBuoy,
  Link2,
  ListOrdered,
  Mail,
  Megaphone,
  MessageCircle,
  MessageSquareText,
  Plug,
  Route,
  Settings,
  Siren,
  Sun,
  Target,
  Users,
  Video,
  Workflow,
  type LucideIcon,
} from "lucide-react";

import { BRAND } from "@/lib/brand";
import { EDITION, isRouteHidden, type Edition } from "@/lib/edition";

import type { ModuleId } from "./modules";

/** Contador vivo ao lado do item (vem do AppShell). */
export type NavBadge = "unread" | "myQueue" | "incidents";

export interface NavItem {
  to: NonNullable<LinkProps["to"]>;
  label: string;
  icon: LucideIcon;
  shortcut: string;
  /** Só gestores (owner, admin, manager) veem: o atendente fica com o menu do dia a dia. */
  manager?: true;
  /** Recurso extra: só aparece quando ligado em Ajustes › Recursos extras. */
  module?: ModuleId;
  /** integração que a tela precisa: sem ela conectada o item some (menu limpo no 1º dia) */
  needs?: "zadarma" | "livekit";
  /** Ativo só na rota exata (ex.: /fila não acende em /fila/roteamento). */
  exact?: true;
  badge?: NavBadge;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

// Uma central de pós-venda: atender, cuidar da carteira de clientes, ligar as regras que agem
// sozinhas e ver o resultado. Extras (module) só aparecem quando o gestor liga; o que é de venda
// (origem dos leads, captação, pontuação, metas, treino) fica atrás de recurso desligado.
// O que se configura uma vez fica no rodapé, em CONFIG_GROUP.
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Início",
    items: [
      { to: "/painel", label: "Painel", icon: LayoutDashboard, shortcut: "G P" },
      { to: "/meu-dia", label: "Meu dia", icon: Sun, shortcut: "G D", module: "meu_dia" },
    ],
  },
  {
    label: "Atender",
    items: [
      { to: "/inbox", label: "Caixa de entrada", icon: Inbox, shortcut: "G I", badge: "unread" },
      {
        to: "/fila",
        label: "Minha fila",
        icon: ListOrdered,
        shortcut: "G W",
        exact: true,
        badge: "myQueue",
      },
      { to: "/atendimento", label: "Chamados", icon: LifeBuoy, shortcut: "G T" },
      { to: "/ligacoes", label: "Ligações", icon: Headphones, shortcut: "G L", needs: "zadarma" },
      { to: "/reunioes", label: "Reuniões", icon: Video, shortcut: "G R", needs: "livekit" },
    ],
  },
  {
    label: "Clientes",
    items: [
      { to: "/contatos", label: "Clientes", icon: Users, shortcut: "G C" },
      { to: "/crm", label: "Carteira", icon: KanbanSquare, shortcut: "G F" },
      {
        to: "/gestao",
        label: "Saúde da carteira",
        icon: HeartPulse,
        shortcut: "G G",
        manager: true,
        module: "gestao",
      },
      { to: "/agenda", label: "Agenda", icon: CalendarDays, shortcut: "G A" },
      { to: "/empresas", label: "Empresas", icon: Building2, shortcut: "G E", module: "empresas" },
    ],
  },
  {
    label: "Pós-venda",
    items: [
      {
        to: "/pos-venda",
        label: "Regras de pós-venda",
        icon: HeartHandshake,
        shortcut: "G 6",
        manager: true,
      },
      {
        to: "/automacoes",
        label: "Automações",
        icon: Workflow,
        shortcut: "G U",
        manager: true,
        module: "automacoes",
      },
      {
        to: "/campanhas/whatsapp",
        label: "Campanhas de WhatsApp",
        icon: MessageCircle,
        shortcut: "G 5",
        manager: true,
      },
      {
        to: "/campanhas",
        label: "Campanhas de e-mail",
        icon: Mail,
        shortcut: "G M",
        manager: true,
        module: "campanhas",
      },
    ],
  },
  {
    label: "Resultados",
    items: [
      { to: "/relatorios", label: "Relatórios", icon: BarChart3, shortcut: "G B", manager: true },
      { to: "/qualidade", label: "Qualidade", icon: ClipboardCheck, shortcut: "G V" },
      {
        to: "/pergunte",
        label: `Pergunte ao ${BRAND.name}`,
        icon: MessageSquareText,
        shortcut: "G 1",
        manager: true,
        module: "pergunte",
      },
      {
        to: "/incidentes",
        label: "Incidentes",
        icon: Siren,
        shortcut: "G S",
        manager: true,
        module: "incidentes",
        badge: "incidents",
      },
    ],
  },
  {
    label: "Equipe",
    items: [
      { to: "/equipe-ia", label: "Equipe de IA", icon: Bot, shortcut: "G H", manager: true },
      { to: "/metas", label: "Metas da equipe", icon: Target, shortcut: "G Q", module: "metas" },
      { to: "/treino", label: "Treino", icon: GraduationCap, shortcut: "G X", module: "treino" },
      {
        to: "/biblioteca",
        label: "Biblioteca",
        icon: Library,
        shortcut: "G Y",
        module: "biblioteca",
      },
    ],
  },
  // Só existe para quem também capta cliente novo pela Central de CS (recurso "Captação de leads").
  {
    label: "Captação",
    items: [
      {
        to: "/origem",
        label: "Origem dos contatos",
        icon: Megaphone,
        shortcut: "G 3",
        manager: true,
        module: "captacao",
      },
      {
        to: "/formularios",
        label: "Formulários",
        icon: ClipboardList,
        shortcut: "G O",
        manager: true,
        module: "captacao",
      },
      {
        to: "/sdr",
        label: "Distribuição de contatos",
        icon: Crosshair,
        shortcut: "G Z",
        manager: true,
        module: "captacao",
      },
    ],
  },
];

// Ajustado uma vez e revisitado de vez em quando: no rodapé, recolhível, só para gestor.
export const CONFIG_GROUP: NavGroup = {
  label: "Configuração",
  items: [
    { to: "/canais", label: "Canais", icon: Plug, shortcut: "G N", manager: true },
    {
      to: "/fila/roteamento",
      label: "Fila e roteamento",
      icon: Route,
      shortcut: "G 2",
      manager: true,
    },
    {
      to: "/agendamentos",
      label: "Links de agendamento",
      icon: Link2,
      shortcut: "G K",
      manager: true,
    },
    { to: "/ajustes", label: "Ajustes", icon: Settings, shortcut: "G J", manager: true },
  ],
};

/** Ajustes para quem não é gestor (notificações, aparência): sempre no rodapé. */
export const SETTINGS_ITEM: NavItem = {
  to: "/ajustes",
  label: "Ajustes",
  icon: Settings,
  shortcut: "G J",
};

/** Ajuda de quem opera (FAQ e guias): todos os papéis, no rodapé. */
export const HELP_ITEM: NavItem = {
  to: "/central-de-ajuda",
  label: "Ajuda",
  icon: CircleHelp,
  shortcut: "G 4",
};

const NONE: ReadonlySet<string> = new Set();

/**
 * A integração que o item exige está ligada? connected = integrações ligadas; null = ainda não
 * sabemos. No menu a dúvida não esconde nada (`whenUnknown` true); um botão flutuante passa false
 * para não aparecer e sumir em seguida.
 */
export function meetsNeed(
  need: NavItem["needs"],
  connected: ReadonlySet<string> | null,
  whenUnknown = true,
): boolean {
  if (!need) return true;
  if (!connected) return whenUnknown;
  return connected.has(need);
}

const visible =
  (
    isManager: boolean,
    modules: ReadonlySet<string>,
    connected: ReadonlySet<string> | null,
    edition: Edition,
  ) =>
  (i: NavItem) =>
    // tela de um canal que a edição não tem (Ligações, Reuniões, campanhas) nem entra no menu
    !isRouteHidden(String(i.to), edition) &&
    (isManager || !i.manager) &&
    (!i.module || modules.has(i.module)) &&
    meetsNeed(i.needs, connected);

/** Grupos visíveis para o papel, os extras ligados e as integrações (grupo sem item some). */
export function navGroupsFor(
  isManager: boolean,
  modules: ReadonlySet<string> = NONE,
  connected: ReadonlySet<string> | null = null,
  edition: Edition = EDITION,
): NavGroup[] {
  return NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter(visible(isManager, modules, connected, edition)),
  })).filter((g) => g.items.length > 0);
}

/** Toda conta começa no Painel, gestor ou atendente. */
export const HOME = "/painel" as const;

/** Tudo o que o papel alcança (paleta ⌘K e atalhos G + letra). */
export function navItemsFor(
  isManager: boolean,
  modules: ReadonlySet<string> = NONE,
  connected: ReadonlySet<string> | null = null,
  edition: Edition = EDITION,
): NavItem[] {
  const main = navGroupsFor(isManager, modules, connected, edition).flatMap((g) => g.items);
  return isManager
    ? [...main, ...CONFIG_GROUP.items, HELP_ITEM]
    : [...main, SETTINGS_ITEM, HELP_ITEM];
}

export const NAV: NavItem[] = [
  ...NAV_GROUPS.flatMap((g) => g.items),
  ...CONFIG_GROUP.items,
  HELP_ITEM,
];

/** Eyebrow do cabeçalho (DS): o nome do grupo do menu em que a tela mora. */
export function groupLabelFor(pathname: string): string {
  const groups = [...NAV_GROUPS, CONFIG_GROUP];
  let best: { label: string; len: number } | null = null;
  for (const g of groups)
    for (const i of g.items) {
      const to = String(i.to);
      if ((pathname === to || pathname.startsWith(`${to}/`)) && (!best || to.length > best.len))
        best = { label: g.label, len: to.length };
    }
  if (best) return best.label;
  if (pathname.startsWith(String(HELP_ITEM.to))) return "Ajuda";
  return BRAND.name;
}
