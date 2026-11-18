import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";

import { SettingsCard } from "@/features/settings/SettingsCard";
import { useTeamMembers } from "@/features/contacts/api";
import { supabase } from "@/integrations/supabase/client";
import { useAccount } from "@/lib/account";
import { formatDateTime } from "@/lib/format";

const ACTION_LABEL: Record<string, string> = {
  "integration.saved": "Integração salva",
  "api_key.created": "Chave de API criada",
  "webhook.create": "Webhook criado",
  "webhook.rotate": "Segredo de webhook trocado",
  "recording.played": "Gravação ouvida",
  "conversation.assigned": "Conversa atribuída",
  "conversation.unassigned": "Conversa sem responsável",
  "conversation.closed": "Conversa resolvida",
  "conversation.reopened": "Conversa reaberta",
  "conversation.transfer": "Conversa transferida para fila",
  "recording.downloaded": "Gravação baixada",
  "contact.exported": "Dados de contato exportados (LGPD)",
  "contact.anonymized": "Contato anonimizado (LGPD)",
  "campaign.sent": "Campanha disparada",
  "retention.run": "Limpeza automática de dados antigos",
  "retention.purged": "Dados antigos apagados pela retenção",
  "contact.upsert": "Contato salvo pela API",
  "import.done": "Importação concluída",
  "note.create": "Nota criada",
  "telephony.extension_created": "Ramal criado",
  "voice_agent.published": "Agente de voz publicado",
  "voice.call_requested": "Ligação da IA pedida",
};

/** Ação sem nome conhecido: nunca o código cru, e sim uma frase neutra. */
function actionLabel(action: string): string {
  return ACTION_LABEL[action] ?? "Outra ação do sistema";
}

export function AuditTab() {
  const { current, isAdmin } = useAccount();
  const accountId = current!.accountId;
  const team = useTeamMembers(accountId);
  const names = new Map((team.data ?? []).map((m) => [m.userId, m.name]));
  const log = useQuery({
    queryKey: ["audit", accountId],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_log")
        .select("*")
        .eq("account_id", accountId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });
  return (
    <SettingsCard
      title="Auditoria"
      description="Quem fez o quê nas ações sensíveis: integrações, chaves, gravações, exportações e campanhas."
      readOnlyNote={isAdmin ? undefined : "Só administradores veem a auditoria."}
    >
      <ul className="divide-y divide-border rounded-xl border border-border">
        {(log.data ?? []).length === 0 && (
          <li className="px-4 py-6 text-center text-[12px] text-muted-foreground">
            Nenhum registro ainda.
          </li>
        )}
        {(log.data ?? []).map((r) => (
          <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
            <History className="size-3.5 text-subtle" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px]">{actionLabel(r.action)}</p>
              <p className="truncate text-[11px] text-subtle">
                {r.actor_id ? (names.get(r.actor_id) ?? "Usuário") : "Sistema"} ·{" "}
                {formatDateTime(r.created_at)}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </SettingsCard>
  );
}
