import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, Plus, Workflow } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccount } from "@/lib/account";
import { formatNumber } from "@/lib/format";
import { errorMessage } from "@/lib/functions";

import { useAutomationAction, useAutomations, useAutomationsToday, useSaveAutomation } from "./api";
import { DEFAULT_EXIT, DEFAULT_GUARDS } from "./engine";
import { FlowCard } from "./FlowCard";
import { SocialAutomations } from "./SocialAutomations";
import { hasChannel } from "@/lib/edition";
import { TemplateGallery } from "./TemplateGallery";
import { TemplatePreviewDialog } from "./TemplatePreviewDialog";
import { blankGraph, templatesFor, type AutomationTemplate } from "./templates";

// Automações: cada fluxo lido como frase, o que rodou hoje, liga/desliga e os modelos para começar.
export function AutomationsPage() {
  const { current, isManager } = useAccount();
  const accountId = current!.accountId;
  const navigate = useNavigate();
  const list = useAutomations(accountId);
  const today = useAutomationsToday(accountId);
  const action = useAutomationAction(accountId);
  const save = useSaveAutomation(accountId);
  const [toggling, setToggling] = useState<string | null>(null);
  // modelo em prévia (undefined = nenhum; null = começar do zero). Só grava em "Usar este modelo".
  const [preview, setPreview] = useState<AutomationTemplate | null | undefined>(undefined);
  const rows = list.data ?? [];
  const on = rows.filter((a) => a.status === "active").length;
  const ranToday = [...(today.data?.values() ?? [])].reduce((s, t) => s + t.runs, 0);

  async function create(t: AutomationTemplate | null) {
    try {
      const row = await save.mutateAsync({
        name: t?.name ?? "Nova automação",
        description: t?.description ?? null,
        kind: t?.kind ?? "journey",
        trigger: t?.trigger ?? { type: "manual" },
        graph: t?.graph ?? blankGraph(),
        exit_rules: { ...DEFAULT_EXIT, ...(t?.exit_rules ?? {}) },
        guards: DEFAULT_GUARDS,
        template_key: t?.key ?? null,
        status: "draft",
      });
      void navigate({ to: "/automacoes/$automationId", params: { automationId: row.id } });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  function toggle(id: string, turnOn: boolean) {
    setToggling(id);
    action.mutate(
      { action: turnOn ? "activate" : "pause", automationId: id },
      {
        onSuccess: () => toast.success(turnOn ? "Automação ligada" : "Automação desligada"),
        onError: (e) => toast.error(errorMessage(e)),
        onSettled: () => setToggling(null),
      },
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="Automações"
        description="Fluxos que atendem, nutrem e cobram o vendedor sozinhos, no horário que você definir."
        actions={
          isManager && (
            <Button
              size="sm"
              onClick={() => setPreview(null)}
              disabled={save.isPending}
              aria-label="Criar automação do zero"
            >
              {save.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
              <span className="hidden sm:inline">Criar do zero</span>
            </Button>
          )
        }
      />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-6xl space-y-10 p-4 sm:p-6 lg:p-8">
          <section aria-labelledby="flows-title" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="flows-title" className="eyebrow text-subtle">
                Seus fluxos
              </h2>
              {rows.length > 0 && (
                <span className="rounded-full border border-border bg-surface px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground tabular-nums">
                  {on} {on === 1 ? "ligada" : "ligadas"} · {formatNumber(ranToday)}{" "}
                  {ranToday === 1 ? "execução hoje" : "execuções hoje"}
                </span>
              )}
            </div>
            {list.isPending ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }, (_, i) => (
                  <Skeleton key={i} className="h-28 rounded-[24px]" />
                ))}
              </div>
            ) : list.isError ? (
              <p className="rounded-2xl border border-danger/40 px-4 py-6 text-center text-[13px] text-danger">
                {errorMessage(list.error)}
              </p>
            ) : rows.length === 0 ? (
              <EmptyState
                icon={Workflow}
                className="rounded-[24px] border border-dashed border-border py-12"
                title="Nenhuma automação ainda"
                description={
                  isManager
                    ? templatesFor().length > 0
                      ? "Escolha um modelo abaixo: boas-vindas do lead, recuperação de quem não respondeu, lembrete de reunião, pós-venda com NPS. Você ajusta e liga quando quiser."
                      : "As regras prontas ficam em Regras de pós-venda. Aqui você monta um fluxo do zero: quando acontecer algo, o que enviar no WhatsApp e o que a equipe faz."
                    : "Quando um gestor ligar uma automação, ela aparece aqui com o que rodou hoje."
                }
              />
            ) : (
              <ul className="space-y-3">
                {rows.map((a) => (
                  <FlowCard
                    key={a.id}
                    a={a}
                    today={today.data?.get(a.id)}
                    canToggle={isManager}
                    toggling={toggling === a.id}
                    onToggle={(v) => toggle(a.id, v)}
                    accountId={accountId}
                  />
                ))}
              </ul>
            )}
          </section>

          {isManager && (hasChannel("instagram") || hasChannel("messenger")) && (
            <SocialAutomations accountId={accountId} />
          )}

          {isManager && <TemplateGallery busy={save.isPending} onPick={(t) => setPreview(t)} />}
        </div>
      </div>
      <TemplatePreviewDialog
        template={preview}
        busy={save.isPending}
        onClose={() => setPreview(undefined)}
        onUse={(t) => void create(t)}
      />
    </div>
  );
}
