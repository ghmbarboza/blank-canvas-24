import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { formatMoney } from "@/lib/format";
import { errorMessage } from "@/lib/functions";

import { useCreateProposal, type Proposal } from "./api";
import { proposalTotals, type ProposalItem } from "./totals";

const DEFAULT_CONDITIONS =
  "Pagamento à vista por Pix ou boleto, ou parcelado no cartão. Início em até 5 dias úteis após o aceite.";

interface Props {
  dealId: string;
  dealTitle: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated?: (p: Proposal | null) => void;
}

// Gera a proposta congelando os itens aceitos do negócio (ou o valor, se não houver itens).
export function ProposalDialog({ dealId, dealTitle, open, onOpenChange, onCreated }: Props) {
  const create = useCreateProposal(dealId);
  const [title, setTitle] = useState(dealTitle);
  const [validDays, setValidDays] = useState("15");
  const [conditions, setConditions] = useState(DEFAULT_CONDITIONS);
  const [notes, setNotes] = useState("");
  const preview = useQuery({
    queryKey: ["proposal-preview", dealId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("proposal_items_from_deal", { _deal: dealId });
      if (error) throw error;
      return (data ?? []) as unknown as ProposalItem[];
    },
  });
  useEffect(() => {
    if (open) {
      setTitle(dealTitle);
      setNotes("");
    }
  }, [open, dealTitle]);
  const items = useMemo(() => preview.data ?? [], [preview.data]);
  const totals = useMemo(() => proposalTotals(items), [items]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const id = await create.mutateAsync({
        title,
        validDays: Number(validDays),
        conditions,
        notes,
      });
      const { data } = await supabase.from("proposals").select("*").eq("id", id).maybeSingle();
      toast.success("Proposta criada");
      onOpenChange(false);
      onCreated?.(data ?? null);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <form onSubmit={(e) => void submit(e)}>
          <DialogHeader>
            <DialogTitle>Gerar proposta</DialogTitle>
            <DialogDescription>
              Os itens aceitos do negócio entram como estão agora. Mudou algo depois? Gere uma nova
              versão.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="pr-title">Título</Label>
              <Input
                id="pr-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={160}
              />
            </div>
            <div className="rounded-2xl border border-border bg-surface-2/40 p-3">
              {preview.isPending ? (
                <Loader2 className="mx-auto size-4 animate-spin text-subtle" />
              ) : items.length === 0 ? (
                <p className="text-[12px] text-muted-foreground">
                  O negócio não tem itens aceitos nem valor. Adicione itens antes.
                </p>
              ) : (
                <>
                  <ul className="space-y-1 text-[12px]">
                    {items.map((i, idx) => (
                      <li key={idx} className="flex justify-between gap-3">
                        <span className="truncate">
                          {Number(i.quantity) !== 1 && `${Number(i.quantity)} × `}
                          {i.name}
                          {i.billing === "monthly" && (
                            <span className="text-subtle"> · mensal</span>
                          )}
                          {i.billing === "yearly" && <span className="text-subtle"> · anual</span>}
                        </span>
                        <span className="tabular-nums">{formatMoney(i.line_period)}</span>
                      </li>
                    ))}
                  </ul>
                  <dl className="mt-3 grid gap-1 border-t border-border pt-2 text-[12px]">
                    {totals.oneTime > 0 && (
                      <Row label="Pagamento único" value={formatMoney(totals.oneTime)} />
                    )}
                    {totals.monthly > 0 && (
                      <Row label="Mensalidade" value={`${formatMoney(totals.monthly)} / mês`} />
                    )}
                    {totals.yearly > 0 && (
                      <Row label="Anuidade" value={`${formatMoney(totals.yearly)} / ano`} />
                    )}
                    <Row
                      label="Valor do contrato no 1º ano"
                      value={formatMoney(totals.total)}
                      strong
                    />
                  </dl>
                </>
              )}
            </div>
            <div className="grid gap-1.5 sm:w-48">
              <Label>Validade</Label>
              <Select value={validDays} onValueChange={setValidDays}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["7", "15", "30", "45", "60"].map((d) => (
                    <SelectItem key={d} value={d}>
                      {d} dias
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pr-cond">Condições (o cliente vê)</Label>
              <Textarea
                id="pr-cond"
                rows={3}
                value={conditions}
                onChange={(e) => setConditions(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pr-notes">Observações para o cliente (opcional)</Label>
              <Textarea
                id="pr-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="mt-6">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={create.isPending || items.length === 0}>
              {create.isPending && <Loader2 className="animate-spin" />} Criar proposta
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-subtle">{label}</dt>
      <dd className={strong ? "font-semibold tabular-nums" : "tabular-nums"}>{value}</dd>
    </div>
  );
}
