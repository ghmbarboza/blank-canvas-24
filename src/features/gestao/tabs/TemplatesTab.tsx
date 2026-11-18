import { useState } from "react";
import {
  Building2,
  Car,
  CheckCircle2,
  GraduationCap,
  Home,
  Loader2,
  Rocket,
  ShoppingBag,
  Stethoscope,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";

import { useAppliedTemplates, useApplySegmentTemplate } from "../api";
import { SEGMENT_TEMPLATES, type SegmentKey } from "../templates/segments";

const ICON: Record<SegmentKey, LucideIcon> = {
  clinica: Stethoscope,
  imobiliaria: Home,
  varejo: ShoppingBag,
  saas_b2b: Rocket,
  stand_automovel: Car,
  escola: GraduationCap,
};

// Escolha do modelo do segmento: aplica funil, campos, respostas rápidas, cadências (em rascunho),
// textos dos agentes de IA e formulário de qualidade de uma vez. Pode repetir sem duplicar nada.
export function SegmentTemplatePicker({
  accountId,
  onApplied,
}: {
  accountId: string;
  onApplied?: () => void;
}) {
  const applied = useAppliedTemplates(accountId);
  const apply = useApplySegmentTemplate(accountId);
  const current = applied.data?.find((a) => a.area === "segment")?.template_key ?? null;
  const [picked, setPicked] = useState<SegmentKey | null>(null);
  const sel = SEGMENT_TEMPLATES.find((t) => t.key === (picked ?? current)) ?? null;

  return (
    <div className="space-y-4">
      <div
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
        role="radiogroup"
        aria-label="Segmento da empresa"
      >
        {SEGMENT_TEMPLATES.map((t) => {
          const Icon = ICON[t.key];
          const active = sel?.key === t.key;
          return (
            <button
              key={t.key}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setPicked(t.key)}
              className={cn(
                "lift rounded-xl border p-4 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                active
                  ? "border-primary bg-surface"
                  : "border-border bg-surface hover:border-primary/40",
              )}
            >
              <span className="flex items-center gap-2">
                <Icon className="size-4 text-primary" aria-hidden />
                <span className="text-[14px] font-semibold">{t.name}</span>
                {current === t.key && (
                  <span className="ml-auto rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium">
                    Aplicado
                  </span>
                )}
              </span>
              <span className="mt-1.5 block text-[12px] leading-relaxed text-muted-foreground">
                {t.pitch}
              </span>
            </button>
          );
        })}
      </div>

      {sel && (
        <div className="rounded-xl border border-border bg-surface-2 p-4">
          <p className="text-[13px] font-medium">O que o modelo {sel.name} coloca na sua conta</p>
          <ul className="mt-2 grid gap-1.5 text-[13px] text-muted-foreground sm:grid-cols-2">
            <li>
              <Building2 className="mr-1 inline size-3.5" aria-hidden />
              {sel.model.pipelines
                .map((p) => `jornada "${p.name}" (${p.stages.length} etapas)`)
                .join(" e ")}
            </li>
            <li>
              {sel.model.fields.length} campos:{" "}
              {sel.model.fields
                .map((f) => f.label)
                .slice(0, 4)
                .join(", ")}
              …
            </li>
            <li>{sel.model.macros.length} respostas rápidas (atalho / no chat)</li>
            <li>
              {sel.model.cadences.length} cadências em rascunho:{" "}
              {sel.model.cadences.map((c) => c.name).join(", ")}
            </li>
            <li>
              {sel.model.agents.length} agente(s) de IA:{" "}
              {sel.model.agents.map((a) => a.name).join(", ")}
            </li>
            <li>Formulário de qualidade com {sel.model.qa_form.criteria.length} critérios</li>
          </ul>
          <p className="mt-2 text-[12px] text-subtle">
            Nada do que você já tem é apagado. O que já existe com o mesmo nome fica como está.
          </p>
          <Button
            className="mt-3"
            disabled={apply.isPending}
            onClick={() =>
              apply.mutate(sel.key, {
                onSuccess: (r) => {
                  const total = r.pipelines + r.stages + r.fields + r.macros + r.cadences;
                  toast.success(
                    total === 0
                      ? "Tudo deste modelo já estava na conta"
                      : `Modelo aplicado: ${r.stages} etapas, ${r.fields} campos, ${r.macros} respostas e ${r.cadences} cadências`,
                  );
                  setPicked(null);
                  onApplied?.();
                },
                onError: (e) => toast.error(errorMessage(e)),
              })
            }
          >
            {apply.isPending ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <CheckCircle2 className="size-3.5" aria-hidden />
            )}
            {current === sel.key
              ? "Aplicar de novo (completa o que faltar)"
              : `Usar o modelo ${sel.name}`}
          </Button>
        </div>
      )}
    </div>
  );
}

export function TemplatesTab({ accountId, canEdit }: { accountId: string; canEdit: boolean }) {
  if (!canEdit)
    return (
      <p className="text-[13px] text-muted-foreground">Só gestores aplicam modelos de segmento.</p>
    );
  return <SegmentTemplatePicker accountId={accountId} />;
}
