import { useEffect, useState } from "react";
import { Copy, ExternalLink, Loader2 } from "lucide-react";
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
import type { DealRow } from "@/features/crm/types";
import { moneyInputValue, parseMoneyInput } from "@/features/crm/money";
import { isValidCnpj } from "@/features/companies/cnpj";
import { supabase } from "@/integrations/supabase/client";
import { formatMoney } from "@/lib/format";
import { errorMessage } from "@/lib/functions";

import { useCreateCharge, type ChargeResult } from "./api";
import { isValidCpf } from "./totals";

// Cobrança direta do negócio pelo Asaas (Pix, boleto, cartão), avulsa ou mensal.
export function ChargeDialog({
  accountId,
  deal,
  open,
  onOpenChange,
}: {
  accountId: string;
  deal: DealRow;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const charge = useCreateCharge(accountId, deal.id);
  const [billingType, setBillingType] = useState("PIX");
  const [amount, setAmount] = useState("");
  const [recurring, setRecurring] = useState<"none" | "monthly">("none");
  const [name, setName] = useState("");
  const [document, setDocument] = useState("");
  const [email, setEmail] = useState("");
  const [dueDays, setDueDays] = useState("3");
  const [result, setResult] = useState<ChargeResult[] | null>(null);

  useEffect(() => {
    if (!open) return;
    setResult(null);
    setAmount(moneyInputValue(Number(deal.value)));
    if (deal.contact_id)
      void supabase
        .from("contacts")
        .select("name, email")
        .eq("id", deal.contact_id)
        .maybeSingle()
        .then(({ data }) => {
          setName(data?.name ?? "");
          setEmail(data?.email ?? "");
        });
  }, [open, deal]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = parseMoneyInput(amount);
    const doc = document.replace(/\D/g, "");
    if (!value || value <= 0) {
      toast.error("Informe o valor");
      return;
    }
    if (!(doc.length === 11 ? isValidCpf(doc) : doc.length === 14 && isValidCnpj(doc))) {
      toast.error("CPF ou CNPJ inválido");
      return;
    }
    try {
      const r = await charge.mutateAsync({
        billingType,
        amount: value,
        recurring,
        name,
        document: doc,
        ...(email ? { email } : {}),
        dueDays: Number(dueDays),
      });
      setResult(r.charges);
      toast.success("Cobrança criada no Asaas");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {result ? (
          <div>
            <DialogHeader>
              <DialogTitle>Cobrança pronta</DialogTitle>
              <DialogDescription>
                Mande o link ou o Pix copia-e-cola. O negócio vira ganho sozinho quando o pagamento
                cair.
              </DialogDescription>
            </DialogHeader>
            <ul className="mt-4 space-y-3">
              {result.map((c) => (
                <li key={c.id} className="rounded-2xl border border-border p-3">
                  <p className="text-[13px] font-semibold">
                    {formatMoney(c.amount)}
                    {c.kind === "subscription" ? " / mês" : ""}
                  </p>
                  {c.pix_image && (
                    <img
                      src={`data:image/png;base64,${c.pix_image}`}
                      alt="QR code Pix"
                      className="mx-auto my-3 size-44"
                    />
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {c.pix_payload && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          void navigator.clipboard
                            .writeText(c.pix_payload!)
                            .then(() => toast.success("Pix copiado"))
                        }
                      >
                        <Copy /> Pix copia-e-cola
                      </Button>
                    )}
                    {c.invoice_url && (
                      <Button size="sm" variant="outline" asChild>
                        <a href={c.invoice_url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink /> Abrir fatura
                        </a>
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <DialogFooter className="mt-6">
              <Button onClick={() => onOpenChange(false)}>Pronto</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={(e) => void submit(e)}>
            <DialogHeader>
              <DialogTitle>Cobrar pelo Asaas</DialogTitle>
              <DialogDescription>
                Gera a fatura no nome do cliente. CPF ou CNPJ é obrigatório para emitir.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="ch-amount">Valor (R$)</Label>
                <Input
                  id="ch-amount"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Forma</Label>
                <Select value={billingType} onValueChange={setBillingType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PIX">Pix</SelectItem>
                    <SelectItem value="BOLETO">Boleto</SelectItem>
                    <SelectItem value="CREDIT_CARD">Cartão de crédito</SelectItem>
                    <SelectItem value="UNDEFINED">Cliente escolhe</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Recorrência</Label>
                <Select
                  value={recurring}
                  onValueChange={(v) => setRecurring(v as "none" | "monthly")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Cobrança única</SelectItem>
                    <SelectItem value="monthly">Mensal (assinatura)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Vencimento</Label>
                <Select value={dueDays} onValueChange={setDueDays}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["1", "3", "5", "7", "10", "15", "30"].map((d) => (
                      <SelectItem key={d} value={d}>
                        Em {d} dia{d === "1" ? "" : "s"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="ch-name">Nome ou razão social</Label>
                <Input id="ch-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ch-doc">CPF ou CNPJ</Label>
                <Input
                  id="ch-doc"
                  inputMode="numeric"
                  value={document}
                  onChange={(e) => setDocument(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ch-email">E-mail (recebe a fatura)</Label>
                <Input
                  id="ch-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter className="mt-6">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={charge.isPending}>
                {charge.isPending && <Loader2 className="animate-spin" />} Gerar cobrança
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
