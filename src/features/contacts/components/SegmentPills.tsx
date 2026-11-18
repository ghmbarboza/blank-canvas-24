import { useState } from "react";
import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";
import { useDeleteSegment, useSegments, type Segment } from "@/features/segments/api";
import { SegmentBuilder } from "@/features/segments/SegmentBuilder";
import type { SegmentFilter } from "@/features/segments/rules";

type Props = {
  accountId: string;
  activeId: string | null;
  onApply: (s: Segment | null) => void;
  // Filtros rápidos atuais, para "Salvar segmento" já sair preenchido.
  currentAsRules: SegmentFilter | null;
};

const PILL =
  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[12px] font-medium transition-colors duration-150 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

// Segmentos salvos como pílulas: um clique aplica; o ativo ganha menu para editar ou excluir.
export function SegmentPills({ accountId, activeId, onApply, currentAsRules }: Props) {
  const segments = useSegments(accountId);
  const remove = useDeleteSegment(accountId);
  const [builder, setBuilder] = useState<{
    open: boolean;
    segment: Segment | null;
    initial: SegmentFilter | null;
  }>({ open: false, segment: null, initial: null });
  const list = segments.data ?? [];

  function removeSegment(s: Segment) {
    remove.mutate(s.id, {
      onSuccess: () => {
        if (s.id === activeId) onApply(null);
        toast.success("Segmento excluído");
      },
      onError: (er) => toast.error(errorMessage(er)),
    });
  }

  return (
    <div
      className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 py-0.5"
      role="group"
      aria-label="Segmentos"
    >
      <button
        type="button"
        aria-pressed={!activeId}
        onClick={() => onApply(null)}
        className={cn(
          PILL,
          !activeId
            ? "border-primary bg-primary-soft text-foreground"
            : "border-border bg-surface-2 text-muted-foreground hover:text-foreground",
        )}
      >
        Todos os contatos
      </button>
      {list.map((s) => {
        const active = s.id === activeId;
        return (
          <span key={s.id} className="flex shrink-0 items-center">
            <button
              type="button"
              aria-pressed={active}
              onClick={() => onApply(active ? null : s)}
              className={cn(
                PILL,
                active
                  ? "rounded-r-none border-primary bg-primary pr-2.5 text-primary-foreground"
                  : "border-border bg-surface-2 text-muted-foreground hover:text-foreground",
              )}
            >
              {s.name}
            </button>
            {active && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={`Opções do segmento ${s.name}`}
                    className={cn(
                      PILL,
                      "rounded-l-none border-l-primary-foreground/20 border-primary bg-primary px-2 text-primary-foreground",
                    )}
                  >
                    <MoreHorizontal className="size-3.5" aria-hidden />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  <DropdownMenuItem
                    onSelect={() => setBuilder({ open: true, segment: s, initial: null })}
                  >
                    <Pencil /> Editar regras
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => removeSegment(s)} className="text-danger">
                    <Trash2 /> Excluir segmento
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </span>
        );
      })}
      <button
        type="button"
        onClick={() =>
          setBuilder({
            open: true,
            segment: null,
            initial: currentAsRules && currentAsRules.rules.length > 0 ? currentAsRules : null,
          })
        }
        className={cn(
          PILL,
          "border-dashed border-border-strong bg-transparent text-muted-foreground hover:bg-surface-2 hover:text-foreground",
        )}
      >
        <Plus className="size-3.5" aria-hidden />
        {currentAsRules && currentAsRules.rules.length > 0 && !activeId
          ? "Salvar filtro como segmento"
          : "Salvar segmento"}
      </button>
      <SegmentBuilder
        accountId={accountId}
        open={builder.open}
        onOpenChange={(o) => setBuilder((b) => ({ ...b, open: o }))}
        segment={builder.segment}
        initial={builder.initial}
        onSaved={(s) => onApply(s)}
      />
    </div>
  );
}
