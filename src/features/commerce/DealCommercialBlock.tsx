import { EDITION } from "@/lib/edition";
import { useState } from "react";
import {
  CheckCircle2,
  Copy,
  Eye,
  FileSignature,
  FileText,
  Loader2,
  Printer,
  QrCode,
  RefreshCw,
  Send,
  Trash2,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useIntegration } from "@/features/integrations/api";
import type { DealRow } from "@/features/crm/types";
import { formatMoney, formatRelative } from "@/lib/format";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";

import {
  BILLING_TYPE_LABEL,
  PAYMENT_STATUS,
  PROPOSAL_STATUS,
  proposalLink,
  useDealCommerce,
  useDeleteProposal,
  useRefreshProposal,
  useSendForSignature,
  useSetForecastCategory,
  type Proposal,
} from "./api";
import { ChargeDialog } from "./ChargeDialog";
import { ProposalDialog } from "./ProposalDialog";
import { SendProposalDialog } from "./SendProposalDialog";

const FORECAST: { id: string; label: string; hint: string }[] = [
  { id: "pipeline", label: "Pipeline", hint: "Ainda incerto" },
  { id: "best_case", label: "Melhor cenário", hint: "Pode fechar no período" },
  { id: "commit", label: "Compromisso", hint: "Vai fechar no período" },
  { id: "omitted", label: "Fora do forecast", hint: "Não contar" },
];

function copy(text: string, msg = "Link copiado") {
  void navigator.clipboard.writeText(text).then(() => toast.success(msg));
}

// Bloco comercial dentro do negócio: forecast do vendedor, propostas (com aceite online) e cobranças.
const SIGNATURE_STATUS: Record<string, { label: string; tone: string }> = {
  pending: { label: "Aguardando assinatura", tone: "bg-primary-soft text-foreground" },
  signed: { label: "Assinada", tone: "bg-primary-soft text-foreground" },
  refused: { label: "Assinatura recusada", tone: "bg-danger/10 text-danger" },
};

