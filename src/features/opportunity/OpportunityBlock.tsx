import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Loader2, Plus, Bot, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { BILLING_LABEL, useProducts } from "@/features/catalog/api";
import type { Tables } from "@/integrations/supabase/types";
import { errorMessage } from "@/lib/functions";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

import {
  useContactInterests,
  useContactOpportunity,
  useRemoveInterest,
  useSetInterest,
} from "./api";

type ContactLite = Pick<Tables<"contacts">, "id" | "score" | "temperature" | "ai_intent">;

const LEVELS = [
  { value: "85", label: "Alto: pediu esse item" },
  { value: "60", label: "Médio: sinal claro" },
  { value: "35", label: "Baixo: mencionou" },
];

// Bloco de pós-venda no contato: em que etapa da jornada o cliente está e o que ele pode comprar
// de novo. A trilha de venda (qualificar, estimar oportunidade, upsell) ficou fora da composição;
// JourneySteps, ItemRow e DealItemsEditor continuam no repositório para quem religar.
export function OpportunityBlock({
  accountId,
  contact,
}: {
  accountId: string;
  contact: ContactLite;
}) {
  const interests = useContactInterests(accountId, contact.id);
  const opp = useContactOpportunity(accountId, contact.id);
  const products = useProducts(accountId);
  const removeInterest = useRemoveInterest(accountId);
  const catalogEmpty = !products.isLoading && (products.data ?? []).length === 0;
  const deal = opp.data?.deal;

  return (
    <div className="space-y-5">
      {/* Etapa da jornada */}
      <section aria-labelledby={`opp-${contact.id}`}>
        <h4 id={`opp-${contact.id}`} className="mb-2 text-[12px] font-semibold">
          Etapa da jornada
        </h4>
        {opp.isLoading ? (
          <Skeleton className="h-12 w-full rounded-xl" />
        ) : opp.isError ? (
          <p className="text-[12px] text-danger">Não deu para carregar a etapa deste cliente.</p>
        ) : deal ? (
          <Link
            to="/crm"
            search={{ negocio: deal.id }}
            className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-3 py-2.5 text-[13px] transition-colors hover:border-border-strong focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <span className="min-w-0">
              <span className="block truncate font-medium text-foreground">
                {deal.stage?.name ?? "Na carteira"}
              </span>
              {Number(deal.value) > 0 && (
                <span className="block text-[12px] text-muted-foreground tabular-nums">
                  Valor do contrato: {formatMoney(deal.value)}
                </span>
              )}
            </span>
            <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-medium text-muted-foreground">
              Abrir na carteira <ArrowUpRight className="size-3" aria-hidden />
            </span>
          </Link>
        ) : (
          <p className="rounded-xl border border-dashed border-border px-3 py-3 text-[12px] text-muted-foreground">
            Este contato ainda não está na carteira. Quando ele comprar, coloque na{" "}
            <Link to="/crm" className="font-medium text-foreground underline underline-offset-2">
              Carteira
            </Link>{" "}
            para acompanhar a jornada.
          </p>
        )}
      </section>

      {/* Recompra */}
      <section aria-labelledby={`int-${contact.id}`}>
        <div className="mb-2 flex items-center justify-between">
          <h4 id={`int-${contact.id}`} className="text-[12px] font-semibold">
            Pode comprar de novo
          </h4>
          {!catalogEmpty && (
            <AddInterest
              accountId={accountId}
              contactId={contact.id}
              taken={(interests.data ?? []).map((i) => i.product_id)}
            />
          )}
        </div>
        {interests.isLoading ? (
          <Skeleton className="h-10 w-full rounded-xl" />
        ) : catalogEmpty ? (
          <p className="rounded-xl border border-dashed border-border px-3 py-3 text-[12px] text-muted-foreground">
            Cadastre seus produtos e serviços em{" "}
            <Link
              to="/ajustes"
              search={{ aba: "catalogo" }}
              className="font-medium text-foreground underline underline-offset-2"
            >
              Ajustes › Catálogo
            </Link>{" "}
            para a IA notar quando o cliente falar de um deles.
          </p>
        ) : (interests.data ?? []).length === 0 ? (
          <p className="text-[12px] text-muted-foreground">
            Nenhum item citado ainda. A IA marca quando o cliente falar de um produto, ou adicione à
            mão.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {(interests.data ?? []).map((i) => (
              <li
                key={i.id}
                className="group inline-flex items-center gap-1.5 rounded-full border border-border bg-surface py-1 pr-1 pl-2.5 text-[12px] shadow-xs"
                title={i.evidence ?? undefined}
              >
                {i.source === "ai" && (
                  <Bot className="size-3 text-muted-foreground" aria-label="Identificado pela IA" />
                )}
                <span className="font-medium">{i.products?.name ?? "Item"}</span>
                <span
                  className="flex h-1 w-8 overflow-hidden rounded-full bg-surface-3"
                  aria-label={`Confiança ${i.confidence}%`}
                >
                  <span className="h-full bg-primary" style={{ width: `${i.confidence}%` }} />
                </span>
                <button
                  type="button"
                  aria-label={`Remover ${i.products?.name ?? "item"}`}
                  onClick={() => removeInterest.mutate(i.id)}
                  className="rounded-full p-0.5 text-subtle hover:bg-surface-2 hover:text-foreground"
                >
                  <X className="size-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function AddInterest({
  accountId,
  contactId,
  taken,
}: {
  accountId: string;
  contactId: string;
  taken: string[];
}) {
  const products = useProducts(accountId);
  const setInterest = useSetInterest(accountId, contactId);
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState("");
  const [level, setLevel] = useState("85");
  const options = (products.data ?? []).filter((p) => p.active && !taken.includes(p.id));

  async function save() {
    if (!productId) return;
    try {
      await setInterest.mutateAsync({ productId, confidence: Number(level) });
      setOpen(false);
      setProductId("");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground",
            options.length === 0 && "pointer-events-none opacity-40",
          )}
        >
          <Plus className="size-3" /> Adicionar
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3">
        <p className="text-[13px] font-semibold">O que o cliente pode comprar de novo?</p>
        <Select value={productId} onValueChange={setProductId}>
          <SelectTrigger className="h-9" aria-label="Item do catálogo">
            <SelectValue placeholder="Item do catálogo" />
          </SelectTrigger>
          <SelectContent>
            {options.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name} · {formatMoney(p.price)} {BILLING_LABEL[p.billing]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={level} onValueChange={setLevel}>
          <SelectTrigger className="h-9" aria-label="Força do interesse">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LEVELS.map((l) => (
              <SelectItem key={l.value} value={l.value}>
                {l.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          className="w-full"
          onClick={() => void save()}
          disabled={!productId || setInterest.isPending}
        >
          {setInterest.isPending && <Loader2 className="animate-spin" />}
          Registrar
        </Button>
      </PopoverContent>
    </Popover>
  );
}
