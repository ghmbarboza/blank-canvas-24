import type { ComponentType } from "react";
import {
  Blocks,
  BellRing,
  BookOpenCheck,
  Bot,
  Building2,
  CalendarDays,
  Code2,
  History,
  ListPlus,
  Mail,
  Package,
  Palette,
  PhoneCall,
  PlugZap,
  ShieldCheck,
  Timer,
  Users,
  type LucideIcon,
} from "lucide-react";

import { CatalogTab } from "@/features/catalog/CatalogTab";
import { EmailSettingsTab } from "@/features/email/EmailSettingsTab";
import { TelephonyTab } from "@/features/telephony/TelephonyTab";
import { AgentTab } from "@/features/support/AgentTab";
import { SupportSettingsTab } from "@/features/support/SupportSettingsTab";
import { CalendarSettingsTab } from "@/features/booking/CalendarSettingsTab";
import { PlaybooksTab } from "@/features/playbooks/PlaybooksTab";
import { CustomFieldsTab } from "@/features/custom-fields/CustomFieldsTab";
import { DevelopersTab } from "@/features/developers/DevelopersTab";
import { IntegrationsTab } from "@/features/integrations/IntegrationsTab";
import { ModulesTab } from "./ModulesTab";
import { AuditTab } from "@/features/privacy/AuditTab";
import { PrivacyTab } from "@/features/privacy/PrivacyTab";
import { NotificationSettingsTab } from "@/features/notifications/NotificationSettingsTab";
import { cn } from "@/lib/utils";

import { AppearanceTab } from "./AppearanceTab";
import { CompanyTab } from "./CompanyTab";
import { IntelligenceTab } from "./IntelligenceTab";
import { TeamTab } from "./TeamTab";
import type { SettingsTab } from "./tabs";
import { EDITION, hasChannel, type Edition } from "@/lib/edition";

type GroupId = "empresa" | "equipe" | "canais" | "inteligencia" | "atendimento" | "privacidade";

interface Group {
  id: GroupId;
  label: string;
  description: string;
}

interface Section {
  id: SettingsTab;
  label: string;
  icon: LucideIcon;
  group: GroupId;
  component: ComponentType;
  /** Fora da edição quando devolve false (ver src/lib/edition.ts). Sem isto, sempre aparece. */
  inEdition?: (edition: Edition) => boolean;
}

// Seis grupos pelo que a pessoa quer resolver. Toda aba antiga (?aba=) continua com o mesmo id.
const GROUPS: Group[] = [
  {
    id: "empresa",
    label: "Empresa",
    description: "Quem é a sua empresa, como o Vínculo aparece para a equipe e o que vocês vendem.",
  },
  {
    id: "equipe",
    label: "Equipe",
    description: "Quem entra no Vínculo e o que cada pessoa pode fazer.",
  },
  {
    id: "canais",
    label: "Canais e integrações",
    description:
      "O que liga os seus canais de atendimento. As chaves ficam guardadas no cofre, nunca à vista.",
  },
  {
    id: "inteligencia",
    label: "Inteligência",
    description: "Como a IA lê cada cliente e como o agente responde.",
  },
  {
    id: "atendimento",
    label: "Atendimento",
    description: "Horário de atendimento, prazos de resposta e respostas prontas para a equipe.",
  },
  {
    id: "privacidade",
    label: "Privacidade",
    description: "Pedidos de dados pessoais (LGPD) e o histórico de quem mudou o quê.",
  },
];

const ALL_SECTIONS: Section[] = [
  {
    id: "empresa",
    label: "Dados da empresa",
    icon: Building2,
    group: "empresa",
    component: CompanyTab,
  },
  {
    id: "aparencia",
    label: "Aparência",
    icon: Palette,
    group: "empresa",
    component: AppearanceTab,
  },
  {
    id: "recursos",
    label: "Recursos extras",
    icon: Blocks,
    group: "empresa",
    component: ModulesTab,
  },
  {
    id: "notificacoes",
    label: "Notificações",
    icon: BellRing,
    group: "empresa",
    component: NotificationSettingsTab,
  },
  {
    id: "catalogo",
    label: "Produtos e serviços",
    icon: Package,
    group: "empresa",
    component: CatalogTab,
  },
  {
    id: "campos",
    label: "Campos personalizados",
    icon: ListPlus,
    group: "empresa",
    component: CustomFieldsTab,
  },
  { id: "equipe", label: "Pessoas e acessos", icon: Users, group: "equipe", component: TeamTab },
  {
    id: "playbooks",
    label: "Roteiros de venda",
    icon: BookOpenCheck,
    group: "equipe",
    component: PlaybooksTab,
    // roteiro e nota do coach ao vivo: só existem em reunião por vídeo ou ligação
    inEdition: (e) => hasChannel("video", e) || hasChannel("phone", e),
  },
  {
    id: "integracoes",
    label: "Integrações",
    icon: PlugZap,
    group: "canais",
    component: IntegrationsTab,
  },
  {
    id: "email",
    label: "E-mail",
    icon: Mail,
    group: "canais",
    component: EmailSettingsTab,
    inEdition: (e) => hasChannel("email", e),
  },
  {
    id: "agenda",
    label: "Agenda e reuniões",
    icon: CalendarDays,
    group: "canais",
    component: CalendarSettingsTab,
    inEdition: (e) => hasChannel("video", e),
  },
  {
    id: "telefonia",
    label: "Telefonia",
    icon: PhoneCall,
    group: "canais",
    component: TelephonyTab,
    inEdition: (e) => hasChannel("phone", e),
  },
  {
    id: "desenvolvedores",
    label: "API e webhooks",
    icon: Code2,
    group: "canais",
    component: DevelopersTab,
    inEdition: (e) => e.allIntegrations,
  },
  {
    id: "inteligencia",
    label: "Nota e próximo passo",
    icon: Bot,
    group: "inteligencia",
    component: IntelligenceTab,
  },
  { id: "agente", label: "Agente de IA", icon: Bot, group: "inteligencia", component: AgentTab },
  {
    id: "atendimento",
    label: "Horário, prazos e respostas",
    icon: Timer,
    group: "atendimento",
    component: SupportSettingsTab,
  },
  {
    id: "privacidade",
    label: "Privacidade e LGPD",
    icon: ShieldCheck,
    group: "privacidade",
    component: PrivacyTab,
  },
  {
    id: "auditoria",
    label: "Histórico de alterações",
    icon: History,
    group: "privacidade",
    component: AuditTab,
  },
];

