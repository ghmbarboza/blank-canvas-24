// Passos do assistente de configuração que pertencem à gestão:
// - modelo do segmento (funis, campos, respostas rápidas, cadências, agentes e qualidade de uma vez);
// - trazer os dados que o cliente já tem (planilha, RD Station, Kommo, Pipedrive, HubSpot).
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { gestaoKeys, useAppliedTemplates } from "./api";
import { segmentTemplate } from "./templates/segments";

export interface SetupStatus {
  done: boolean;
  summary: string;
  loading: boolean;
}

export function useSegmentTemplateSetupStatus(accountId: string): SetupStatus {
  const q = useAppliedTemplates(accountId);
  const key = q.data?.find((a) => a.area === "segment")?.template_key ?? null;
  const name = key ? (segmentTemplate(key)?.name ?? key) : null;
  return {
    done: Boolean(key),
    summary: name ? `Modelo ${name} aplicado` : "Escolha o modelo do seu segmento",
    loading: q.isPending,
  };
}

export function useImportSetupStatus(accountId: string): SetupStatus {
  const q = useQuery({
    queryKey: [...gestaoKeys.imports(accountId), "setup"],
    queryFn: async () => {
      const [batches, conns] = await Promise.all([
        supabase
          .from("import_batches")
          .select("report, status")
          .eq("account_id", accountId)
          .eq("status", "done")
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("crm_sync_connections")
          .select("provider, status")
          .eq("account_id", accountId)
          .eq("status", "connected"),
      ]);
      if (batches.error) throw batches.error;
      if (conns.error) throw conns.error;
      const contacts = (batches.data ?? []).reduce(
        (s, b) =>
          s + Number((b.report as { contactsCreated?: number } | null)?.contactsCreated ?? 0),
        0,
      );
      return {
        imports: batches.data?.length ?? 0,
        contacts,
        crm: (conns.data ?? []).map((c) => c.provider),
      };
    },
  });
  const d = q.data;
  const crmName = d?.crm.includes("rdstation_crm")
    ? "RD Station"
    : d?.crm.includes("hubspot")
      ? "HubSpot"
      : null;
  const parts = [
    d && d.imports > 0 ? `${d.contacts.toLocaleString("pt-BR")} contatos importados` : null,
    crmName ? `sincronizando com o ${crmName}` : null,
  ].filter(Boolean);
  return {
    done: Boolean(d && (d.imports > 0 || d.crm.length > 0)),
    summary: parts.length
      ? parts.join(" · ")
      : "Importe uma planilha ou conecte o CRM para trazer os dados",
    loading: q.isPending,
  };
}
