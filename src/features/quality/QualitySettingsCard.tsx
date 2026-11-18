import { EDITION } from "@/lib/edition";
import { useEffect, useState } from "react";
import { FlaskConical, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { errorMessage } from "@/lib/functions";

import { useQualityAction, useQualitySettings, useQualitySpend, type EvaluateResult } from "./api";
import { BrandIcon } from "@/components/brand/BrandIcon";

interface Form {
  enabled: boolean;
  monthly_budget_usd: string;
  daily_max: string;
  idle_hours: string;
  include_ai: boolean;
  model_anthropic: string;
  model_openai: string;
}

// Custo e comportamento do avaliador: teto mensal, limite diário, quando a conversa "terminou" e o modelo.
export function QualitySettingsCard({ accountId }: { accountId: string }) {
  const s = useQualitySettings(accountId);
  const spend = useQualitySpend(accountId);
  const save = useQualityAction(accountId);
  const test = useQualityAction<EvaluateResult>(accountId);
  const [f, setF] = useState<Form | null>(null);

  useEffect(() => {
    if (s.isPending || f) return;
    const d = s.data;
    setF({
      enabled: d?.enabled ?? true,
      monthly_budget_usd: String(d?.monthly_budget_usd ?? 20),
      daily_max: String(d?.daily_max ?? 500),
      idle_hours: String(d?.idle_hours ?? 12),
      include_ai: d?.include_ai ?? true,
      model_anthropic: d?.model_anthropic ?? "claude-haiku-5-5",
      model_openai: d?.model_openai ?? "gpt-5.4-mini",
    });
  }, [s.isPending, s.data, f]);

  if (!f) return <Skeleton className="h-72 w-full rounded-xl" />;

  function submit() {
    if (!f) return;
    save.mutate(
      { action: "settings.save", settings: { ...f } },
      {
        onSuccess: () => toast.success("Configuração salva"),
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  }

  function runTest() {
    test.mutate(
      { action: "test" },
      {
        onSuccess: (r) =>
          r.status === "done"
            ? toast.success(`Funcionou: a última interação ganhou nota ${Math.round(r.score ?? 0)}`)
            : toast.error(r.reason ?? "Não deu para avaliar"),
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  }

  const set = (patch: Partial<Form>) => setF({ ...f, ...patch });

  return (
    <section className="grid gap-5 rounded-xl border border-border bg-surface p-5 lg:grid-cols-2">
      <div className="grid content-start gap-4">
        <label className="flex items-center justify-between gap-3 text-[13px]">
          <span>
            <span className="font-medium">Avaliar todas as interações</span>
            <span className="block text-[12px] text-muted-foreground">
              As conversas, quando terminam.
            </span>
          </span>
          <Switch
            checked={f.enabled}
            onCheckedChange={(v) => set({ enabled: v })}
            aria-label="Avaliação ligada"
          />
        </label>
        <label className="flex items-center justify-between gap-3 text-[13px]">
          <span>
            <span className="font-medium">Incluir os agentes de IA</span>
            <span className="block text-[12px] text-muted-foreground">
              As conversas da IA passam pela mesma régua.
            </span>
          </span>
          <Switch
            checked={f.include_ai}
            onCheckedChange={(v) => set({ include_ai: v })}
            aria-label="Incluir agentes de IA"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1">
            <Label htmlFor="qs-budget" className="text-[12px]">
              Teto por mês (US$)
            </Label>
            <Input
              id="qs-budget"
              type="number"
              min={0}
              step="1"
              value={f.monthly_budget_usd}
              onChange={(e) => set({ monthly_budget_usd: e.target.value })}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="qs-daily" className="text-[12px]">
              Avaliações por dia
            </Label>
            <Input
              id="qs-daily"
              type="number"
              min={0}
              value={f.daily_max}
              onChange={(e) => set({ daily_max: e.target.value })}
            />
          </div>
          <div className="col-span-2 grid gap-1">
            <Label htmlFor="qs-idle" className="text-[12px]">
              Conversa parada há quantas horas conta como terminada
            </Label>
            <Input
              id="qs-idle"
              type="number"
              min={1}
              max={168}
              value={f.idle_hours}
              onChange={(e) => set({ idle_hours: e.target.value })}
            />
          </div>
        </div>
        <p className="text-[12px] text-muted-foreground">
          Gasto neste mês:{" "}
          <span className="font-medium tabular-nums">
            US$ {(spend.data?.month_usd ?? 0).toFixed(2)}
          </span>
          {" · "}hoje: <span className="tabular-nums">{spend.data?.today ?? 0}</span> avaliações. Ao
          bater o teto, as interações ficam como “puladas” e podem ser avaliadas depois.
        </p>
      </div>
      <div className="grid content-start gap-4">
        <p className="text-[13px]">
          <span className="font-medium">Modelo do avaliador</span>
          <span className="block text-[12px] text-muted-foreground">
            {EDITION.ownAiKey
              ? "Sem chave própria, o avaliador usa a IA inclusa e não há nada a escolher aqui. Com chave da Anthropic ou da OpenAI (Ajustes › Integrações), ele usa o modelo abaixo: prefira um econômico, porque a conta paga pela própria chave."
              : "O avaliador usa a IA inclusa. Não há nada a escolher aqui."}
          </span>
        </p>
        <div className={EDITION.ownAiKey ? "grid gap-1" : "hidden"}>
          <Label htmlFor="qs-anthropic" className="flex items-center gap-1.5 text-[12px]">
            <BrandIcon id="anthropic" size={14} /> Modelo com a chave da Anthropic (opcional)
          </Label>
          <Input
            id="qs-anthropic"
            value={f.model_anthropic}
            onChange={(e) => set({ model_anthropic: e.target.value })}
          />
        </div>
        <div className={EDITION.ownAiKey ? "grid gap-1" : "hidden"}>
          <Label htmlFor="qs-openai" className="flex items-center gap-1.5 text-[12px]">
            <BrandIcon id="openai" size={14} /> Modelo com a chave da OpenAI (opcional)
          </Label>
          <Input
            id="qs-openai"
            value={f.model_openai}
            onChange={(e) => set({ model_openai: e.target.value })}
          />
        </div>
        <div className="mt-auto flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={runTest} disabled={test.isPending}>
            {test.isPending ? <Loader2 className="animate-spin" /> : <FlaskConical />} Testar agora
          </Button>
          <Button onClick={submit} disabled={save.isPending}>
            {save.isPending && <Loader2 className="animate-spin" />} Salvar
          </Button>
        </div>
      </div>
    </section>
  );
}
