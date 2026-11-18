import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { ACCOUNT_QUERY_KEY, useAccount } from "@/lib/account";
import { errorMessage } from "@/lib/functions";
import { DEFAULT_MONTHLY_AI_BUDGET_USD, monthlyBudget } from "@/backend/ai/budget";
import { patchAccountSettings } from "@/features/settings/api";

// R9 · teto mensal de IA da conta. Gestor vê o gasto do mês; só administrador muda o teto.

function useMonthSpend(accountId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["ai-month-spend", accountId],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ai_month_spend", {
        _account: accountId,
      });
      if (error) throw new Error(error.message);
      return Number(data ?? 0);
    },
  });
}

const usd = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

export function AiBudgetField({ accountId }: { accountId: string }) {
  const { current, isAdmin } = useAccount();
  const qc = useQueryClient();
  const budget = monthlyBudget(current?.settings);
  const [value, setValue] = useState(String(budget));
  const spend = useMonthSpend(accountId, Boolean(current));
  const save = useMutation({
    mutationFn: async (n: number) =>
      patchAccountSettings(accountId, (cur) => ({ ...cur, ai_budget: { monthly_usd: n } })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ACCOUNT_QUERY_KEY });
      toast.success("Teto de IA salvo");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const n = Number(value.replace(",", "."));
  const valid = value.trim() !== "" && Number.isFinite(n) && n >= 0;
  const spent = spend.data ?? 0;
  const pct = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 100;

  return (
    <section aria-labelledby="ai-budget-heading" className="space-y-2 border-t border-border pt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 id="ai-budget-heading" className="text-[13px] font-medium">
          Teto mensal de IA
        </h4>
        <span className="text-[12px] text-muted-foreground tabular-nums">
          {spend.isLoading ? "…" : `${usd(spent)} de ${usd(budget)} neste mês (${pct}%)`}
        </span>
      </div>
      <p className="text-[12px] text-muted-foreground">
        Ao chegar no teto, só a IA para até o mês virar; atendimento, filas e canais seguem. Padrão:{" "}
        {usd(DEFAULT_MONTHLY_AI_BUDGET_USD)}. Zero desliga a IA.
      </p>
      {isAdmin ? (
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) save.mutate(n);
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="ai-budget" className="text-[12px]">
              Teto em dólar (US$)
            </Label>
            <Input
              id="ai-budget"
              inputMode="decimal"
              className="h-9 w-32"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              aria-invalid={!valid}
            />
          </div>
          <Button type="submit" size="sm" disabled={!valid || save.isPending}>
            {save.isPending && <Loader2 className="animate-spin" aria-hidden />}
            Salvar teto
          </Button>
        </form>
      ) : (
        <p className="text-[12px] text-subtle">Só administradores mudam o teto.</p>
      )}
    </section>
  );
}
