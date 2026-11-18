import {
  BarChart3,
  CalendarClock,
  FileSpreadsheet,
  HeartPulse,
  LayoutTemplate,
  RefreshCw,
  type LucideIcon,
} from "lucide-react";

import { PageHeader } from "@/components/common/PageHeader";
import { useAccount } from "@/lib/account";
import { cn } from "@/lib/utils";

import { CrmSyncTab } from "./tabs/CrmSyncTab";
import { CustomersTab } from "./tabs/CustomersTab";
import { ImportTab } from "./tabs/ImportTab";
import { IndicatorsTab } from "./tabs/IndicatorsTab";
import { StaffingTab } from "./tabs/StaffingTab";
import { TemplatesTab } from "./tabs/TemplatesTab";

export const GESTAO_TABS = [
  "escala",
  "indicadores",
  "clientes",
  "importar",
  "crm",
  "modelos",
] as const;
export type GestaoTab = (typeof GESTAO_TABS)[number];

const META: Record<GestaoTab, { label: string; icon: LucideIcon; managerOnly: boolean }> = {
  escala: { label: "Escala", icon: CalendarClock, managerOnly: true },
  indicadores: { label: "Indicadores", icon: BarChart3, managerOnly: true },
  clientes: { label: "Saúde dos clientes", icon: HeartPulse, managerOnly: false },
  importar: { label: "Importar", icon: FileSpreadsheet, managerOnly: true },
  crm: { label: "Outro CRM", icon: RefreshCw, managerOnly: true },
  modelos: { label: "Modelo do segmento", icon: LayoutTemplate, managerOnly: true },
};

// Gestão da operação: quantas pessoas escalar, indicadores com tendência, saúde da carteira e a
// convivência com o que o cliente já usa (planilha, RD Station, HubSpot, Kommo, Pipedrive).
export function GestaoPage({
  tab,
  onTabChange,
}: {
  tab: GestaoTab;
  onTabChange: (t: GestaoTab) => void;
}) {
  const { current, isManager, isAdmin } = useAccount();
  const accountId = current!.accountId;
  const tabs = GESTAO_TABS.filter((t) => isManager || !META[t].managerOnly);
  const active = tabs.includes(tab) ? tab : (tabs[0] ?? "clientes");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="Gestão"
        description="Escala, indicadores, saúde da carteira e o que você já usa"
      />
      <nav
        aria-label="Gestão"
        className="shrink-0 overflow-x-auto border-b border-border px-4 sm:px-6"
      >
        <ul className="flex gap-5">
          {tabs.map((t) => {
            const m = META[t];
            const isActive = t === active;
            return (
              <li key={t}>
                <button
                  type="button"
                  onClick={() => onTabChange(t)}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "relative inline-flex items-center gap-1.5 rounded-sm py-3 text-[13px] whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    "after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:transition-opacity",
                    isActive
                      ? "font-semibold text-foreground after:bg-primary after:opacity-100"
                      : "text-muted-foreground after:opacity-0 hover:text-foreground",
                  )}
                >
                  <m.icon className="size-3.5" aria-hidden /> {m.label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
        {active === "escala" && <StaffingTab accountId={accountId} canEdit={isManager} />}
        {active === "indicadores" && <IndicatorsTab accountId={accountId} />}
        {active === "clientes" && <CustomersTab accountId={accountId} />}
        {active === "importar" && <ImportTab accountId={accountId} />}
        {active === "crm" && <CrmSyncTab accountId={accountId} canEdit={isAdmin} />}
        {active === "modelos" && <TemplatesTab accountId={accountId} canEdit={isManager} />}
      </div>
    </div>
  );
}
