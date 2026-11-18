import { History } from "lucide-react";

import { formatDateTime, formatNumber } from "@/lib/format";
import { Panel } from "@/features/reports/ui";

import { useImportBatches } from "../api";
import { SOURCE_LABEL, type ImportSource } from "../import/mapping";
import { ImportWizard } from "./ImportWizard";
import { countLabel } from "@/lib/plural";

const STATUS: Record<string, string> = {
  running: "Em andamento",
  done: "Concluída",
  failed: "Parou no meio",
};

export function ImportTab({ accountId }: { accountId: string }) {
  const batches = useImportBatches(accountId);
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
      <ImportWizard accountId={accountId} />
      <Panel
        title="Importações anteriores"
        aside={<History className="size-4 text-subtle" aria-hidden />}
      >
        {batches.isPending ? (
          <p className="text-[13px] text-muted-foreground">Carregando…</p>
        ) : (batches.data ?? []).length === 0 ? (
          <p className="text-[13px] text-muted-foreground">Nenhuma importação ainda.</p>
        ) : (
          <ul className="space-y-3 text-[13px]">
            {(batches.data ?? []).map((b) => {
              const r = (b.report ?? {}) as {
                contactsCreated?: number;
                dealsCreated?: number;
                errors?: unknown[];
              };
              return (
                <li key={b.id}>
                  <p className="truncate font-medium">
                    {b.file_name ?? SOURCE_LABEL[b.source as ImportSource]}
                  </p>
                  <p className="text-[12px] text-muted-foreground">
                    {formatDateTime(b.created_at)} · {STATUS[b.status] ?? b.status} ·{" "}
                    {formatNumber(r.contactsCreated ?? 0)} contatos,{" "}
                    {countLabel(r.dealsCreated, "negócio")}
                    {r.errors?.length ? ` · ${r.errors.length} com erro` : ""}
                  </p>
                  {b.error && <p className="text-[12px] text-danger">{b.error}</p>}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
