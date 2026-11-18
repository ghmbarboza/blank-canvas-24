import { useEffect, useState } from "react";
import { Archive, ArchiveRestore, GripVertical, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { SettingsCard } from "@/features/settings/SettingsCard";
import { supabase } from "@/integrations/supabase/client";
import { useAccount } from "@/lib/account";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";

import {
  ENTITY_LABEL,
  TYPE_LABEL,
  fieldsFor,
  optionList,
  slugKey,
  useCustomFields,
  useDeleteField,
  useSaveField,
  type CustomField,
  type FieldEntity,
} from "./api";

const ENTITIES: FieldEntity[] = ["contact", "company", "deal", "ticket"];

export function CustomFieldsTab() {
  const { current, isManager } = useAccount();
  const accountId = current!.accountId;
  const { data, isPending } = useCustomFields(accountId);
  const save = useSaveField(accountId);
  const remove = useDeleteField(accountId);
  const [entity, setEntity] = useState<FieldEntity>("contact");
  const [editing, setEditing] = useState<CustomField | null>(null);
  const [open, setOpen] = useState(false);
  const list = fieldsFor(data, entity, true);

  return (
    <SettingsCard
      title="Campos personalizados"
      description="Guarde o que é específico do seu negócio. Os campos aparecem no cadastro, nos filtros, nos segmentos e na API."
      readOnlyNote={isManager ? undefined : "Só gestores e administradores editam campos."}
      actions={
        isManager && (
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus /> Novo campo
          </Button>
        )
      }
    >
      <Tabs value={entity} onValueChange={(v) => setEntity(v as FieldEntity)}>
        <TabsList className="mb-4">
          {ENTITIES.map((e) => (
            <TabsTrigger key={e} value={e}>
              {ENTITY_LABEL[e]}
              <span className="ml-1.5 rounded-full bg-surface-2 px-1.5 text-[10px] tabular-nums">
                {fieldsFor(data, e).length}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {isPending ? (
        <Loader2 className="mx-auto my-8 animate-spin text-subtle" />
      ) : list.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-[13px] text-muted-foreground">
          Nenhum campo em {ENTITY_LABEL[entity].toLowerCase()} ainda. Exemplos: segmento, origem do
          lead, número de unidades.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {list.map((f) => (
            <li
              key={f.id}
              className={cn("flex items-center gap-3 px-3 py-2.5", f.archived && "opacity-50")}
            >
              <GripVertical className="size-4 shrink-0 text-subtle" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">
                  {f.label}
                  {f.required && (
                    <span className="ml-1.5 rounded-full bg-primary-soft px-1.5 py-0.5 text-[10px] font-medium">
                      obrigatório
                    </span>
                  )}
                  {f.required_stage_id && (
                    <span className="ml-1.5 rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px]">
                      obrigatório numa etapa
                    </span>
                  )}
                </p>
                <p className="truncate font-mono text-[11px] text-subtle">
                  {f.key} · {TYPE_LABEL[f.type]}
                  {optionList(f).length > 0 && ` · ${optionList(f).join(", ")}`}
                </p>
              </div>
              {isManager && (
                <div className="flex shrink-0 gap-1">
                  <IconBtn
                    label="Editar"
                    onClick={() => {
                      setEditing(f);
                      setOpen(true);
                    }}
                  >
                    <Pencil className="size-3.5" />
                  </IconBtn>
                  <IconBtn
                    label={f.archived ? "Reativar" : "Arquivar"}
                    onClick={() =>
                      save.mutate(
                        { id: f.id, archived: !f.archived },
                        { onError: (e) => toast.error(errorMessage(e)) },
                      )
                    }
                  >
                    {f.archived ? (
                      <ArchiveRestore className="size-3.5" />
                    ) : (
                      <Archive className="size-3.5" />
                    )}
                  </IconBtn>
                  <IconBtn
                    label="Excluir"
                    danger
                    onClick={() =>
                      remove.mutate(f.id, {
                        onSuccess: () =>
                          toast.success(
                            "Campo excluído. Os valores já salvos continuam nos registros.",
                          ),
                        onError: (e) => toast.error(errorMessage(e)),
                      })
                    }
                  >
                    <Trash2 className="size-3.5" />
                  </IconBtn>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <FieldDialog
        accountId={accountId}
        open={open}
        onOpenChange={setOpen}
        entity={entity}
        field={editing}
        nextPosition={list.length}
      />
    </SettingsCard>
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
      className={cn(
        "rounded-full p-1.5 text-subtle hover:bg-surface-2",
        danger ? "hover:text-danger" : "hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function FieldDialog({
  accountId,
  open,
  onOpenChange,
  entity,
  field,
  nextPosition,
}: {
  accountId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  entity: FieldEntity;
  field: CustomField | null;
  nextPosition: number;
}) {
  const save = useSaveField(accountId);
  const [label, setLabel] = useState("");
  const [type, setType] = useState<string>("text");
  const [options, setOptions] = useState("");
  const [required, setRequired] = useState(false);
  const [stageId, setStageId] = useState<string | null>(null);
  const [help, setHelp] = useState("");
  const stages = useQuery({
    queryKey: ["all-stages", accountId],
    enabled: open && entity === "deal",
    queryFn: async () => {
      const { data } = await supabase
        .from("pipeline_stages")
        .select("id, name, pipelines(name)")
        .eq("account_id", accountId)
        .order("position");
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!open) return;
    setLabel(field?.label ?? "");
    setType(field?.type ?? "text");
    setOptions(field ? optionList(field).join("\n") : "");
    setRequired(field?.required ?? false);
    setStageId(field?.required_stage_id ?? null);
    setHelp(field?.help ?? "");
  }, [open, field]);

  const hasOptions = type === "select" || type === "multiselect";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const opts = options
      .split(/\n|,/)
      .map((o) => o.trim())
      .filter(Boolean);
    if (!label.trim()) {
      toast.error("Dê um nome ao campo");
      return;
    }
    if (hasOptions && opts.length < 2) {
      toast.error("Informe ao menos duas opções");
      return;
    }
    try {
      await save.mutateAsync({
        ...(field ? { id: field.id } : { entity, key: slugKey(label), position: nextPosition }),
        label: label.trim(),
        type: type as CustomField["type"],
        options: hasOptions ? opts : [],
        required,
        required_stage_id: entity === "deal" ? stageId : null,
        help: help.trim() || null,
      });
      toast.success(field ? "Campo atualizado" : "Campo criado");
      onOpenChange(false);
    } catch (err) {
      const msg = errorMessage(err);
      toast.error(
        msg.includes("custom_fields_account_id_entity_key")
          ? "Já existe um campo com esse nome"
          : msg,
      );
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={(e) => void submit(e)}>
          <DialogHeader>
            <DialogTitle>
              {field ? "Editar campo" : `Novo campo em ${ENTITY_LABEL[entity].toLowerCase()}`}
            </DialogTitle>
            <DialogDescription>
              {field
                ? `Chave: ${field.key} (não muda, para não quebrar filtros e integrações).`
                : label
                  ? `Chave: ${slugKey(label)}`
                  : "A chave é gerada pelo nome."}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="cf-label">Nome</Label>
              <Input
                id="cf-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Ex.: Número de unidades"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Tipo</Label>
              <Select value={type} onValueChange={setType} disabled={Boolean(field)}>
                <SelectTrigger aria-label="Tipo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPE_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {hasOptions && (
              <div className="grid gap-1.5">
                <Label htmlFor="cf-opts">Opções (uma por linha)</Label>
                <Textarea
                  id="cf-opts"
                  rows={4}
                  value={options}
                  onChange={(e) => setOptions(e.target.value)}
                />
              </div>
            )}
            <label className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5 text-[13px]">
              Obrigatório sempre
              <Switch checked={required} onCheckedChange={setRequired} />
            </label>
            {entity === "deal" && (
              <div className="grid gap-1.5">
                <Label>Obrigatório a partir da etapa</Label>
                <Select
                  value={stageId ?? "none"}
                  onValueChange={(v) => setStageId(v === "none" ? null : v)}
                >
                  <SelectTrigger aria-label="Etapa">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma</SelectItem>
                    {(stages.data ?? []).map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {(s.pipelines as unknown as { name: string } | null)?.name} · {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor="cf-help">Dica para quem preenche (opcional)</Label>
              <Input id="cf-help" value={help} onChange={(e) => setHelp(e.target.value)} />
            </div>
          </div>
          <DialogFooter className="mt-6">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Loader2 className="animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
