import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { RotateCcw } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useSetup } from "@/features/setup/SetupWizard";
import {
  EXTRA_MODULES,
  enabledModules,
  extraModulesFor,
  type ModuleId,
} from "@/components/layout/modules";
import { ACCOUNT_QUERY_KEY, useAccount } from "@/lib/account";
import { BRAND } from "@/lib/brand";
import { errorMessage } from "@/lib/functions";

import { patchAccountSettings } from "./api";
import { SettingsCard } from "./SettingsCard";

// O menu começa com o pós-venda (atender, clientes, regras). O resto liga aqui.
export function ModulesTab() {
  const { current, isAdmin } = useAccount();
  const accountId = current!.accountId;
  const on = enabledModules(current?.settings);
  const qc = useQueryClient();
  const toggle = useMutation({
    mutationFn: (p: { id: ModuleId; value: boolean }) =>
      patchAccountSettings(accountId, (cur) => {
        const list = new Set(Array.isArray(cur["modules"]) ? (cur["modules"] as string[]) : []);
        if (p.value) list.add(p.id);
        else list.delete(p.id);
        return { ...cur, modules: [...list] };
      }),
    onSuccess: (_, p) => {
      void qc.invalidateQueries({ queryKey: ACCOUNT_QUERY_KEY });
      const label = EXTRA_MODULES.find((m) => m.id === p.id)?.label ?? p.id;
      toast.success(p.value ? `${label} aparece no menu` : `${label} saiu do menu`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div className="flex flex-col gap-5">
      <SettingsCard
        title="Recursos extras"
        description="A central vem pronta para o pós-venda: atender, cuidar da carteira e ligar as regras. Ligue aqui o que mais a sua operação usa; desligar só tira do menu, nada é apagado."
        {...(isAdmin
          ? {}
          : { readOnlyNote: "Só o administrador da conta liga ou desliga recursos." })}
      >
        <ul className="divide-y divide-border">
          {extraModulesFor().map((m) => {
            const checked = on.has(m.id);
            return (
              <li key={m.id} className="flex items-start gap-4 py-4 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <label htmlFor={`mod-${m.id}`} className="text-[14px] font-medium">
                    {m.label}
                  </label>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">{m.what}</p>
                  <p className="mt-0.5 text-[12px] text-subtle">{m.when}</p>
                </div>
                <Switch
                  id={`mod-${m.id}`}
                  checked={checked}
                  disabled={!isAdmin || toggle.isPending}
                  onCheckedChange={(value) => toggle.mutate({ id: m.id, value })}
                />
              </li>
            );
          })}
        </ul>
      </SettingsCard>
      {isAdmin ? <RestartSetupCard /> : null}
    </div>
  );
}

/** "Refazer configuração inicial" (revisão de 27/10, P1-4): reabre a guia do primeiro passo. */
function RestartSetupCard() {
  const { restartNexa } = useSetup();
  const [busy, setBusy] = useState(false);
  async function restart() {
    setBusy(true);
    try {
      await restartNexa();
    } catch (e) {
      toast.error(`Não deu para recomeçar a configuração: ${errorMessage(e)}. Tente de novo.`);
    } finally {
      setBusy(false);
    }
  }
  return (
    <SettingsCard
      title="Refazer configuração inicial"
      description={`A ${BRAND.assistant} volta ao primeiro passo: pergunta de novo o que vocês vão usar e oferece o que foi pulado. Nada do que já está salvo é apagado (empresa, canais, agentes e conhecimento continuam).`}
    >
      <Button variant="outline" onClick={() => void restart()} disabled={busy}>
        <RotateCcw className="size-4" aria-hidden />
        {busy ? `Abrindo a ${BRAND.assistant}…` : "Refazer configuração inicial"}
      </Button>
    </SettingsCard>
  );
}
