import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useWhatsAppPricing } from "@/features/inbox/useWhatsAppPricing";
import {
  DEFAULT_WA_PRICING,
  PRICING_SOURCE_DATE,
  normalizePricing,
} from "@/features/inbox/whatsapp-pricing";
import { SettingsCard } from "@/features/settings/SettingsCard";
import { patchAccountSettings } from "@/features/settings/api";
import { ACCOUNT_QUERY_KEY, useAccount } from "@/lib/account";
import { errorMessage } from "@/lib/functions";

const FIELDS = [
  ["marketing", "Marketing", "Ofertas, novidades, retomada de contato"],
  ["utility", "Utilidade", "Confirmações, lembretes, aviso de pedido"],
  ["authentication", "Autenticação", "Códigos de acesso"],
  ["service", "Atendimento", "Respostas na janela de 24 h, depois das grátis do mês"],
] as const;

const toText = (n: number) => String(n).replace(".", ",");

// Preço por mensagem do WhatsApp oficial, usado para mostrar o custo antes de enviar.
export function WhatsAppPricingCard() {
  const { current, isAdmin } = useAccount();
  const qc = useQueryClient();
  const pricing = useWhatsAppPricing();
  const [form, setForm] = useState<Record<string, string>>({});
  useEffect(() => {
    setForm({
      marketing: toText(pricing.marketing),
      utility: toText(pricing.utility),
      authentication: toText(pricing.authentication),
      service: toText(pricing.service),
      service_free_monthly: String(pricing.service_free_monthly),
    });
  }, [JSON.stringify(pricing)]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useMutation({
    mutationFn: (values: Record<string, string>) => {
      const next = normalizePricing({
        ...values,
        service_free_monthly: Number(values["service_free_monthly"]),
        reviewed_at: new Date().toLocaleDateString("pt-BR"),
      });
      return patchAccountSettings(current!.accountId, (cur) => ({
        ...cur,
        whatsapp_pricing: next as never,
      }));
    },
    onSuccess: () => {
      toast.success("Preços do WhatsApp salvos");
      void qc.invalidateQueries({ queryKey: ACCOUNT_QUERY_KEY });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <SettingsCard
      brand="whatsapp"
      title="Quanto custa cada mensagem no WhatsApp"
      description={`A Meta cobra por mensagem entregue com modelo aprovado. Usamos estes valores para mostrar o custo antes de enviar um modelo ou ativar uma automação. Os padrões são a tabela da Meta em reais para o Brasil, vigente desde 01/10/2026 (consultada em ${PRICING_SOURCE_DATE}). Volume alto tem desconto: se a sua fatura mostrar outro valor, ajuste aqui.`}
      readOnlyNote={isAdmin ? undefined : "Só donos e administradores alteram os preços."}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {FIELDS.map(([key, label, hint]) => (
          <div key={key} className="grid gap-1.5">
            <Label htmlFor={`wap-${key}`}>{label} (R$ por mensagem)</Label>
            <Input
              id={`wap-${key}`}
              inputMode="decimal"
              value={form[key] ?? ""}
              disabled={!isAdmin}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
            />
            <p className="text-[11px] text-subtle">{hint}</p>
          </div>
        ))}
        <div className="grid gap-1.5">
          <Label htmlFor="wap-free">Atendimento grátis por número, por mês</Label>
          <Input
            id="wap-free"
            inputMode="numeric"
            value={form["service_free_monthly"] ?? ""}
            disabled={!isAdmin}
            onChange={(e) =>
              setForm({ ...form, service_free_monthly: e.target.value.replace(/\D/g, "") })
            }
          />
          <p className="text-[11px] text-subtle">A Meta dá 1.000 por mês desde 01/10/2026.</p>
        </div>
      </div>
      {pricing.reviewed_at && (
        <p className="mt-3 text-[12px] text-subtle">Conferido em {pricing.reviewed_at}.</p>
      )}
      {isAdmin && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => save.mutate(form)} disabled={save.isPending}>
            {save.isPending && <Loader2 className="animate-spin" />} Salvar preços
          </Button>
          <Button
            variant="ghost"
            onClick={() =>
              setForm({
                marketing: toText(DEFAULT_WA_PRICING.marketing),
                utility: toText(DEFAULT_WA_PRICING.utility),
                authentication: toText(DEFAULT_WA_PRICING.authentication),
                service: toText(DEFAULT_WA_PRICING.service),
                service_free_monthly: String(DEFAULT_WA_PRICING.service_free_monthly),
              })
            }
          >
            <RotateCcw /> Voltar aos padrões
          </Button>
        </div>
      )}
    </SettingsCard>
  );
}
