import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Loader2, Plus, Bot, Wand2, X } from "lucide-react";
import { toast } from "sonner";

import { TempChip } from "@/components/common/TempChip";
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
  useBuildOpportunity,
  useContactInterests,
  useContactOpportunity,
  useContactReplied,
  useRemoveInterest,
  useSetInterest,
  useUpdateDealItem,
} from "./api";
import { ItemRow } from "./ItemRow";
import { JourneySteps } from "./JourneySteps";
import { journey, totals, type ItemStatus } from "./lib";

type ContactLite = Pick<Tables<"contacts">, "id" | "score" | "temperature" | "ai_intent">;

const LEVELS = [
  { value: "85", label: "Alto: pediu esse item" },
  { value: "60", label: "Médio: sinal claro" },
  { value: "35", label: "Baixo: mencionou" },
];

// Bloco do fluxo comercial no contato: etapa atual, interesse no catálogo e a oportunidade estimada.
export function OpportunityBlock({
  accountId,
  contact,
}: {
  accountId: string;
  contact: ContactLite;
}) {
  const replied = useContactReplied(accountId, contact.id);
  const interests = useContactInterests(accountId, contact.id);
  const opp = useContactOpportunity(accountId, contact.id);
  const products = useProducts(accountId);
  const build = useBuildOpportunity(accountId);
  const updateItem = useUpdateDealItem(accountId);
  const removeInterest = useRemoveInterest(accountId);

  const items = useMemo(() => opp.data?.items ?? [], [opp.data?.items]);
  const t = useMemo(() => totals(items), [items]);
  const steps = journey({
    replied: Boolean(replied.data),
    classified: contact.score !== null,
    interests: interests.data?.length ?? 0,
    items: items.filter((i) => i.status !== "declined").length,
  });
  const catalogEmpty = !products.isLoading && (products.data ?? []).length === 0;
  const core = items.filter((i) => i.kind === "core");
  const extras = items.filter((i) => i.kind !== "core");

  async function estimate() {
    try {
      await build.mutateAsync(contact.id);
      toast.success("Oportunidade estimada pelo interesse");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function setStatus(id: string, status: ItemStatus) {
    try {
      await updateItem.mutateAsync({ id, patch: { status } });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <div className="space-y-5">
      <JourneySteps steps={steps} />

      {/* Qualificação */}
      <div className="flex items-center gap-2 rounded-xl bg-surface-2/60 px-3 py-2.5 text-[12px]">
        <span className="font-medium text-foreground">Qualificação</span>
        {contact.score !== null ? (
          <>
            <TempChip level={contact.temperature} score={contact.score} />
            {contact.ai_intent && (
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {contact.ai_intent}
              </span>
            )}
          </>
        ) : (
          <span className="text-muted-foreground">a IA classifica com a conversa</span>
        )}
      </div>

      {/* Interesse */}
      <section aria-labelledby={`int-${contact.id}`}>
        <div className="mb-2 flex items-center justify-between">
          <h4 id={`int-${contact.id}`} className="text-[12px] font-semibold">
            Interesse
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
            Cadastre o que você vende em{" "}
            <Link
              to="/ajustes"
              search={{ aba: "catalogo" }}
              className="font-medium text-foreground underline underline-offset-2"
            >
              Ajustes › Catálogo
            </Link>{" "}
            para a IA reconhecer o interesse e estimar a oportunidade.
          </p>
        ) : (interests.data ?? []).length === 0 ? (
          <p className="text-[12px] text-muted-foreground">
            Nenhum item do catálogo identificado ainda. A IA marca ao classificar, ou adicione à
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
                  aria-label={`Remover interesse em ${i.products?.name ?? "item"}`}
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

      {/* Oportunidade */}
      <section aria-labelledby={`opp-${contact.id}`}>
        <div className="mb-2 flex items-center justify-between">
          <h4 id={`opp-${contact.id}`} className="text-[12px] font-semibold">
            Oportunidade
          </h4>
          {opp.data && (
            <Link
              to="/crm"
              className="inline-flex items-center gap-0.5 text-[11px] font-medium text-muted-foreground hover:text-foreground"
            >
              {opp.data.deal.stage?.name ?? "No funil"}{" "}
              <ArrowUpRight className="size-3" aria-hidden />
            </Link>
          )}
        </div>
        {opp.isLoading ? (
          <Skeleton className="h-24 w-full rounded-xl" />
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border-strong p-4 text-center">
            {opp.data && (
              <p className="mb-2 text-[12px] text-muted-foreground">
                Negócio aberto com valor manual de{" "}
                <span className="font-semibold text-foreground">
                  {formatMoney(opp.data.deal.value)}
                </span>
                .
              </p>
            )}
            <Button
              size="sm"
              onClick={() => void estimate()}
              disabled={build.isPending || !(interests.data ?? []).length}
            >
              {build.isPending ? <Loader2 className="animate-spin" /> : <Wand2 />}
              Estimar pelo interesse
            </Button>
            {!(interests.data ?? []).length && !catalogEmpty && (
              <p className="mt-2 text-[11px] text-subtle">
                Registre ao menos um interesse para estimar.
              </p>
            )}
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-surface">
            <div className="atmosphere grid grid-cols-2 gap-3 border-b border-border p-4">
              <div>
                <p className="text-[11px] text-muted-foreground">Estimada</p>
                <p className="font-display text-[24px] leading-tight font-semibold tabular-nums">
                  {formatMoney(t.accepted)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[11px] text-muted-foreground">Potencial</p>
                <p className="font-display text-[24px] leading-tight font-semibold text-muted-foreground tabular-nums">
                  {formatMoney(t.potential)}
                </p>
              </div>
              {t.upsell + t.crossSell > 0 && (
                <p className="col-span-2 text-[11px] text-muted-foreground">
                  {t.upsell > 0 && <>+{formatMoney(t.upsell)} em upsell</>}
                  {t.upsell > 0 && t.crossSell > 0 && " · "}
                  {t.crossSell > 0 && <>+{formatMoney(t.crossSell)} em cross-sell</>}
                </p>
              )}
            </div>
            <ul className="space-y-1.5 p-2">
              {core.map((i) => (
                <ItemRow
                  key={i.id}
                  item={i}
                  onStatus={(s) => void setStatus(i.id, s)}
                  busy={updateItem.isPending}
                />
              ))}
            </ul>
            {extras.length > 0 && (
              <>
                <p className="px-4 pt-1 text-[11px] font-semibold text-muted-foreground">
                  Para oferecer junto
                </p>
                <ul className="space-y-1.5 p-2">
                  {extras.map((i) => (
                    <ItemRow
                      key={i.id}
                      item={i}
                      onStatus={(s) => void setStatus(i.id, s)}
                      busy={updateItem.isPending}
                    />
                  ))}
                </ul>
              </>
            )}
            <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-2.5">
              <p className="text-[11px] text-subtle">Mensal conta 12 meses.</p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void estimate()}
                disabled={build.isPending || !(interests.data ?? []).length}
              >
                {build.isPending ? <Loader2 className="animate-spin" /> : <Wand2 />}
                Atualizar pelo interesse
              </Button>
            </div>
          </div>
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
        <p className="text-[13px] font-semibold">O que o cliente quer?</p>
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
          Registrar interesse
        </Button>
      </PopoverContent>
    </Popover>
  );
}
