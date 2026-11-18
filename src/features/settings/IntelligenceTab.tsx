import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { TempChip } from "@/components/common/TempChip";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useAccount } from "@/lib/account";
import { errorMessage } from "@/lib/functions";
import { useUpdateAutomation, type AutomationSettings } from "./api";
import { SettingsCard } from "./SettingsCard";
import { UsageCard } from "./UsageCard";

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
    auto_deal: s?.auto_deal ?? true,
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
      onSuccess: () => toast.success("Automação salva"),
      onError: (err) => toast.error(errorMessage(err)),
    });
  }

  return (
    <div className="space-y-6">
      <SettingsCard
        title="Inteligência"
        description="A IA lê as conversas, dá uma nota de 0 a 100 para cada lead e diz o próximo passo."
        readOnlyNote={isAdmin ? undefined : "Só donos e administradores mudam a automação."}
      >
        <div className="mb-2 grid gap-2 rounded-lg bg-surface-2 p-3 text-[12px] text-muted-foreground sm:grid-cols-3">
          <p className="flex items-center gap-2">
            <TempChip level="hot" /> pronto para comprar, responda já
          </p>
          <p className="flex items-center gap-2">
            <TempChip level="warm" /> interessado, falta decidir
          </p>
          <p className="flex items-center gap-2">
            <TempChip level="cold" /> curioso ou sem fit agora
          </p>
        </div>
        <div className="divide-y divide-border">
          <ToggleRow
            id="auto-classify"
            label="Classificar leads automaticamente quando chegam mensagens"
            hint="A nota e a temperatura se atualizam sozinhas a cada conversa nova."
            checked={form.auto_classify}
            disabled={!isAdmin}
            onChange={(v) => setForm((f) => ({ ...f, auto_classify: v }))}
          />
          <ToggleRow
            id="auto-deal"
            label="Abrir negócio no funil quando o lead esquentar"
            hint="Cria o negócio no funil padrão, desde que o contato ainda não tenha um negócio aberto."
            checked={form.auto_deal}
            disabled={!isAdmin}
            onChange={(v) => setForm((f) => ({ ...f, auto_deal: v }))}
          />
          <div className={form.auto_deal ? "py-4" : "py-4 opacity-50"}>
            <div className="flex items-baseline justify-between">
              <Label htmlFor="auto-deal-score" className="text-[14px]">
                Nota mínima para abrir negócio
              </Label>
              <span className="font-display text-2xl font-semibold tabular-nums">
                {form.auto_deal_min_score}
              </span>
            </div>
            <Slider
              id="auto-deal-score"
              className="mt-3"
              min={MIN_SCORE}
              max={MAX_SCORE}
              step={5}
              value={[form.auto_deal_min_score]}
              disabled={!isAdmin || !form.auto_deal}
              onValueChange={([v]) =>
                setForm((f) => ({ ...f, auto_deal_min_score: v ?? DEFAULT_SCORE }))
              }
              aria-label="Nota mínima para abrir negócio"
            />
            <div className="mt-1.5 flex justify-between text-[11px] text-subtle tabular-nums">
              <span>{MIN_SCORE} · mais negócios</span>
              <span>{MAX_SCORE} · só os certeiros</span>
            </div>
          </div>
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