export function DealCommercialBlock({ accountId, deal }: { accountId: string; deal: DealRow }) {
  const commerce = useDealCommerce(deal.id);
  const asaas = useIntegration(accountId, "asaas");
  const zapsign = useIntegration(accountId, "zapsign");
  const sign = useSendForSignature(accountId, deal.id);
  const canSign = zapsign.data?.status === "connected";
  const refresh = useRefreshProposal(deal.id);
  const remove = useDeleteProposal(deal.id);
  const setCategory = useSetForecastCategory(accountId);
  const [creating, setCreating] = useState(false);
  const [sending, setSending] = useState<Proposal | null>(null);
  const [charging, setCharging] = useState(false);
  const custom = (deal.custom ?? {}) as Record<string, unknown>;
  const category =
    typeof custom["forecast_category"] === "string"
      ? (custom["forecast_category"] as string)
      : "pipeline";
  const proposals = commerce.data?.proposals ?? [];
  const payments = commerce.data?.payments ?? [];
  const canCharge = asaas.data?.status === "connected" || asaas.data?.status === "pending";

  return (
    <section aria-labelledby="deal-commercial" className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <p id="deal-commercial" className="eyebrow">
          {EDITION.allIntegrations ? "Proposta e cobrança" : "Proposta"}
        </p>
        <div className="flex gap-2">
          {canCharge && (
            <Button type="button" size="sm" variant="outline" onClick={() => setCharging(true)}>
              <Wallet /> Cobrar
            </Button>
          )}
          <Button type="button" size="sm" onClick={() => setCreating(true)}>
            <FileSignature /> {proposals.length ? "Nova versão" : "Gerar proposta"}
          </Button>
        </div>
      </div>

      {deal.status === "open" && (
        <div className="grid gap-1.5">
          <Label htmlFor="deal-forecast" className="text-[12px] text-muted-foreground">
            Previsão do vendedor (entra no forecast)
          </Label>
          <Select
            value={category}
            onValueChange={(v) =>
              setCategory.mutate(
                { dealId: deal.id, category: v, custom },
                {
                  onSuccess: () => toast.success("Previsão atualizada"),
                  onError: (e) => toast.error(errorMessage(e)),
                },
              )
            }
          >
            <SelectTrigger id="deal-forecast" className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FORECAST.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.label} · <span className="text-subtle">{f.hint}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {commerce.isPending ? (
        <Loader2 className="mx-auto size-4 animate-spin text-subtle" />
      ) : proposals.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-3 py-3 text-[12px] text-muted-foreground">
          {EDITION.allIntegrations
            ? "Gere a proposta a partir dos itens aceitos do negócio. O cliente abre pelo link, aceita online e, com o Asaas conectado, paga por Pix, boleto ou cartão."
            : "Gere a proposta a partir dos itens aceitos do negócio. O cliente abre pelo link e aceita online."}
        </p>
      ) : (
        <ul className="space-y-2">
          {proposals.map((p) => {
            const st = PROPOSAL_STATUS[p.status] ?? PROPOSAL_STATUS["draft"]!;
            const link = proposalLink(p.token);
            const open = ["draft", "sent", "viewed"].includes(p.status);
            return (
              <li
                key={p.id}
                className={cn(
                  "rounded-2xl border border-border bg-surface p-3",
                  !open && p.status !== "accepted" && "opacity-70",
                )}
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl bg-primary-soft text-foreground">
                    <FileText className="size-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold">
                      Nº {p.number}
                      {p.version > 1 && <span className="text-subtle"> · v{p.version}</span>} ·{" "}
                      {p.title}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-subtle">
                      <span
                        className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", st.tone)}
                      >
                        {st.label}
                      </span>
                      <span className="tabular-nums">{formatMoney(p.total)}</span>
                      {p.view_count > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <Eye className="size-3" /> {p.view_count}× ·{" "}
                          {formatRelative(p.last_viewed_at)}
                        </span>
                      )}
                      {p.accepted_at && (
                        <span className="inline-flex items-center gap-1 text-foreground">
                          <CheckCircle2 className="size-3" /> {p.accepted_name}
                        </span>
                      )}
                      {p.signature_status && (
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium",
                            SIGNATURE_STATUS[p.signature_status]?.tone,
                          )}
                        >
                          <FileSignature className="size-3" />{" "}
                          {SIGNATURE_STATUS[p.signature_status]?.label}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {open && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8"
                      onClick={() => setSending(p)}
                    >
                      <Send /> {p.status === "draft" ? "Enviar" : "Reenviar"}
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8"
                    onClick={() => copy(link)}
                  >
                    <Copy /> Link
                  </Button>
                  <Button type="button" size="sm" variant="ghost" className="h-8" asChild>
                    <a
                      href={`/proposta/${p.token}/imprimir`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Printer /> PDF
                    </a>
                  </Button>
                  {canSign &&
                    ["sent", "viewed", "accepted"].includes(p.status) &&
                    (!p.signature_status || p.signature_status === "refused") && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8"
                        disabled={sign.isPending}
                        onClick={() =>
                          sign.mutate(p.id, {
                            onSuccess: (r) => {
                              if (r.signUrl) copy(r.signUrl, "Enviado. Link de assinatura copiado");
                              else toast.success("Enviado para assinatura");
                            },
                            onError: (e) => toast.error(errorMessage(e)),
                          })
                        }
                      >
                        <FileSignature /> Enviar para assinatura
                      </Button>
                    )}
                  {p.signature_status === "pending" && p.signature_url && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8"
                      onClick={() => copy(p.signature_url!, "Link de assinatura copiado")}
                    >
                      <Copy /> Link da assinatura
                    </Button>
                  )}
                  {p.signed_file_url && (
                    <Button type="button" size="sm" variant="ghost" className="h-8" asChild>
                      <a href={p.signed_file_url} target="_blank" rel="noopener noreferrer">
                        <FileSignature /> PDF assinado
                      </a>
                    </Button>
                  )}
                  {p.status === "draft" && (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8"
                        disabled={refresh.isPending}
                        onClick={() =>
                          refresh.mutate(p.id, {
                            onSuccess: () => toast.success("Itens atualizados pelo negócio"),
                            onError: (e) => toast.error(errorMessage(e)),
                          })
                        }
                      >
                        <RefreshCw /> Atualizar itens
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8 text-subtle hover:text-danger"
                        aria-label="Excluir rascunho"
                        onClick={() =>
                          remove.mutate(p.id, { onError: (e) => toast.error(errorMessage(e)) })
                        }
                      >
                        <Trash2 />
                      </Button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {payments.length > 0 && (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">
          {payments.map((y) => (
            <li key={y.id} className="flex items-center gap-3 px-3 py-2.5 text-[12px]">
              <QrCode className="size-4 shrink-0 text-subtle" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {formatMoney(y.amount)}
                  {y.cycle === "MONTHLY" ? " / mês" : y.cycle === "YEARLY" ? " / ano" : ""} ·{" "}
                  {BILLING_TYPE_LABEL[y.billing_type]}
                </p>
                <p className="truncate text-subtle">
                  {PAYMENT_STATUS[y.status] ?? y.status}
                  {y.due_date &&
                    ` · vence ${new Date(`${y.due_date}T12:00:00`).toLocaleDateString("pt-BR")}`}
                </p>
              </div>
              {y.pix_payload && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7"
                  onClick={() => copy(y.pix_payload!, "Pix copia-e-cola copiado")}
                >
                  Pix
                </Button>
              )}
              {y.invoice_url && (
                <Button type="button" size="sm" variant="ghost" className="h-7" asChild>
                  <a href={y.invoice_url} target="_blank" rel="noopener noreferrer">
                    Fatura
                  </a>
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <ProposalDialog
        dealId={deal.id}
        dealTitle={deal.title}
        open={creating}
        onOpenChange={setCreating}
        onCreated={(p) => p && setSending(p)}
      />
      <SendProposalDialog
        accountId={accountId}
        dealId={deal.id}
        proposal={sending}
        onClose={() => setSending(null)}
      />
      <ChargeDialog accountId={accountId} deal={deal} open={charging} onOpenChange={setCharging} />
    </section>
  );
}
