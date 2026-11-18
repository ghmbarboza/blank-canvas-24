import { formatRelative } from "@/lib/format";
import { useRecentHistory } from "../api";
import { PanelSection } from "./PanelSection";
import { Skeleton } from "@/components/ui/skeleton";

const KIND_LABEL: Record<string, string> = {
  email: "E-mail",
  call: "Ligação",
  meeting: "Reunião",
  event: "Agenda",
  activity: "Atividade",
  deal: "Negócio",
  proposal: "Proposta",
  payment: "Pagamento",
  classification: "IA",
  consent: "Privacidade",
  ticket: "Chamado",
  form: "Formulário",
  automation: "Automação",
};

// Linha do tempo curta: os últimos acontecimentos do contato fora desta conversa.
export function RecentHistory({ accountId, contactId }: { accountId: string; contactId: string }) {
  const history = useRecentHistory(accountId, contactId);
  return (
    <PanelSection title="Histórico recente">
      {history.isLoading ? (
        <Skeleton className="h-20 w-full rounded-xl" />
      ) : history.isError ? (
        <p className="text-[13px] text-danger">Não deu para carregar o histórico.</p>
      ) : !history.data?.length ? (
        <p className="text-[13px] text-muted-foreground">
          Nada além das mensagens ainda. Negócios, reuniões e chamados aparecem aqui.
        </p>
      ) : (
        <ol className="relative ml-1 space-y-4 border-l border-border pl-4">
          {history.data.map((r, i) => (
            <li key={`${r.kind}-${r.ref_id}`} className="relative">
              <span
                aria-hidden
                className={`absolute top-1.5 -left-[21px] size-2 rounded-full ring-4 ring-surface ${i === 0 ? "bg-primary" : "bg-cold"}`}
              />
              <p className="truncate text-[13px] font-medium text-foreground">{r.title}</p>
              <p className="text-[11px] text-subtle">
                {KIND_LABEL[r.kind] ?? "Registro"} · {formatRelative(r.at)}
              </p>
            </li>
          ))}
        </ol>
      )}
    </PanelSection>
  );
}
