// Passos do assistente de configuração que pertencem à gestão:
// - modelo do segmento (funis, campos, respostas rápidas, cadências, agentes e qualidade de uma vez);
// - trazer os dados que o cliente já tem (planilha, RD Station, Kommo, Pipedrive, HubSpot).
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";

import { BrandTile } from "@/components/brand/BrandIcon";
import { useAppliedTemplates } from "./api";
import { CrmSyncPanel } from "./tabs/CrmSyncTab";
import { ImportWizard } from "./tabs/ImportWizard";
import { SegmentTemplatePicker } from "./tabs/TemplatesTab";

interface StepProps {
  accountId: string;
  onDone: () => void;
}

export function SegmentTemplateSetupStep({ accountId, onDone }: StepProps) {
  const applied = useAppliedTemplates(accountId);
  const current = applied.data?.find((a) => a.area === "segment")?.template_key;
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-[18px] font-medium">Qual é o seu negócio?</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Escolha o mais parecido. A gente monta o funil, os campos, as respostas rápidas, as
          cadências e os textos da IA do seu segmento. Dá para mudar tudo depois.
        </p>
      </div>
      <SegmentTemplatePicker accountId={accountId} onApplied={onDone} />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>
          {current ? "Continuar" : "Pular, monto do meu jeito"}
          <ArrowRight className="size-3.5" aria-hidden />
        </Button>
      </div>
    </div>
  );
}

export function ImportSetupStep({ accountId, onDone }: StepProps) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-[18px] font-medium">Traga o que você já tem</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Suba a planilha de clientes ou a exportação do seu CRM. Repetidos são juntados pelo
          telefone, e-mail ou CNPJ, e você vê tudo antes de gravar.
        </p>
      </div>
      <ImportWizard accountId={accountId} />
      <details className="rounded-xl border border-border bg-surface p-4">
        <summary className="flex cursor-pointer items-center gap-2 text-[13px] font-medium">
          <BrandTile id="rdstation" size={24} />
          <BrandTile id="hubspot" size={24} />
          Prefere manter o RD Station ou o HubSpot ligado ao Nexus?
        </summary>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <CrmSyncPanel accountId={accountId} provider="rdstation_crm" canEdit />
          <CrmSyncPanel accountId={accountId} provider="hubspot" canEdit />
        </div>
      </details>
      <div className="flex justify-end">
        <Button variant="ghost" onClick={onDone}>
          Continuar <ArrowRight className="size-3.5" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
