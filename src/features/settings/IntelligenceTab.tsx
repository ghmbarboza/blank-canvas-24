import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAccount } from "@/lib/account";
import { errorMessage } from "@/lib/functions";
import { useUpdateAutomation, type AutomationSettings } from "./api";
import { SettingsCard } from "./SettingsCard";
import { UsageCard } from "./UsageCard";

// A abertura automática de cartão por nota (auto_deal) é de venda: fica fora da tela desta
// edição. O valor salvo é preservado e reenviado sem mudança.
const MIN_SCORE = 40;
const MAX_SCORE = 90;
const DEFAULT_SCORE = 60;

function fromSettings(
  s: { auto_classify?: boolean; auto_deal?: boolean; auto_deal_min_score?: number } | undefined,
): AutomationSettings {
  const score = s?.auto_deal_min_score ?? DEFAULT_SCORE;
  return {
    auto_classify: s?.auto_classify ?? true,
    // Mesmo padrão do servidor: só desliga quando está explicitamente false.
    auto_deal: s?.auto_deal ?? false,
    auto_deal_min_score: Math.min(MAX_SCORE, Math.max(MIN_SCORE, score)),
  };
}

function ToggleRow({
  id,
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  disabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-6 py-4">
      <div>
        <Label htmlFor={id} className="text-[14px]">
          {label}
        </Label>
        <p className="mt-0.5 text-[12px] text-muted-foreground">{hint}</p>
      </div>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  );
}

export function IntelligenceTab() {
  const { current, isAdmin } = useAccount();
  const accountId = current?.accountId ?? "";
  const update = useUpdateAutomation(accountId);
  const [form, setForm] = useState<AutomationSettings>(() => fromSettings(current?.settings));
  const saved = fromSettings(current?.settings);

  useEffect(() => setForm(fromSettings(current?.settings)), [current?.settings]);

  const dirty =
    form.auto_classify !== saved.auto_classify ||
    form.auto_deal !== saved.auto_deal ||
    form.auto_deal_min_score !== saved.auto_deal_min_score;

  function save() {
    update.mutate(form, {
      onSuccess: () => toast.success("Ajuste salvo"),
      onError: (err) => toast.error(errorMessage(err)),
    });
  }

  return (
    <div className="space-y-6">
      <SettingsCard
        title="Inteligência"
        description="A IA lê as conversas, resume o cliente e sugere o próximo passo."
        readOnlyNote={isAdmin ? undefined : "Só donos e administradores mudam a automação."}
      >
        <div className="divide-y divide-border">
          <ToggleRow
            id="auto-classify"
            label="Resumir o cliente automaticamente quando chegam mensagens"
            hint="O resumo e o próximo passo se atualizam sozinhos a cada conversa nova."
            checked={form.auto_classify}
            disabled={!isAdmin}
            onChange={(v) => setForm((f) => ({ ...f, auto_classify: v }))}
          />
        </div>
        {isAdmin && (
          <Button className="mt-2" onClick={save} disabled={!dirty || update.isPending}>
            {update.isPending && <Loader2 className="animate-spin" aria-hidden />}
            Salvar
          </Button>
        )}
      </SettingsCard>
      {isAdmin && <UsageCard accountId={accountId} />}
    </div>
  );
}
