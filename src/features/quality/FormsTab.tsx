import { useState } from "react";
import {
  AlertTriangle,
  ClipboardList,
  Loader2,
  Pencil,
  Plus,
  ShieldAlert,
  Bot,
} from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/functions";

import { useQualityAction, useQualityForms, type QualityForm } from "./api";
import { FormEditorDialog } from "./FormEditorDialog";
import { CHANNEL_LABEL, QUALITY_TEMPLATES } from "./scoring";

export function FormsTab({ accountId }: { accountId: string }) {
  const forms = useQualityForms(accountId);
  const action = useQualityAction<{ id: string }>(accountId);
  const [editing, setEditing] = useState<{ form: QualityForm | null; key: number } | null>(null);

  function fromTemplate(key: string) {
    action.mutate(
      { action: "form.template", key },
      {
        onSuccess: () => toast.success("Formulário criado e ativo"),
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  }

  if (forms.isPending) return <Skeleton className="h-60 w-full rounded-xl" />;
  if (forms.isError)
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Não deu para carregar"
        description={errorMessage(forms.error)}
      />
    );

  return (
    <div className="grid gap-5">
      {(forms.data ?? []).length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Comece por um modelo pronto"
          description="O formulário diz o que a IA confere em cada interação. Escolha um modelo abaixo e ajuste depois."
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {(forms.data ?? []).map((f) => (
            <li key={f.id} className="lift rounded-xl border border-border bg-surface p-5">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-[14px] font-semibold">
                    {f.name}
                    <span
                      className={
                        f.is_active
                          ? "rounded-full bg-primary-soft px-2 py-[2px] text-[11px] font-medium text-primary"
                          : "rounded-full bg-surface-2 px-2 py-[2px] text-[11px] font-medium text-muted-foreground"
                      }
                    >
                      {f.is_active ? "Ativo" : "Pausado"}
                    </span>
                  </p>
                  <p className="mt-0.5 text-[12px] text-muted-foreground">
                    {f.channels.map((c) => CHANNEL_LABEL[c]).join(" · ")}
                    {f.include_ai ? " · inclui agentes de IA" : ""}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Editar ${f.name}`}
                  onClick={() => setEditing({ form: f, key: Date.now() })}
                >
                  <Pencil />
                </Button>
              </div>
              <ul className="mt-3 grid gap-1 text-[12px]">
                {f.criteria.map((c) => (
                  <li key={c.id} className="flex items-center gap-2">
                    {c.eliminatory ? (
                      <ShieldAlert className="size-3.5 text-danger" aria-label="Obrigatório" />
                    ) : (
                      <span className="w-3.5 text-center text-subtle tabular-nums">{c.weight}</span>
                    )}
                    <span className="truncate">{c.label}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <p className="eyebrow">Modelos prontos</p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setEditing({ form: null, key: Date.now() })}
          >
            <Plus /> Criar do zero
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {QUALITY_TEMPLATES.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => fromTemplate(t.key)}
              disabled={action.isPending}
              className="lift rounded-xl border border-dashed border-border-strong bg-background p-4 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-[0.98] disabled:opacity-60"
            >
              <p className="flex items-center gap-2 text-[13px] font-semibold">
                {action.isPending && action.variables?.["key"] === t.key ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Bot className="size-3.5 text-primary" aria-hidden />
                )}
                {t.name}
              </p>
              <p className="mt-1 text-[12px] text-muted-foreground">{t.description}</p>
              <p className="mt-2 text-[11px] text-subtle">{t.criteria.length} critérios</p>
            </button>
          ))}
        </div>
      </section>

      {editing && (
        <FormEditorDialog
          key={editing.key}
          accountId={accountId}
          form={editing.form}
          open
          onOpenChange={(o) => !o && setEditing(null)}
        />
      )}
    </div>
  );
}
