import { ChannelIcon } from "@/components/brand/ChannelIcon";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, Loader2, ShieldAlert, ShieldCheck, UserX } from "lucide-react";
import { toast } from "sonner";

import { ConfirmButton } from "@/components/common/ConfirmButton";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAccount } from "@/lib/account";
import { callApi } from "@/lib/api";
import { errorMessage } from "@/lib/functions";

import type { ContactRow } from "../../types";
import { useContactConsentState } from "./hooks";

const CHANNELS: {
  id: "email" | "whatsapp" | "sms" | "voice" | "call_recording";
  label: string;
  addr: "email" | "phone" | null;
}[] = [
  { id: "email", label: "E-mail marketing", addr: "email" },
  { id: "whatsapp", label: "WhatsApp marketing", addr: "phone" },
  { id: "sms", label: "SMS", addr: "phone" },
  { id: "voice", label: "Ligações", addr: "phone" },
  { id: "call_recording", label: "Gravar ligações e reuniões", addr: null },
];

// Consentimento por canal (LGPD): o último registro vale; supressão (descadastro, bounce, DNC) vence tudo.
export function ContactConsentCard({
  accountId,
  contact,
}: {
  accountId: string;
  contact: ContactRow;
}) {
  const { isManager } = useAccount();
  const qc = useQueryClient();
  const state = useContactConsentState(accountId, contact);
  const toggle = useMutation({
    mutationFn: async ({ channel, granted }: { channel: string; granted: boolean }) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("consents").insert({
        account_id: accountId,
        contact_id: contact.id,
        channel,
        status: granted ? "granted" : "revoked",
        basis: "consent",
        source: "manual",
        recorded_by: u.user?.id ?? null,
        proof: { by: u.user?.email ?? null, at: new Date().toISOString(), ui: "ficha do contato" },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["consent", contact.id] });
      void qc.invalidateQueries({ queryKey: ["timeline360", contact.id] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const exportData = useMutation({
    mutationFn: () =>
      callApi<Record<string, unknown>>("/api/privacy", {
        accountId,
        action: "export",
        contactId: contact.id,
      }),
    onSuccess: (data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `dados-${(contact.name ?? "contato").replace(/\s+/g, "-").toLowerCase()}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success("Dados exportados");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const anonymize = useMutation({
    mutationFn: () =>
      callApi<{ ok: true }>("/api/privacy", {
        accountId,
        action: "anonymize",
        contactId: contact.id,
      }),
    onSuccess: () => {
      toast.success("Contato anonimizado e removido das listas");
      void qc.invalidateQueries({ queryKey: ["contacts", accountId] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const sup = state.data?.suppressions ?? [];
  return (
    <section className="rounded-2xl border border-border bg-surface p-5" aria-label="Privacidade">
      <p className="eyebrow mb-3">Privacidade e consentimento</p>
      {state.isPending ? (
        <Loader2 className="mx-auto my-4 size-4 animate-spin text-subtle" />
      ) : (
        <ul className="space-y-2">
          {CHANNELS.map((ch) => {
            const supp = sup.find((s) => s.channel === ch.id);
            const st = state.data?.consents.find((c) => c.channel === ch.id);
            const missing =
              ch.addr === "email" ? !contact.email : ch.addr === "phone" ? !contact.phone : false;
            const granted = !supp && (st ? st.status === "granted" : ch.id !== "call_recording");
            return (
              <li key={ch.id} className="flex items-center gap-3 text-[13px]">
                {supp ? (
                  <ShieldAlert className="size-4 shrink-0 text-danger" />
                ) : (
                  <ShieldCheck className="size-4 shrink-0 text-subtle" />
                )}
                <span className="min-w-0 flex-1">
                  {ch.id === "whatsapp" ? (
                    <span className="inline-flex items-center gap-1.5">
                      <ChannelIcon platform="whatsapp" size={14} />
                      {ch.label}
                    </span>
                  ) : (
                    ch.label
                  )}
                  <span className="block text-[11px] text-subtle">
                    {supp
                      ? `Bloqueado: ${supp.reason === "unsubscribe" ? "descadastrou" : supp.reason === "bounce" ? "e-mail inválido" : supp.reason === "complaint" ? "marcou spam" : "não contatar"}`
                      : missing
                        ? "Sem endereço cadastrado"
                        : st
                          ? `${st.status === "granted" ? "Autorizado" : "Revogado"} (${st.source})`
                          : ch.id === "call_recording"
                            ? "Sem registro"
                            : "Interesse legítimo (sem registro)"}
                  </span>
                </span>
                <Switch
                  checked={granted}
                  disabled={Boolean(supp) || missing || toggle.isPending}
                  onCheckedChange={(c) => toggle.mutate({ channel: ch.id, granted: c })}
                  aria-label={ch.label}
                />
              </li>
            );
          })}
        </ul>
      )}
      {/* exportar e anonimizar são do gestor (conferência 1, R5): o servidor recusa os demais */}
      {isManager && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
          <Button
            size="sm"
            variant="outline"
            onClick={() => exportData.mutate()}
            disabled={exportData.isPending}
          >
            {exportData.isPending ? <Loader2 className="animate-spin" /> : <Download />} Exportar
            dados
          </Button>
          {isManager && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (
                  window.confirm(
                    "Anonimizar apaga nome, e-mail, telefone e conteúdo das conversas desta pessoa. Não tem volta. Continuar?",
                  )
                )
                  anonymize.mutate();
              }}
              disabled={anonymize.isPending}
            >
              <UserX /> Anonimizar (LGPD)
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
