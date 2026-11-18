import { useState } from "react";
import { Loader2, Percent, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useProducts } from "@/features/catalog/api";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";

import { useCommissionRules, useDeleteRule, useSaveRule } from "./api";

// Regras de comissão: a mais específica vence (pessoa + produto, produto, categoria, geral).
export function CommissionRulesPanel({
  accountId,
  names,
}: {
  accountId: string;
  names: Map<string, string>;
}) {
  const rules = useCommissionRules(accountId);
  const save = useSaveRule(accountId);
  const del = useDeleteRule(accountId);
  const products = useProducts(accountId);
  const [name, setName] = useState("");
  const [percent, setPercent] = useState("");
  const [userId, setUserId] = useState("all");
  const [productId, setProductId] = useState("all");
  const [category, setCategory] = useState("");
  const categories = [
    ...new Set((products.data ?? []).map((p) => p.category).filter(Boolean)),
  ] as string[];

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const pctValue = Number(percent.replace(",", "."));
    if (!name.trim() || !(pctValue > 0 && pctValue <= 100)) {
      toast.error("Dê um nome e um percentual entre 0 e 100");
      return;
    }
    try {
      await save.mutateAsync({
        name: name.trim(),
        percent: pctValue,
        user_id: userId === "all" ? null : userId,
        product_id: productId === "all" ? null : productId,
        category: category || null,
      });
      setName("");
      setPercent("");
      toast.success("Regra criada");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <div className="space-y-4">
      <p className="max-w-2xl text-[13px] text-muted-foreground">
        Quando um negócio vira ganho, cada item recebe a regra mais específica: pessoa + produto
        vence produto, que vence categoria, que vence a regra geral. Reabriu o negócio, a comissão
        pendente é cancelada.
      </p>
      <form
        onSubmit={(e) => void add(e)}
        className="grid gap-3 rounded-xl border border-border bg-surface p-5 sm:grid-cols-6"
      >
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="cr-name">Nome</Label>
          <Input
            id="cr-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Planos SaaS"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="cr-pct">Percentual</Label>
          <Input
            id="cr-pct"
            inputMode="decimal"
            value={percent}
            onChange={(e) => setPercent(e.target.value)}
            placeholder="10"
          />
        </div>
        <div className="grid gap-1.5">
          <Label>Pessoa</Label>
          <Select value={userId} onValueChange={setUserId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {[...names.entries()].map(([id, n]) => (
                <SelectItem key={id} value={id}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label>Produto</Label>
          <Select value={productId} onValueChange={setProductId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Qualquer</SelectItem>
              {(products.data ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label>Categoria</Label>
          <Select
            value={category || "all"}
            onValueChange={(v) => setCategory(v === "all" ? "" : v)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Qualquer</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="sm:col-span-6">
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? <Loader2 className="animate-spin" /> : <Percent />} Adicionar regra
          </Button>
        </div>
      </form>
      <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
        {(rules.data ?? []).length === 0 && (
          <li className="px-4 py-8 text-center text-[12px] text-muted-foreground">
            Sem regras: nenhuma comissão é calculada.
          </li>
        )}
        {(rules.data ?? []).map((r) => {
          const product = (products.data ?? []).find((p) => p.id === r.product_id);
          return (
            <li
              key={r.id}
              className={cn(
                "flex items-center gap-3 px-4 py-3 text-[13px]",
                !r.active && "opacity-50",
              )}
            >
              <span className="grid h-8 min-w-14 place-items-center rounded-xl bg-primary px-2 font-semibold text-primary-foreground tabular-nums">
                {Number(r.percent)}%
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{r.name}</p>
                <p className="truncate text-[11px] text-subtle">
                  {[
                    r.user_id ? names.get(r.user_id) : "Todos",
                    product?.name ?? (r.category ? `Categoria ${r.category}` : "Qualquer produto"),
                  ].join(" · ")}
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  save.mutate({
                    id: r.id,
                    name: r.name,
                    percent: Number(r.percent),
                    user_id: r.user_id,
                    product_id: r.product_id,
                    category: r.category,
                    active: !r.active,
                  })
                }
              >
                {r.active ? "Pausar" : "Reativar"}
              </Button>
              <button
                type="button"
                aria-label="Excluir regra"
                onClick={() => del.mutate(r.id, { onError: (e) => toast.error(errorMessage(e)) })}
                className="rounded-full p-1.5 text-subtle hover:bg-surface-2 hover:text-danger"
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
