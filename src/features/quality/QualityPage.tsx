import { PageHeader } from "@/components/common/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAccount } from "@/lib/account";

import { CalibrationTab } from "./CalibrationTab";
import { DisputesTab } from "./DisputesTab";
import { EvaluationsTab } from "./EvaluationsTab";
import { FormsTab } from "./FormsTab";
import { OverviewTab } from "./OverviewTab";
import { QualitySettingsCard } from "./QualitySettingsCard";

export type QualityTab =
  "visao" | "notas" | "formularios" | "calibracao" | "contestacoes" | "ajustes";

// Qualidade: 100% das interações com nota, formulários, calibração e contestações.
export function QualityPage({ tab, onTab }: { tab: QualityTab; onTab: (t: QualityTab) => void }) {
  const { current, isManager } = useAccount();
  const accountId = current!.accountId;
  const value = !isManager && !["notas", "contestacoes"].includes(tab) ? "notas" : tab;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="Qualidade"
        description={
          isManager
            ? "Toda ligação, conversa e e-mail com nota da IA, motivo e trecho como prova"
            : "Suas notas, com o motivo e o trecho da conversa"
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        <Tabs value={value} onValueChange={(v) => onTab(v as QualityTab)}>
          <TabsList className="mb-5 flex h-auto w-full flex-wrap justify-start gap-1 sm:w-auto">
            {isManager && <TabsTrigger value="visao">Visão geral</TabsTrigger>}
            <TabsTrigger value="notas">{isManager ? "Notas" : "Minhas notas"}</TabsTrigger>
            {isManager && <TabsTrigger value="formularios">Formulários</TabsTrigger>}
            {isManager && <TabsTrigger value="calibracao">Calibração</TabsTrigger>}
            <TabsTrigger value="contestacoes">Contestações</TabsTrigger>
            {isManager && <TabsTrigger value="ajustes">Custo e modelo</TabsTrigger>}
          </TabsList>
          {isManager && (
            <TabsContent value="visao">
              <OverviewTab accountId={accountId} isManager onTab={onTab} />
            </TabsContent>
          )}
          <TabsContent value="notas">
            <EvaluationsTab accountId={accountId} isManager={isManager} />
          </TabsContent>
          {isManager && (
            <TabsContent value="formularios">
              <FormsTab accountId={accountId} />
            </TabsContent>
          )}
          {isManager && (
            <TabsContent value="calibracao">
              <CalibrationTab accountId={accountId} />
            </TabsContent>
          )}
          <TabsContent value="contestacoes">
            <DisputesTab accountId={accountId} isManager={isManager} />
          </TabsContent>
          {isManager && (
            <TabsContent value="ajustes">
              <QualitySettingsCard accountId={accountId} />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}
