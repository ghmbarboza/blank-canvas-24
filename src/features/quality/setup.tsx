import { Bot, CheckCircle2, FlaskConical, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/functions";

import { useQualityAction, type EvaluateResult } from "./api";
import { QUALITY_TEMPLATES } from "./scoring";
import { useQualitySetupStatus } from "./setup-status";

// Passo do assistente: escolher um modelo pronto de formulário e testar na última interação.
export function QualitySetupStep({ accountId, onDone }: { accountId: string; onDone: () => void }) {
  const status = useQualitySetupStatus(accountId);
  const create = useQualityAction<{ id: string }>(accountId);
  const test = useQualityAction<EvaluateResult>(accountId);

  function pick(key: string) {
    create.mutate(
      { action: "form.template", key },
      {
        onSuccess: () => toast.success("Formulário ativo. As próximas interações já ganham nota."),
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
            ? toast.success(`Funcionou: nota ${Math.round(r.score ?? 0)} na última interação`)
            : toast.info(r.reason ?? "Ainda não há interação para avaliar"),
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  }

  return (
    <div className="grid gap-4">
      <div>
        <h3 className="font-display text-[18px] font-medium">Qualidade em todas as conversas</h3>
        <p className="mt-1 text-[13px] text-muted-foreground">
          A IA confere cada conversa que termina, dá nota e mostra o trecho como prova. Escolha um
          modelo pronto; dá para ajustar depois em Qualidade.
        </p>
      </div>

      {status.done ? (
        <div className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-foreground" aria-hidden />
          <p className="text-[13px]">{status.summary}</p>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-3">
          {QUALITY_TEMPLATES.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => pick(t.key)}
              disabled={create.isPending || status.loading}
              className="lift rounded-xl border border-border bg-surface p-4 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-[0.98] disabled:opacity-60"
            >
              <p className="flex items-center gap-2 text-[13px] font-semibold">
                {create.isPending && create.variables?.["key"] === t.key ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Bot className="size-3.5 text-primary" aria-hidden />
                )}
                {t.name}
              </p>
              <p className="mt-1 text-[12px] text-muted-foreground">{t.description}</p>
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={runTest} disabled={!status.done || test.isPending}>
          {test.isPending ? <Loader2 className="animate-spin" /> : <FlaskConical />} Testar
        </Button>
        <Button onClick={onDone} disabled={!status.done}>
          Continuar
        </Button>
      </div>
    </div>
  );
}
