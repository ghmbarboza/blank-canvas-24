import { useState } from "react";
import { ArrowUpRight, Loader2, Plus, Puzzle, X } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { moneyInputValue, parseMoneyInput } from "@/features/crm/money";
import { errorMessage } from "@/lib/functions";
import { formatMoney } from "@/lib/format";

import {
  BILLING_LABEL,
  RELATION_LABEL,
  useSaveProduct,
  type Billing,
  type Product,
  type ProductDraft,
  type ProductRelation,
  type RelationKind,
} from "./api";

interface Props {
  accountId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product | null;
  products: Product[];
  relations: ProductRelation[];
}

export function ProductDialog(props: Props) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        {props.open && <Body key={props.product?.id ?? "novo"} {...props} />}
      </DialogContent>
    </Dialog>
  );
}

function Body({ accountId, onOpenChange, product, products, relations }: Props) {
  const save = useSaveProduct(accountId);
  const [name, setName] = useState(product?.name ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [kind, setKind] = useState<"product" | "service">(
    product?.kind === "service" ? "service" : "product",
  );
  const [category, setCategory] = useState(product?.category ?? "");
  const [price, setPrice] = useState(moneyInputValue(Number(product?.price ?? 0)));
  const [billing, setBilling] = useState<Billing>((product?.billing as Billing) ?? "one_time");
  const [keywords, setKeywords] = useState((product?.keywords ?? []).join(", "));
  const [active, setActive] = useState(product?.active ?? true);
  const [links, setLinks] = useState<ProductDraft["relations"]>(
    relations
      .filter((r) => r.product_id === product?.id)
      .map((r) => ({ related_id: r.related_id, kind: r.kind as RelationKind, pitch: r.pitch })),
  );
  const [pickKind, setPickKind] = useState<RelationKind>("upsell");
  const [pickId, setPickId] = useState("");

  const parsedPrice = parseMoneyInput(price);
  const nameError = !name.trim() ? "Dê um nome" : null;
  const priceError = parsedPrice === null ? "Preço inválido" : null;
  const others = products.filter((p) => p.id !== product?.id);
  const available = others.filter(
    (p) => !links.some((l) => l.related_id === p.id && l.kind === pickKind),
  );

  function addLink() {
    if (!pickId) return;
    setLinks((prev) => [...prev, { related_id: pickId, kind: pickKind, pitch: null }]);
    setPickId("");
  }

  async function submit() {
    if (nameError || parsedPrice === null) return;
    try {
      await save.mutateAsync({
        ...(product ? { id: product.id } : {}),
        name: name.trim().slice(0, 120),
        description: description.trim() ? description.trim().slice(0, 1000) : null,
        kind,
        category: category.trim() ? category.trim().slice(0, 60) : null,
        price: parsedPrice,
        billing,
        keywords: keywords
          .split(",")
          .map((k) => k.trim().toLowerCase())
          .filter(Boolean)
          .slice(0, 20),
        active,
        relations: links,
      });
      toast.success(product ? "Item salvo" : "Item criado");
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      noValidate
    >
      <DialogHeader>
        <DialogTitle>{product ? "Editar item do catálogo" : "Novo item do catálogo"}</DialogTitle>
        <DialogDescription>
          A IA usa nome, descrição e termos para reconhecer o interesse do cliente na conversa.
        </DialogDescription>
      </DialogHeader>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="p-name">Nome</Label>
          <Input
            id="p-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={Boolean(nameError)}
            placeholder="Ex.: Plano Pro"
          />
          {nameError && name !== "" && <p className="text-[12px] text-danger">{nameError}</p>}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="p-kind">Tipo</Label>
          <Select
            value={kind}
            onValueChange={(v) => setKind(v === "service" ? "service" : "product")}
          >
            <SelectTrigger id="p-kind" className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="product">Produto</SelectItem>
              <SelectItem value="service">Serviço</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="p-cat">Categoria</Label>
          <Input
            id="p-cat"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Ex.: Planos"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="p-price">Preço (R$)</Label>
          <Input
            id="p-price"
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="0"
            aria-invalid={Boolean(priceError)}
          />
          {priceError && <p className="text-[12px] text-danger">{priceError}</p>}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="p-billing">Cobrança</Label>
          <Select value={billing} onValueChange={(v) => setBilling(v as Billing)}>
            <SelectTrigger id="p-billing" className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="one_time">Avulso</SelectItem>
              <SelectItem value="monthly">Mensal (conta 12 meses na oportunidade)</SelectItem>
              <SelectItem value="yearly">Anual</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="p-desc">Descrição</Label>
          <Textarea
            id="p-desc"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="O que é, para quem serve"
          />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="p-kw">Termos que o cliente usa</Label>
          <Input
            id="p-kw"
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="Separe por vírgula: plano completo, upgrade, mais usuários"
          />
        </div>

        <fieldset className="grid gap-3 rounded-2xl border border-border bg-surface-2/50 p-4 sm:col-span-2">
          <legend className="px-1 text-[13px] font-semibold">Upsell e cross-sell</legend>
          <p className="-mt-1 text-[12px] text-muted-foreground">
            Quando este item entrar numa oportunidade, os itens abaixo aparecem como sugestão para o
            vendedor.
          </p>
          {links.length > 0 && (
            <ul className="space-y-1.5">
              {links.map((l, i) => {
                const p = products.find((x) => x.id === l.related_id);
                const Icon = l.kind === "upsell" ? ArrowUpRight : Puzzle;
                return (
                  <li
                    key={`${l.kind}-${l.related_id}`}
                    className="flex items-center gap-2 rounded-xl bg-surface px-3 py-2 text-[13px] shadow-xs"
                  >
                    <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="w-20 shrink-0 text-[11px] font-medium text-muted-foreground">
                      {RELATION_LABEL[l.kind]}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {p?.name ?? "Item removido"}
                    </span>
                    {p && (
                      <span className="text-[12px] text-subtle tabular-nums">
                        {formatMoney(p.price)}
                      </span>
                    )}
                    <button
                      type="button"
                      aria-label="Remover"
                      onClick={() => setLinks((prev) => prev.filter((_, j) => j !== i))}
                      className="rounded-full p-1 text-subtle hover:bg-surface-2 hover:text-foreground"
                    >
                      <X className="size-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {others.length === 0 ? (
            <p className="text-[12px] text-subtle">Cadastre outros itens para relacionar.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Select value={pickKind} onValueChange={(v) => setPickKind(v as RelationKind)}>
                <SelectTrigger className="h-9 w-36" aria-label="Tipo de sugestão">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="upsell">Upsell</SelectItem>
                  <SelectItem value="cross_sell">Cross-sell</SelectItem>
                </SelectContent>
              </Select>
              <Select value={pickId} onValueChange={setPickId}>
                <SelectTrigger className="h-9 min-w-0 flex-1" aria-label="Item sugerido">
                  <SelectValue placeholder="Escolha o item" />
                </SelectTrigger>
                <SelectContent>
                  {available.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} · {formatMoney(p.price)} {BILLING_LABEL[p.billing]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" onClick={addLink} disabled={!pickId}>
                <Plus /> Adicionar
              </Button>
            </div>
          )}
        </fieldset>

        <label className="flex items-center gap-3 text-[13px] sm:col-span-2">
          <Switch checked={active} onCheckedChange={setActive} />
          Disponível para venda (itens inativos não entram em novas oportunidades)
        </label>
      </div>

      <DialogFooter className="mt-6">
        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
          Cancelar
        </Button>
        <Button type="submit" disabled={Boolean(nameError || priceError) || save.isPending}>
          {save.isPending && <Loader2 className="animate-spin" aria-hidden />}
          Salvar
        </Button>
      </DialogFooter>
    </form>
  );
}
