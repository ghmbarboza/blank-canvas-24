import { useMemo, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";

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
import { useDebounced } from "@/features/contacts/useDebounced";
import type { Channel } from "@/features/inbox/types";
import { formatNumber } from "@/lib/format";

import {
  parseTags,
  useAudiencePreview,
  useCreateWaCampaign,
  useWaTemplates,
  type WaTemplate,
} from "./api";

// Nova campanha (#67): canal, modelo aprovado, variáveis e público por etiqueta, com a contagem
// de quem pode receber (telefone, sem descadastro e com consentimento de marketing).
export function NewWaCampaignDialog({
  accountId,
  channels,
  open,
  onOpenChange,
}: {
  accountId: string;
  channels: Channel[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [channelId, setChannelId] = useState<string | null>(channels[0]?.id ?? null);
  const [templateKey, setTemplateKey] = useState("");
  const [params, setParams] = useState<string[]>([]);
  const [tagsRaw, setTagsRaw] = useState("");
  const tags = useDebounced(parseTags(tagsRaw).join(","), 300);
  const tagList = useMemo(() => (tags ? tags.split(",") : []), [tags]);
  const templates = useWaTemplates(accountId, channelId);
  const template = (templates.data ?? []).find((t) => `${t.name}|${t.language}` === templateKey);
  const preview = useAudiencePreview(accountId, tagList, open);
  const create = useCreateWaCampaign(accountId);

  const pickTemplate = (k: string) => {
    setTemplateKey(k);
    const t = (templates.data ?? []).find((x) => `${x.name}|${x.language}` === k);
    setParams(Array.from({ length: t?.variables ?? 0 }, (_, i) => (i === 0 ? "{nome}" : "")));
  };
  const reset = () => {
    setName("");
    setTemplateKey("");
    setParams([]);
    setTagsRaw("");
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!channelId || !template) return;
    create.mutate(
      { name, channelId, template: template as WaTemplate, params, tags: tagList },
      {
        onSuccess: () => {
          reset();
          onOpenChange(false);
        },
      },
    );
  };
  const valid = name.trim() && channelId && template && params.every((p) => p.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Nova campanha de WhatsApp</DialogTitle>
            <DialogDescription>
              Fica como rascunho. Você confere o público e dispara quando quiser.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="wa-name">Nome</Label>
            <Input
              id="wa-name"
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Retorno de clientes de outubro"
              required
            />
          </div>
          {channels.length > 1 && (
            <div className="space-y-1.5">
              <Label htmlFor="wa-channel">Número</Label>
              <Select
                value={channelId ?? ""}
                onValueChange={(v) => {
                  setChannelId(v);
                  pickTemplate("");
                }}
              >
                <SelectTrigger id="wa-channel" aria-label="Número">
                  <SelectValue placeholder="Escolha o número" />
                </SelectTrigger>
                <SelectContent>
                  {channels.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="wa-template">Modelo aprovado</Label>
            <Select value={templateKey} onValueChange={pickTemplate}>
              <SelectTrigger id="wa-template" aria-label="Modelo aprovado">
                <SelectValue
                  placeholder={
                    templates.isLoading
                      ? "Buscando modelos…"
                      : templates.isError
                        ? "Não deu para buscar os modelos"
                        : (templates.data?.length ?? 0) === 0
                          ? "Nenhum modelo aprovado neste número"
                          : "Escolha o modelo"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {(templates.data ?? []).map((t) => (
                  <SelectItem key={`${t.name}|${t.language}`} value={`${t.name}|${t.language}`}>
                    {t.name} · {t.language}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {template && (
              <p className="rounded-lg bg-surface-2 p-3 text-[13px] whitespace-pre-wrap text-muted-foreground">
                {template.body}
              </p>
            )}
          </div>
          {params.map((p, i) => (
            <div key={i} className="space-y-1.5">
              <Label htmlFor={`wa-var-${i}`}>Variável {`{{${i + 1}}}`}</Label>
              <Input
                id={`wa-var-${i}`}
                value={p}
                onChange={(e) => setParams(params.map((x, j) => (j === i ? e.target.value : x)))}
                placeholder="{nome} usa o primeiro nome de cada contato"
                required
              />
            </div>
          ))}
          <div className="space-y-1.5">
            <Label htmlFor="wa-tags">Para quem (etiquetas do contato)</Label>
            <Input
              id="wa-tags"
              value={tagsRaw}
              onChange={(e) => setTagsRaw(e.target.value)}
              placeholder="Vazio = todos. Ex.: vip, retorno"
            />
            <p className="text-[13px] text-muted-foreground" role="status">
              {preview.isLoading
                ? "Contando…"
                : preview.data
                  ? `${formatNumber(preview.data.eligible)} de ${formatNumber(preview.data.with_phone)} contatos com telefone podem receber (têm consentimento de marketing e não pediram para sair).`
                  : null}
            </p>
            <p className="text-[13px] text-muted-foreground">
              Dica: termine o modelo com “Responda SAIR para não receber mais”. Quem responder SAIR
              sai da lista sozinho.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!valid || create.isPending}>
              {create.isPending && <Loader2 className="animate-spin" aria-hidden />}
              Salvar rascunho
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
