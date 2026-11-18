import { useState, type FormEvent } from "react";
import { Bookmark, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { useDeleteInboxView, useInboxViews, useSaveInboxView } from "../api-views";
import type { InboxFilters } from "../types";

// Visões salvas (#64): guardar os filtros de agora com um nome e voltar a eles com um clique.
export function SavedViews({
  accountId,
  filters,
  onApply,
}: {
  accountId: string;
  filters: InboxFilters;
  onApply: (f: InboxFilters) => void;
}) {
  const views = useInboxViews(accountId);
  const save = useSaveInboxView(accountId);
  const remove = useDeleteInboxView(accountId);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const list = views.data ?? [];

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    save.mutate(
      { name, filters },
      {
        onSuccess: () => {
          setNaming(false);
          setName("");
        },
      },
    );
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" aria-label="Visões salvas" className="size-9">
            <Bookmark />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="text-[11px] tracking-widest text-subtle uppercase">
            Visões salvas
          </DropdownMenuLabel>
          {list.length === 0 && (
            <p className="px-2 py-1.5 text-[13px] text-muted-foreground">
              Nenhuma ainda. Ajuste os filtros e salve para voltar com um clique.
            </p>
          )}
          {list.map((v) => (
            <DropdownMenuItem
              key={v.id}
              onSelect={() => onApply(v.filters)}
              className="flex items-center justify-between gap-2"
            >
              <span className="truncate">{v.name}</span>
              <button
                type="button"
                aria-label={`Apagar a visão ${v.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  remove.mutate(v.id);
                }}
                className="grid size-6 place-items-center rounded-md text-subtle hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setNaming(true)}>
            Salvar os filtros de agora…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={naming} onOpenChange={setNaming}>
        <DialogContent className="sm:max-w-sm">
          <form onSubmit={submit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Salvar visão</DialogTitle>
              <DialogDescription>
                Guarda situação, recorte, canal, etiqueta e busca de agora. Só você vê.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="view-name">Nome</Label>
              <Input
                id="view-name"
                value={name}
                maxLength={40}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Financeiro sem dono"
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setNaming(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={!name.trim() || save.isPending}>
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
