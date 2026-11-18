import { useState } from "react";
import { Loader2, Bot, Tag, UserRound, Workflow, X, Zap } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { EnrollDialog } from "@/features/automations/EnrollDialog";
import { errorMessage } from "@/lib/functions";
import { formatNumber } from "@/lib/format";

import {
  classifyContact,
  useBulkAddTag,
  useBulkUpdateContacts,
  useInvalidateContacts,
} from "../api";
import { LIFECYCLES, LIFECYCLE_LABEL, type TeamMember } from "../types";
import { OwnerAvatar } from "./OwnerAvatar";

// Botão do dock navy: texto claro e lavagem translúcida, em claro e escuro.
const DOCK_BTN =
  "text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground focus-visible:ring-primary-foreground/60";

// Reclassificar custa uma chamada de IA por contato: no máximo 10 por vez, em série.
export const RECLASSIFY_LIMIT = 10;

type Props = {
  accountId: string;
  selectedIds: string[];
  members: TeamMember[];
  onClear: () => void;
};

export function ContactsBulkBar({ accountId, selectedIds, members, onClear }: Props) {
  const bulk = useBulkUpdateContacts(accountId);
  const addTag = useBulkAddTag(accountId);
  const invalidate = useInvalidateContacts(accountId);
  const [tag, setTag] = useState("");
  const [tagOpen, setTagOpen] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const count = selectedIds.length;

  async function patch(label: string, patchData: Parameters<typeof bulk.mutateAsync>[0]["patch"]) {
    try {
      await bulk.mutateAsync({ ids: selectedIds, patch: patchData });
      toast.success(`${label} em ${formatNumber(count)} contatos`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function submitTag() {
    const value = tag.trim().slice(0, 40);
    if (!value) return;
    try {
      const changed = await addTag.mutateAsync({ ids: selectedIds, tag: value });
      toast.success(`Tag “${value}” adicionada em ${formatNumber(changed)} contatos`);
      setTag("");
      setTagOpen(false);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function reclassify() {
    const ids = selectedIds.slice(0, RECLASSIFY_LIMIT);
    if (count > RECLASSIFY_LIMIT)
      toast.info(`A IA reclassifica ${RECLASSIFY_LIMIT} por vez. Começando pelos primeiros.`);
    let ok = 0;
    const failures: string[] = [];
    setProgress({ done: 0, total: ids.length });
    for (const [i, id] of ids.entries()) {
      try {
        await classifyContact(accountId, id);
        ok += 1;
      } catch (err) {
        failures.push(errorMessage(err));
      }
      setProgress({ done: i + 1, total: ids.length });
    }
    setProgress(null);
    await invalidate();
    if (ok) toast.success(`${ok} contatos reclassificados`);
    if (failures.length) toast.error(`${failures.length} sem classificação: ${failures[0]}`);
  }

  const busy = bulk.isPending || addTag.isPending || progress !== null;

  return (
    <div
      className="absolute bottom-24 left-1/2 z-20 md:bottom-5 flex w-max max-w-[calc(100%-2rem)] -translate-x-1/2 flex-wrap items-center gap-1 rounded-2xl bg-primary px-3 py-2 text-primary-foreground shadow-drag"
      role="region"
      aria-label="Ações em massa"
    >
      <span className="px-2 text-[13px] font-semibold tabular-nums">
        {formatNumber(count)} selecionado{count === 1 ? "" : "s"}
      </span>
      <span className="mx-1 h-5 w-px bg-primary-foreground/20" aria-hidden />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost" className={DOCK_BTN} disabled={busy}>
            <UserRound aria-hidden /> Reatribuir
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
          <DropdownMenuItem onSelect={() => patch("Responsável removido", { owner_user_id: null })}>
            Sem responsável
          </DropdownMenuItem>
          {members.map((m) => (
            <DropdownMenuItem
              key={m.userId}
              onSelect={() => patch("Responsável atribuído", { owner_user_id: m.userId })}
            >
              <OwnerAvatar member={m} size={18} /> {m.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost" className={DOCK_BTN} disabled={busy}>
            <Workflow aria-hidden /> Ciclo
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {LIFECYCLES.map((l) => (
            <DropdownMenuItem
              key={l}
              onSelect={() => patch(`Ciclo “${LIFECYCLE_LABEL[l]}”`, { lifecycle: l })}
            >
              {LIFECYCLE_LABEL[l]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Popover open={tagOpen} onOpenChange={setTagOpen}>
        <PopoverTrigger asChild>
          <Button size="sm" variant="ghost" className={DOCK_BTN} disabled={busy}>
            <Tag aria-hidden /> Adicionar tag
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submitTag();
            }}
            className="flex gap-2"
          >
            <Input
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              placeholder="Nome da tag"
              aria-label="Nome da tag"
              autoFocus
            />
            <Button type="submit" size="sm" disabled={!tag.trim() || addTag.isPending}>
              Adicionar
            </Button>
          </form>
        </PopoverContent>
      </Popover>
      <Button
        size="sm"
        variant="ghost"
        className={DOCK_BTN}
        onClick={() => setEnrolling(true)}
        disabled={busy}
      >
        <Zap aria-hidden /> Inscrever em cadência
      </Button>
      <EnrollDialog
        accountId={accountId}
        open={enrolling}
        onOpenChange={setEnrolling}
        contactIds={selectedIds}
        onDone={onClear}
      />
      <Button
        size="sm"
        variant="ghost"
        className={DOCK_BTN}
        onClick={() => void reclassify()}
        disabled={busy}
      >
        {progress ? <Loader2 className="animate-spin" aria-hidden /> : <Bot aria-hidden />}
        Reclassificar com IA
      </Button>
      {progress && (
        <div className="flex min-w-40 items-center gap-2" role="status" aria-live="polite">
          <Progress value={(progress.done / progress.total) * 100} className="h-1.5 w-24" />
          <span className="text-[12px] tabular-nums opacity-80">
            {progress.done}/{progress.total}
          </span>
        </div>
      )}
      <Button
        size="sm"
        variant="ghost"
        className={DOCK_BTN}
        onClick={onClear}
        disabled={progress !== null}
      >
        <X aria-hidden /> Limpar
      </Button>
    </div>
  );
}
