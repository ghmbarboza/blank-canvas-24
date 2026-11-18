import { useState, type FormEvent } from "react";
import { BrandIcon } from "@/components/brand/BrandIcon";
import { CheckCircle2, CircleDashed, ExternalLink, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/lib/functions";
import { formatPhone } from "@/lib/format";

import { usePortCheck, type PortCheckResult } from "../zernio-api";

interface Props {
  accountId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Sempre pedidos pela operadora, além do que a Zernio lista por país.
const ALWAYS = [
  "Carta de autorização (LOA) assinada pelo titular da linha",
  "Fatura recente da operadora atual",
  "Dados da conta na operadora (titular e número da conta)",
];

/** "Trazer meu número": confere se o número pode vir e lista os documentos. Não abre pedido. */
export function PortNumberDialog({ accountId, open, onOpenChange }: Props) {
  const check = usePortCheck(accountId);
  const [phone, setPhone] = useState("");
  const [result, setResult] = useState<PortCheckResult | null>(null);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    check.mutate(phone, {
      onSuccess: setResult,
      onError: (err) => toast.error(errorMessage(err)),
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setResult(null);
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BrandIcon id="zernio" size={20} />
            Trazer meu número
          </DialogTitle>
          <DialogDescription>
            O número que seus clientes já conhecem passa a tocar aqui e no WhatsApp. A portabilidade
            é gratuita; o número paga a mensalidade normal quando ativar.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="port-phone">Número com DDD</Label>
            <Input
              id="port-phone"
              inputMode="tel"
              placeholder="(11) 3000-0000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
          </div>
          <Button type="submit" disabled={check.isPending || phone.replace(/\D/g, "").length < 10}>
            {check.isPending && <Loader2 className="animate-spin" aria-hidden />}
            Verificar
          </Button>
        </form>

        {result && !result.portable && (
          <div
            className="flex gap-2 rounded-lg border border-hot-line bg-hot-soft p-3 text-[13px] text-hot-fg"
            role="status"
          >
            <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              {formatPhone(result.phone)} não pode vir agora: {result.reason}. Para o call center, a
              Zadarma também faz portabilidade.
            </span>
          </div>
        )}

        {result?.portable && (
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-[13px] font-medium">
              <CheckCircle2 className="size-4 text-foreground" aria-hidden />
              {formatPhone(result.phone)} pode vir
              {result.carrier ? ` da ${result.carrier}` : ""}.
            </p>
            {result.supported === false ? (
              <p className="text-[13px] text-muted-foreground">
                Este tipo de número precisa de atendimento da Zernio para portar. Fale com o suporte
                dela pelo painel.
              </p>
            ) : (
              <div className="rounded-lg bg-surface-2 p-3">
                <p className="eyebrow mb-2">Separe estes documentos</p>
                <ul className="space-y-1.5 text-[13px]">
                  {[...ALWAYS, ...result.requirements.map((r) => r.label)].map((label) => (
                    <li key={label} className="flex gap-2">
                      <CircleDashed
                        className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                        aria-hidden
                      />
                      {label}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-[12px] text-muted-foreground">
              Com os documentos em PDF, envie o pedido no painel da Zernio (Números ›
              Portabilidade). A Zernio confirma a data da virada com a operadora; até lá o número
              segue funcionando onde está.
            </p>
            <Button variant="outline" size="sm" asChild>
              <a href="https://zernio.com/dashboard" target="_blank" rel="noopener noreferrer">
                Abrir o painel da Zernio <ExternalLink aria-hidden />
              </a>
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
