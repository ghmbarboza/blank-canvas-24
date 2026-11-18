import { useMemo, useState } from "react";
import { ArrowUpRight, Globe, Package, Plus, Puzzle, Trash2, Wrench } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { SettingsCard } from "@/features/settings/SettingsCard";
import { useAccount } from "@/lib/account";
import { errorMessage } from "@/lib/functions";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

import { BILLING_LABEL, useDeleteProduct, useProducts, useRelations, type Product } from "./api";
import { ProductDialog } from "./ProductDialog";
import { SiteImportBox } from "./SiteImportBox";

export function CatalogTab() {
  const { current, isManager } = useAccount();
  const accountId = current!.accountId;
  const products = useProducts(accountId);
  const relations = useRelations(accountId);
  const remove = useDeleteProduct(accountId);
  const [editing, setEditing] = useState<Product | null>(null);
  const [open, setOpen] = useState(false);
  const [importing, setImporting] = useState(false);

  const list = useMemo(() => products.data ?? [], [products.data]);
  const rels = relations.data ?? [];
  const byId = useMemo(() => new Map(list.map((p) => [p.id, p])), [list]);

  function openNew() {
    setEditing(null);
    setOpen(true);
  }

  async function destroy(p: Product) {
    try {
      await remove.mutateAsync(p.id);
      toast.success(`${p.name} removido do catálogo`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <SettingsCard
      title="Catálogo de produtos e serviços"
      description="Base da oportunidade: a IA reconhece o interesse do cliente nestes itens, estima o valor do negócio e sugere upsell e cross-sell."
      readOnlyNote={isManager ? undefined : "Só gestores e administradores editam o catálogo."}
      actions={
        isManager && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setImporting(true)}>
              <Globe /> Importar do site
            </Button>
            <Button size="sm" variant={list.length === 0 ? "outline" : "default"} onClick={openNew}>
              <Plus /> Novo item
            </Button>
          </div>
        )
      }
    >
      {products.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-surface-2/40 px-6 py-10 text-center">
          <span className="grid size-11 place-items-center rounded-full bg-primary text-primary-foreground">
            <Package className="size-5" aria-hidden />
          </span>
          <p className="max-w-sm text-[13px] text-muted-foreground">
            Cadastre o que você vende. Sem catálogo, a IA classifica o lead, mas não consegue
            estimar quanto vale a oportunidade.
          </p>
          {isManager && (
            <Button size="sm" onClick={openNew}>
              <Plus /> Cadastrar o primeiro item
            </Button>
          )}
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {list.map((p) => {
            const out = rels.filter((r) => r.product_id === p.id);
            const Icon = p.kind === "service" ? Wrench : Package;
            return (
              <li key={p.id}>
                <div
                  role={isManager ? "button" : undefined}
                  tabIndex={isManager ? 0 : undefined}
                  onClick={() => {
                    if (!isManager) return;
                    setEditing(p);
                    setOpen(true);
                  }}
                  onKeyDown={(e) => {
                    if (isManager && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      setEditing(p);
                      setOpen(true);
                    }
                  }}
                  className={cn(
                    "lift group relative flex h-full flex-col rounded-2xl border border-border bg-surface p-4 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    isManager && "cursor-pointer",
                    !p.active && "opacity-60",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-foreground">
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-semibold">{p.name}</p>
                      <p className="text-[12px] text-subtle">
                        {[
                          p.category,
                          p.kind === "service" ? "Serviço" : "Produto",
                          p.active ? null : "inativo",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-display text-[16px] font-semibold tabular-nums">
                        {formatMoney(p.price)}
                      </p>
                      <p className="text-[11px] text-subtle">{BILLING_LABEL[p.billing]}</p>
                    </div>
                  </div>
                  {out.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {out.map((r) => {
                        const RIcon = r.kind === "upsell" ? ArrowUpRight : Puzzle;
                        return (
                          <span
                            key={r.id}
                            className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2 py-[3px] text-[11px] font-medium text-muted-foreground"
                          >
                            <RIcon className="size-3" aria-hidden />
                            {byId.get(r.related_id)?.name ?? "—"}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {isManager && (
                    <button
                      type="button"
                      aria-label={`Remover ${p.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        void destroy(p);
                      }}
                      className="absolute right-2 bottom-2 rounded-full p-1.5 text-subtle opacity-0 transition-opacity group-hover:opacity-100 hover:bg-surface-2 hover:text-danger focus-visible:opacity-100"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Dialog open={importing} onOpenChange={setImporting}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Importar do site</DialogTitle>
            <DialogDescription>
              Cole o endereço do site ou da loja online. Eu leio as páginas, mostro o que achei e
              você escolhe o que entra no catálogo.
            </DialogDescription>
          </DialogHeader>
          <SiteImportBox
            accountId={accountId}
            label="Endereço do site ou da loja"
            onDone={() => toast.success("Catálogo atualizado com o que veio do site")}
          />
        </DialogContent>
      </Dialog>
      <ProductDialog
        accountId={accountId}
        open={open}
        onOpenChange={setOpen}
        product={editing}
        products={list}
        relations={rels}
      />
    </SettingsCard>
  );
}
