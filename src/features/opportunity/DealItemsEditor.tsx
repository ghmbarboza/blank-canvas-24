import { useMemo, useState } from "react";
import { Loader2, Plus, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { BILLING_LABEL, useProducts } from "@/features/catalog/api";
import { moneyInputValue, parseMoneyInput } from "@/features/crm/money";
import { errorMessage } from "@/lib/functions";
import { formatMoney } from "@/lib/format";

import {
  useAddDealItem,
  useBuildOpportunity,
  useDealItems,
  useRemoveDealItem,
  useUpdateDealItem,
} from "./api";
import { ItemRow } from "./ItemRow";
import { totals, type DealItem, type ItemKind, type ItemStatus } from "./lib";

interface Props {
  accountId: string;
  dealId: string;
  contactId: string | null;
}

// Itens do negócio no funil: o valor do negócio passa a ser a soma do que foi aceito.
export function DealItemsEditor({ accountId, dealId, contactId }: Props) {
  const items = useDealItems(accountId, dealId);
  const products = useProducts(accountId);
  const add = useAddDealItem(accountId);
  const build = useBuildOpportunity(accountId);
  const update = useUpdateDealItem(accountId);
  const [productId, setProductId] = useState("");
  const [kind, setKind] = useState<ItemKind>("core");

  const list = useMemo(() => items.data ?? [], [items.data]);
  const t = useMemo(() => totals(list), [list]);
  const options = (products.data ?? []).filter(
    (p) => p.active && !list.some((i) => i.product_id === p.id),
  );

  async function addItem() {
    const product = options.find((p) => p.id === productId);
    if (!product) return;
    try {
      await add.mutateAsync({ dealId, product, kind, position: list.length + 1 });
      setProductId("");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function setStatus(id: string, status: ItemStatus) {
    try {
      await update.mutateAsync({ id, patch: { status } });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <section aria-labelledby="deal-items" className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p id="deal-items" className="eyebrow">
            Itens do cliente
          </p>
          {list.length > 0 && (
            <p className="mt-1 text-[12px] text-muted-foreground">
              Estimada{" "}
              <span className="font-semibold text-foreground tabular-nums">
                {formatMoney(t.accepted)}
              </span>{" "}
              · potencial{" "}
              <span className="font-semibold text-foreground tabular-nums">
                {formatMoney(t.potential)}
              </span>
            </p>
          )}
        </div>
        {contactId && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              build.mutate(contactId, {
                onSuccess: () => toast.success("Itens atualizados pelo interesse do contato"),
                onError: (err) => toast.error(errorMessage(err)),
              })
            }
            disabled={build.isPending}
          >
            {build.isPending ? <Loader2 className="animate-spin" /> : <Wand2 />}
            Puxar do interesse
          </Button>
        )}
      </div>

      {items.isLoading ? (
        <Skeleton className="h-20 w-full rounded-xl" />
      ) : list.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-3 py-3 text-[12px] text-muted-foreground">
          Sem itens: o valor do contrato é o digitado acima. Adicione itens do catálogo para estimar
          pelo que o cliente quer.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {list.map((i) => (
            <li key={i.id} className="space-y-1">
              <ul>
                <ItemRow
                  item={i}
                  onStatus={(s) => void setStatus(i.id, s)}
                  busy={update.isPending}
                />
              </ul>
              {i.status === "accepted" && <ItemTerms accountId={accountId} item={i} />}
            </li>
          ))}
        </ul>
      )}

      {(products.data ?? []).length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Select value={kind} onValueChange={(v) => setKind(v as ItemKind)}>
            <SelectTrigger className="h-9 w-32" aria-label="Tipo do item">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="core">Interesse</SelectItem>
              <SelectItem value="upsell">Plano maior</SelectItem>
              <SelectItem value="cross_sell">Item complementar</SelectItem>
            </SelectContent>
          </Select>
          <Select value={productId} onValueChange={setProductId}>
            <SelectTrigger className="h-9 min-w-0 flex-1" aria-label="Item do catálogo">
              <SelectValue placeholder="Adicionar item do catálogo" />
            </SelectTrigger>
            <SelectContent>
              {options.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name} · {formatMoney(p.price)} {BILLING_LABEL[p.billing]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            onClick={() => void addItem()}
            disabled={!productId || add.isPending}
          >
            <Plus /> Adicionar
          </Button>
        </div>
      )}
    </section>
  );
}

// Quantidade, preço e desconto do item aceito; salva ao sair do campo.
function ItemTerms({ accountId, item }: { accountId: string; item: DealItem }) {
  const update = useUpdateDealItem(accountId);
  const remove = useRemoveDealItem(accountId);
  const [qty, setQty] = useState(String(Number(item.quantity)));
  const [price, setPrice] = useState(moneyInputValue(Number(item.unit_price)));
  const [discount, setDiscount] = useState(String(Number(item.discount_pct)));

  function commit() {
    const q = Number(qty.replace(",", "."));
    const p = parseMoneyInput(price);
    const d = Number(discount.replace(",", "."));
    if (!(q > 0) || p === null || !(d >= 0 && d <= 100)) {
      toast.error("Confira quantidade, preço e desconto (0 a 100%)");
      return;
    }
    if (
      q === Number(item.quantity) &&
      p === Number(item.unit_price) &&
      d === Number(item.discount_pct)
    )
      return;
    update.mutate(
      { id: item.id, patch: { quantity: q, unit_price: p, discount_pct: d } },
      { onError: (err) => toast.error(errorMessage(err)) },
    );
  }

  return (
    <div className="grid grid-cols-[1fr_1.4fr_1fr_auto] items-end gap-2 px-3 pb-1">
      <label className="grid gap-1 text-[11px] text-subtle">
        Qtd.
        <Input
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          onBlur={commit}
          inputMode="decimal"
          className="h-8 text-[12px]"
        />
      </label>
      <label className="grid gap-1 text-[11px] text-subtle">
        Preço un. (R$)
        <Input
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          onBlur={commit}
          inputMode="decimal"
          className="h-8 text-[12px]"
        />
      </label>
      <label className="grid gap-1 text-[11px] text-subtle">
        Desc. %
        <Input
          value={discount}
          onChange={(e) => setDiscount(e.target.value)}
          onBlur={commit}
          inputMode="decimal"
          className="h-8 text-[12px]"
        />
      </label>
      <button
        type="button"
        aria-label={`Remover ${item.name}`}
        onClick={() => remove.mutate(item.id, { onError: (err) => toast.error(errorMessage(err)) })}
        className="mb-1 rounded-full p-1.5 text-subtle hover:bg-surface-2 hover:text-danger"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}
