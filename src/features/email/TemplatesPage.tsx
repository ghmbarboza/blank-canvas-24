import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, LayoutTemplate, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useAccount } from "@/lib/account";
import { formatRelative } from "@/lib/format";
import { errorMessage } from "@/lib/functions";

import { useDeleteTemplate, useSaveTemplate, useTemplates, type EmailTemplate } from "./api";
import { BlockEditor } from "./BlockEditor";
import { blocksToHtml, isEmailBlocks, newBlock, type EmailBlock } from "./render";

const CATEGORY: Record<string, string> = {
  marketing: "Campanha",
  transactional: "Aviso (transacional)",
  one_to_one: "E-mail do vendedor (1:1)",
};

// Modelos reutilizáveis: campanhas, avisos e respostas prontas do vendedor.
export function TemplatesPage() {
  const { current } = useAccount();
  const accountId = current!.accountId;
  const templates = useTemplates(accountId);
  const remove = useDeleteTemplate(accountId);
  const [editing, setEditing] = useState<EmailTemplate | "new" | null>(null);
  const list = templates.data ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="Modelos de e-mail"
        description="Monte uma vez, use em campanhas, automações e no e-mail do vendedor."
        actions={
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus /> Novo modelo
          </Button>
        }
      />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <Link
          to="/campanhas"
          className="mb-4 inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> Campanhas
        </Link>
        {templates.isPending ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-32 rounded-[24px]" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <EmptyState
            icon={LayoutTemplate}
            title="Nenhum modelo"
            description="Crie um modelo de boas-vindas, de follow-up ou de proposta. Variáveis como {{primeiro_nome}} são trocadas no envio."
            action={
              <Button onClick={() => setEditing("new")}>
                <Plus /> Criar modelo
              </Button>
            }
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((t) => (
              <li
                key={t.id}
                className="lift group relative flex flex-col rounded-[24px] border border-border bg-surface p-5"
              >
                <p className="truncate text-[15px] font-semibold">{t.name}</p>
                <p className="truncate text-[12px] text-subtle">{t.subject || "Sem assunto"}</p>
                <p className="mt-3 text-[11px] text-subtle">
                  {CATEGORY[t.category]} · editado {formatRelative(t.updated_at)}
                </p>
                <div className="absolute top-3 right-3 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  <button
                    type="button"
                    aria-label={`Editar ${t.name}`}
                    onClick={() => setEditing(t)}
                    className="rounded-full p-1.5 text-subtle hover:bg-surface-2 hover:text-foreground"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Excluir ${t.name}`}
                    onClick={() =>
                      remove.mutate(t.id, {
                        onSuccess: () => toast.success("Modelo excluído"),
                        onError: (e) => toast.error(errorMessage(e)),
                      })
                    }
                    className="rounded-full p-1.5 text-subtle hover:bg-surface-2 hover:text-danger"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <TemplateSheet
        accountId={accountId}
        brand={current!.accountName}
        template={editing}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}

function TemplateSheet({
  accountId,
  brand,
  template,
  onClose,
}: {
  accountId: string;
  brand: string;
  template: EmailTemplate | "new" | null;
  onClose: () => void;
}) {
  const save = useSaveTemplate(accountId);
  const t = template && template !== "new" ? template : null;
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [preheader, setPreheader] = useState("");
  const [category, setCategory] = useState("marketing");
  const [blocks, setBlocks] = useState<EmailBlock[]>([]);
  const [text, setText] = useState("");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const key = template === "new" ? "new" : (t?.id ?? null);
  if (key !== openKey) {
    setOpenKey(key);
    setName(t?.name ?? "");
    setSubject(t?.subject ?? "");
    setPreheader(t?.preheader ?? "");
    setCategory(t?.category ?? "marketing");
    const bl = t && isEmailBlocks(t.blocks) ? t.blocks : [newBlock("heading"), newBlock("text")];
    setBlocks(bl);
    setText(bl.find((b) => b.type === "text")?.text ?? "");
  }

  async function submit() {
    if (!name.trim()) {
      toast.error("Dê um nome ao modelo");
      return;
    }
    const finalBlocks: EmailBlock[] =
      category === "one_to_one" ? [{ id: "t1", type: "text", text }] : blocks;
    try {
      await save.mutateAsync({
        ...(t ? { id: t.id } : {}),
        values: {
          name: name.trim(),
          subject,
          preheader: preheader || null,
          category,
          blocks: finalBlocks as never,
          html: blocksToHtml(finalBlocks, {
            preheader,
            brand: { name: brand },
            marketing: category === "marketing",
          }),
        },
      });
      toast.success("Modelo salvo");
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <Sheet open={Boolean(template)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-5xl">
        <SheetHeader>
          <SheetTitle>{t ? "Editar modelo" : "Novo modelo"}</SheetTitle>
        </SheetHeader>
        <div className="grid gap-4 px-4 pb-8">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor="tp-name">Nome</Label>
              <Input id="tp-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="tp-subject">Assunto</Label>
              <Input
                id="tp-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={200}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Uso</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {category === "one_to_one" ? (
            <div className="grid gap-1.5">
              <Label htmlFor="tp-text">Mensagem (texto do vendedor, com variáveis)</Label>
              <Textarea
                id="tp-text"
                rows={10}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Olá {{primeiro_nome}}, tudo bem? ..."
              />
            </div>
          ) : (
            <>
              <div className="grid gap-1.5">
                <Label htmlFor="tp-pre">Texto de prévia</Label>
                <Input
                  id="tp-pre"
                  value={preheader}
                  onChange={(e) => setPreheader(e.target.value)}
                  maxLength={200}
                />
              </div>
              <BlockEditor
                accountId={accountId}
                blocks={blocks}
                onChange={setBlocks}
                preheader={preheader}
                brand={brand}
                marketing={category === "marketing"}
              />
            </>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={() => void submit()} disabled={save.isPending}>
              {save.isPending && <Loader2 className="animate-spin" />} Salvar modelo
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
