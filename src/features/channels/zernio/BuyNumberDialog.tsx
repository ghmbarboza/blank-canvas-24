import { useState } from "react";
import { BrandIcon } from "@/components/brand/BrandIcon";
import { ExternalLink, Loader2, ShieldCheck } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";

import { useKycLink, useNumberCatalog } from "../zernio-api";

interface Props {
  accountId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ANY_AREA = "qualquer";

/**
 * "Comprar número": catálogo ao vivo da Zernio (preço mensal por tipo) e verificação de identidade
 * hospedada. No Brasil todo número exige KYC: nada é cobrado antes de o número ativar.
 */
export function BuyNumberDialog({ accountId, open, onOpenChange }: Props) {
  const catalog = useNumberCatalog(accountId, open);
  const kyc = useKycLink(accountId);
  const [type, setType] = useState("local");
  const [area, setArea] = useState(ANY_AREA);
  const [link, setLink] = useState<string | null>(null);
  const offers = catalog.data?.offers ?? [];
  const picked = offers.find((o) => o.numberType === type) ?? offers[0];

  function start() {
    if (!picked) return;
    kyc.mutate(
      {
        numberType: picked.numberType,
        ...(area !== ANY_AREA && picked.numberType === "local" ? { areaCode: area } : {}),
      },
      {
        onSuccess: (r) => {
          setLink(r.url);
          window.open(r.url, "_blank", "noopener,noreferrer");
        },
        onError: (err) => toast.error(errorMessage(err)),
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setLink(null);
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BrandIcon id="zernio" size={20} />
            Comprar um número brasileiro
          </DialogTitle>
          <DialogDescription>
            O mesmo número recebe ligação e WhatsApp. Preço da Zernio, cobrado por mês na conta
            dela.
          </DialogDescription>
        </DialogHeader>

        {catalog.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 rounded-lg" />
            <Skeleton className="h-16 rounded-lg" />
          </div>
        ) : catalog.isError ? (
          <p className="text-[13px] text-danger">{errorMessage(catalog.error)}</p>
        ) : offers.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">
            A Zernio não está oferecendo números no Brasil agora. Tente mais tarde.
          </p>
        ) : link ? (
          <div className="space-y-3 rounded-lg bg-surface-2 p-4 text-[13px]">
            <p className="flex items-center gap-2 font-medium">
              <ShieldCheck className="size-4" aria-hidden /> Verificação aberta em outra aba
            </p>
            <p className="text-muted-foreground">
              Envie o comprovante de endereço e o cartão CNPJ (ou RG e CPF). A análise leva de 1 a 3
              dias úteis e o número aparece aqui quando ativar. O link vale 7 dias.
            </p>
            <Button variant="outline" size="sm" asChild>
              <a href={link} target="_blank" rel="noopener noreferrer">
                Abrir de novo <ExternalLink aria-hidden />
              </a>
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <RadioGroup
              value={picked?.numberType ?? type}
              onValueChange={setType}
              className="grid gap-2"
              aria-label="Tipo de número"
            >
              {offers.map((o) => (
                <Label
                  key={o.numberType}
                  htmlFor={`offer-${o.numberType}`}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 hover:bg-surface-2",
                    picked?.numberType === o.numberType && "border-primary-line bg-primary-soft",
                    !o.available && "opacity-60",
                  )}
                >
                  <RadioGroupItem
                    id={`offer-${o.numberType}`}
                    value={o.numberType}
                    disabled={!o.available}
                    className="mt-0.5"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="text-[13px] font-medium">{o.label}</span>
                      <span className="font-display text-[15px] font-semibold tabular-nums">
                        US$ {o.monthlyUsd.toFixed(2).replace(".", ",")}/mês
                      </span>
                    </span>
                    <span className="block text-[12px] font-normal text-muted-foreground">
                      {o.note}
                    </span>
                  </span>
                </Label>
              ))}
            </RadioGroup>
            {picked?.numberType === "local" && (catalog.data?.areas.length ?? 0) > 0 && (
              <div className="space-y-1.5">
                <Label htmlFor="buy-area">DDD</Label>
                <Select value={area} onValueChange={setArea}>
                  <SelectTrigger id="buy-area">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ANY_AREA}>Qualquer DDD com estoque</SelectItem>
                    {catalog.data?.areas.map((a) => (
                      <SelectItem key={a.ndc} value={a.ndc}>
                        {a.ndc} · {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <p className="text-[12px] text-subtle">
              Preço ao vivo da Zernio. No Brasil, todo número precisa identificar a empresa dona: a
              verificação é feita numa página da Zernio e nada é cobrado antes de o número ativar.
            </p>
          </div>
        )}

        <DialogFooter>
          {!link && offers.length > 0 && (
            <Button onClick={start} disabled={kyc.isPending || !picked?.available}>
              {kyc.isPending && <Loader2 className="animate-spin" aria-hidden />}
              Verificar identidade e pedir
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