/** Seções que a edição mostra (a aba escondida cai na primeira: o endereço antigo não quebra). */
export function settingsSectionsFor(edition: Edition = EDITION): Section[] {
  return ALL_SECTIONS.filter((s) => !s.inEdition || s.inEdition(edition));
}

const SECTIONS = settingsSectionsFor();

interface Props {
  tab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
}

function navItemClass(active: boolean) {
  return cn(
    "flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-1.5 text-[13px] whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
    active
      ? "bg-surface font-medium text-foreground"
      : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
  );
}

export function SettingsPage({ tab, onTabChange }: Props) {
  const active = SECTIONS.find((s) => s.id === tab) ?? SECTIONS[0]!;
  const group = GROUPS.find((g) => g.id === active.group) ?? GROUPS[0]!;
  const siblings = SECTIONS.filter((s) => s.group === group.id);
  const Active = active.component;
  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      {/* Telas largas: todos os grupos e seções de uma vez. */}
      <nav
        aria-label="Seções de ajustes"
        className="hidden shrink-0 overflow-y-auto border-r border-border md:block md:w-64"
      >
        <div className="px-4 pt-6 pb-3">
          <p className="font-display text-[20px] font-semibold">Ajustes</p>
        </div>
        <div className="px-3 pb-6">
          {GROUPS.map((g, gi) => (
            <div key={g.id} className={cn(gi > 0 && "mt-5")}>
              <p className="ds-group-label">{g.label}</p>
              <div className="space-y-0.5">
                {SECTIONS.filter((s) => s.group === g.id).map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onTabChange(s.id)}
                    aria-current={s.id === active.id ? "page" : undefined}
                    className={cn(navItemClass(s.id === active.id), "w-full")}
                  >
                    <s.icon className="size-4 shrink-0" aria-hidden />
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </nav>

      {/* Celular: primeiro o grupo, depois a seção dentro dele. */}
      <div className="shrink-0 border-b border-border md:hidden">
        <nav aria-label="Grupos de ajustes" className="overflow-x-auto px-4 pt-3">
          <ul className="flex gap-5">
            {GROUPS.map((g) => (
              <li key={g.id}>
                <button
                  type="button"
                  onClick={() =>
                    g.id !== group.id && onTabChange(SECTIONS.find((s) => s.group === g.id)!.id)
                  }
                  aria-current={g.id === group.id ? "page" : undefined}
                  className={cn(
                    "-mb-px border-b-2 pb-2.5 text-[13px] whitespace-nowrap focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    g.id === group.id
                      ? "border-foreground font-medium text-foreground"
                      : "border-transparent text-muted-foreground",
                  )}
                >
                  {g.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-4 py-6 sm:px-8 sm:py-8">
          <nav
            aria-label="Você está em"
            className="text-[11px] font-medium tracking-[0.08em] text-subtle uppercase"
          >
            <ol className="flex flex-wrap items-center gap-1.5">
              <li>
                <span>Ajustes</span>
              </li>
              <li aria-hidden>›</li>
              <li>
                <span>{group.label}</span>
              </li>
              {siblings.length > 1 && (
                <>
                  <li aria-hidden>›</li>
                  <li className="text-foreground" aria-current="page">
                    <span>{active.label}</span>
                  </li>
                </>
              )}
            </ol>
          </nav>
          <div className="mt-2 border-b border-border pb-6">
            <h1 className="font-display text-[26px] leading-tight font-medium sm:text-[30px]">
              {group.label}
            </h1>
            <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted-foreground sm:text-[15px]">
              {group.description}
            </p>
            {siblings.length > 1 && (
              <ul className="mt-4 flex flex-wrap gap-1.5 md:hidden">
                {siblings.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => onTabChange(s.id)}
                      aria-current={s.id === active.id ? "page" : undefined}
                      className={cn(
                        "rounded-full border px-3 py-1 text-[12px] font-medium whitespace-nowrap focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                        s.id === active.id
                          ? "border-primary bg-primary-soft text-foreground"
                          : "border-border text-muted-foreground",
                      )}
                    >
                      {s.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="pt-6">
            <Active />
          </div>
        </div>
      </div>
    </div>
  );
}
