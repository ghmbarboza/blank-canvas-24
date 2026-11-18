import { useEffect, useState } from "react";
import { BookOpenCheck, Copy, Loader2, Pencil, Plus, Scale, Star, Trash2 } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { SettingsCard } from "@/features/settings/SettingsCard";
import { useAccount } from "@/lib/account";
import { errorMessage } from "@/lib/functions";

import {
  parseCriteria,
  useDeletePlaybook,
  useDeleteScorecard,
  usePlaybooks,
  useSaveScorecard,
  useScorecards,
  type PlaybookRow,
  type ScorecardRow,
} from "./api";
import { PlaybookEditor } from "./PlaybookEditor";
import { TEMPLATE_PLAYBOOK, TEMPLATE_SCORECARD } from "./template";
import type { PlaybookContent, ScorecardCriterion } from "./types";

// Ajustes › Playbooks: roteiros que o coach segue ao vivo e rubricas que dão nota às reuniões.
export function PlaybooksTab() {
  const { current, isManager } = useAccount();
  const accountId = current!.accountId;
  const playbooks = usePlaybooks(accountId);
  const remove = useDeletePlaybook(accountId);
  const [editor, setEditor] = useState<{
    open: boolean;
    row: PlaybookRow | null;
    content: PlaybookContent;
  }>({ open: false, row: null, content: TEMPLATE_PLAYBOOK });
  const list = playbooks.data ?? [];

  return (
    <div className="space-y-6">
      <SettingsCard
        title="Roteiros de atendimento"
        description="O roteiro da reunião: o que perguntar, como responder objeções, o que dizer sobre concorrentes e quando propor o fechamento. O coach ao vivo usa isto para dar dicas só ao atendente."
        readOnlyNote={isManager ? undefined : "Só gestores editam playbooks."}
        actions={
          isManager && (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setEditor({
                    open: true,
                    row: null,
                    content: { ...TEMPLATE_PLAYBOOK, name: "Meu playbook" },
                  })
                }
              >
                <Copy /> Usar o modelo
              </Button>
              <Button
                variant={list.length === 0 ? "outline" : "default"}
                size="sm"
                onClick={() =>
                  setEditor({
                    open: true,
                    row: null,
                    content: {
                      ...TEMPLATE_PLAYBOOK,
                      name: "",
                      phases: [],
                      questions: [],
                      objections: [],
                      competitors: [],
                      closing_signals: [],
                      forbidden_phrases: [],
                    },
                  })
                }
              >
                <Plus /> Novo
              </Button>
            </div>
          )
        }
      >
        {playbooks.isPending ? (
          <Loader2 className="mx-auto my-8 animate-spin text-subtle" />
        ) : list.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-surface-2/40 px-6 py-10 text-center">
            <span className="grid size-11 place-items-center rounded-full bg-primary text-primary-foreground">
              <BookOpenCheck className="size-5" />
            </span>
            <p className="max-w-md text-[13px] text-muted-foreground">
              Sem playbook, o coach usa um modelo genérico de venda consultiva. Comece pelo modelo e
              ajuste ao seu negócio: objeções reais, concorrentes e o que propor no fechamento.
            </p>
            {isManager && (
              <Button
                size="sm"
                onClick={() =>
                  setEditor({
                    open: true,
                    row: null,
                    content: { ...TEMPLATE_PLAYBOOK, name: "Meu playbook" },
                  })
                }
              >
                <Copy /> Começar pelo modelo
              </Button>
            )}
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {list.map(({ row, content }) => {
              const items = content.phases.reduce((s, p) => s + p.items.length, 0);
              return (
                <li key={row.id} className="lift rounded-2xl border border-border bg-surface p-4">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 truncate text-[14px] font-semibold">
                        {row.is_default && (
                          <Star className="size-3.5 fill-current" aria-label="padrão" />
                        )}
                        {row.name}
                      </p>
                      <p className="text-[12px] text-subtle">
                        {content.framework} · {content.phases.length} fases · {items} itens ·{" "}
                        {content.objections.length} objeções
                        {!row.is_active && " · inativo"}
                      </p>
                    </div>
                    {isManager && (
                      <div className="flex gap-0.5">
                        <IconBtn
                          label="Editar"
                          onClick={() => setEditor({ open: true, row, content })}
                        >
                          <Pencil className="size-3.5" />
                        </IconBtn>
                        <IconBtn
                          label="Duplicar"
                          onClick={() =>
                            setEditor({
                              open: true,
                              row: null,
                              content: { ...content, name: `${content.name} (cópia)` },
                            })
                          }
                        >
                          <Copy className="size-3.5" />
                        </IconBtn>
                        <IconBtn
                          label="Excluir"
                          danger
                          onClick={() =>
                            remove.mutate(row.id, {
                              onSuccess: () => toast.success("Playbook excluído"),
                              onError: (e) => toast.error(errorMessage(e)),
                            })
                          }
                        >
                          <Trash2 className="size-3.5" />
                        </IconBtn>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </SettingsCard>
      <Scorecards accountId={accountId} isManager={isManager} />
      <PlaybookEditor
        accountId={accountId}
        open={editor.open}
        onOpenChange={(o) => setEditor((e) => ({ ...e, open: o }))}
        row={editor.row}
        initial={editor.content}
      />
    </div>
  );
}

function IconBtn({
  label,
  onClick,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`rounded-full p-1.5 text-subtle hover:bg-surface-2 ${danger ? "hover:text-danger" : "hover:text-foreground"}`}
    >
      {children}
    </button>
  );
}

function Scorecards({ accountId, isManager }: { accountId: string; isManager: boolean }) {
  const cards = useScorecards(accountId);
  const remove = useDeleteScorecard(accountId);
  const [edit, setEdit] = useState<{ open: boolean; row: ScorecardRow | null }>({
    open: false,
    row: null,
  });
  return (
    <SettingsCard
      title="Rubricas de nota"
      description="Critérios e pesos que a IA usa para dar nota a cada reunião, com o trecho que justifica."
      actions={
        isManager && (
          <Button size="sm" variant="outline" onClick={() => setEdit({ open: true, row: null })}>
            <Plus /> Nova rubrica
          </Button>
        )
      }
    >
      {(cards.data ?? []).length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-[13px] text-muted-foreground">
          Sem rubrica própria: a nota usa o modelo (abertura, descoberta, qualificação, objeções,
          próximo passo e escuta).
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {(cards.data ?? []).map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-4 py-2.5">
              <Scale className="size-4 text-subtle" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">
                  {c.name}{" "}
                  {c.is_default && <span className="text-[11px] text-subtle">· padrão</span>}
                </p>
                <p className="truncate text-[11px] text-subtle">
                  {parseCriteria(c.criteria)
                    .map((k) => `${k.label} (${k.weight}×)`)
                    .join(" · ")}
                </p>
              </div>
              {isManager && (
                <>
                  <IconBtn label="Editar" onClick={() => setEdit({ open: true, row: c })}>
                    <Pencil className="size-3.5" />
                  </IconBtn>
                  <IconBtn
                    label="Excluir"
                    danger
                    onClick={() =>
                      remove.mutate(c.id, { onError: (e) => toast.error(errorMessage(e)) })
                    }
                  >
                    <Trash2 className="size-3.5" />
                  </IconBtn>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <ScorecardDialog
        accountId={accountId}
        open={edit.open}
        row={edit.row}
        onOpenChange={(o) => setEdit((e) => ({ ...e, open: o }))}
      />
    </SettingsCard>
  );
}

function ScorecardDialog({
  accountId,
  open,
  row,
  onOpenChange,
}: {
  accountId: string;
  open: boolean;
  row: ScorecardRow | null;
  onOpenChange: (o: boolean) => void;
}) {
  const save = useSaveScorecard(accountId);
  const [name, setName] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [criteria, setCriteria] = useState<ScorecardCriterion[]>([]);
  useEffect(() => {
    if (!open) return;
    setName(row?.name ?? TEMPLATE_SCORECARD.name);
    setIsDefault(row?.is_default ?? true);
    setCriteria(row ? parseCriteria(row.criteria) : TEMPLATE_SCORECARD.criteria);
  }, [open, row]);
  const upd = (i: number, patch: Partial<ScorecardCriterion>) =>
    setCriteria((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{row ? "Editar rubrica" : "Nova rubrica"}</DialogTitle>
          <DialogDescription>
            Cada critério recebe de 0 a 10; o peso define quanto conta na nota final (0 a 100).
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="sc-name">Nome</Label>
            <Input id="sc-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          {criteria.map((c, i) => (
            <div
              key={c.id}
              className="grid gap-2 rounded-xl border border-border p-2 sm:grid-cols-[1fr_1.4fr_70px_auto]"
            >
              <Input
                value={c.label}
                onChange={(e) => upd(i, { label: e.target.value })}
                placeholder="Critério"
                aria-label="Critério"
              />
              <Input
                value={c.description ?? ""}
                onChange={(e) => upd(i, { description: e.target.value })}
                placeholder="O que conta como bem feito"
                aria-label="Descrição"
              />
              <Input
                inputMode="numeric"
                value={String(c.weight)}
                onChange={(e) =>
                  upd(i, {
                    weight: Math.max(
                      1,
                      Math.min(5, Number(e.target.value.replace(/\D/g, "")) || 1),
                    ),
                  })
                }
                aria-label="Peso"
              />
              <IconBtn
                label="Remover"
                danger
                onClick={() => setCriteria((cs) => cs.filter((_, j) => j !== i))}
              >
                <Trash2 className="size-3.5" />
              </IconBtn>
            </div>
          ))}
          <Button
            size="sm"
            variant="outline"
            className="w-fit"
            onClick={() =>
              setCriteria((cs) => [
                ...cs,
                {
                  id: Math.random().toString(36).slice(2, 8),
                  label: "",
                  description: "",
                  weight: 1,
                },
              ])
            }
          >
            <Plus /> Critério
          </Button>
          <label className="flex items-center justify-between text-[13px]">
            Rubrica padrão da empresa <Switch checked={isDefault} onCheckedChange={setIsDefault} />
          </label>
        </div>
        <DialogFooter>
          <Button
            disabled={save.isPending}
            onClick={() =>
              save.mutate(
                {
                  ...(row ? { id: row.id } : {}),
                  name: name.trim() || "Rubrica",
                  criteria: criteria.filter((c) => c.label.trim()),
                  is_default: isDefault,
                },
                {
                  onSuccess: () => {
                    toast.success("Rubrica salva");
                    onOpenChange(false);
                  },
                  onError: (e) => toast.error(errorMessage(e)),
                },
              )
            }
          >
            {save.isPending && <Loader2 className="animate-spin" />} Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
