import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { FileText, Loader2, Send } from "lucide-react";
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
import { callApi } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";
import { callFunction, errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";

import { fillPreview, slotLabel, type TemplateShape } from "../template-shape";
import { useWhatsAppPricing } from "../useWhatsAppPricing";
import { formatUnitBRL, toCategory, unitPrice } from "../whatsapp-pricing";

interface Template extends TemplateShape {
  name: string;
  language: string;
  category: string;
  variables: number;
}

const CATEGORY: Record<string, string> = {
  MARKETING: "Marketing",
  UTILITY: "Utilidade",
  AUTHENTICATION: "Autenticação",
};

interface Props {
  accountId: string;
  conversationId: string;
  channelId: string;
  contactName: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

// Fora da janela de 24 h o WhatsApp oficial só aceita template aprovado (issue #2).
export function TemplatePicker({
  accountId,
  conversationId,
  channelId,
  contactName,
  open,
  onOpenChange,
}: Props) {
  const [picked, setPicked] = useState<Template | null>(null);
  const [params, setParams] = useState<string[]>([]);
  const pricing = useWhatsAppPricing();
  const costOf = (t: Template) => unitPrice(pricing, toCategory(t.category), { template: true });
  const templates = useQuery({
    queryKey: ["wa-templates", accountId, channelId],
    enabled: open,
    staleTime: 5 * 60_000,
    queryFn: () =>
      callApi<{ templates: Template[] }>("/api/whatsapp/templates", { accountId, channelId }).then(
        (r) => r.templates,
      ),
  });
  useEffect(() => {
    if (!picked) return;
    const first = (contactName ?? "").split(" ")[0] ?? "";
    setParams(Array.from({ length: picked.variables }, (_, i) => (i === 0 ? first : "")));
  }, [picked, contactName]);
  useEffect(() => {
    if (!open) setPicked(null);
  }, [open]);

  const preview = useMemo(() => (picked ? fillPreview(picked, params) : ""), [picked, params]);
  const send = useMutation({
    mutationFn: async () => {
      const template = { name: picked!.name, language: picked!.language, params };
      const { data } = await supabase
        .from("channels")
        .select("provider")
        .eq("id", channelId)
        .maybeSingle();
      // WhatsApp pela Zernio: o modelo abre a conversa pelo telefone do cliente na rota do app.
      if (data?.provider === "zernio")
        return callApi("/api/zernio", {
          accountId,
          action: "message.send",
          conversationId,
          template,
        });
      return callFunction("send-message", { accountId, conversationId, template });
    },
    onSuccess: () => {
      toast.success("Template enviado. A conversa reabre quando o cliente responder.");
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Enviar template aprovado</DialogTitle>
          <DialogDescription>
            Passaram 24 h desde a última mensagem do cliente. Para retomar, o WhatsApp exige um
            modelo aprovado pela Meta.
          </DialogDescription>
        </DialogHeader>
        {templates.isPending ? (
          <Loader2 className="mx-auto my-8 animate-spin text-subtle" />
        ) : templates.isError ? (
          <p className="rounded-xl bg-danger/10 p-3 text-[13px] text-danger">
            {errorMessage(templates.error)}
          </p>
        ) : (templates.data ?? []).length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-4 text-center text-[13px] text-muted-foreground">
            Nenhum template aprovado neste número. Crie no Gerenciador do WhatsApp da Meta.
          </p>
        ) : !picked ? (
          <ul className="max-h-80 space-y-2 overflow-y-auto">
            {(templates.data ?? []).map((t) => (
              <li key={`${t.name}-${t.language}`}>
                <button
                  type="button"
                  onClick={() => setPicked(t)}
                  disabled={Boolean(t.unsupported)}
                  aria-describedby={t.unsupported ? `tpl-why-${t.name}` : undefined}
                  className="lift w-full rounded-2xl border border-border bg-surface p-3 text-left disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <p className="flex items-center gap-2 text-[13px] font-medium">
                    <FileText className="size-3.5 text-subtle" /> {t.name}
                    <span className="ml-auto rounded-full bg-surface-2 px-2 py-0.5 text-[10px] text-subtle">
                      {CATEGORY[t.category] ?? t.category} · {t.language} · ≈{" "}
                      {formatUnitBRL(costOf(t))}
                    </span>
                  </p>
                  <p className="mt-1 line-clamp-2 text-[12px] text-muted-foreground">{t.body}</p>
                  {t.unsupported ? (
                    <p id={`tpl-why-${t.name}`} className="mt-1.5 text-[12px] text-warm">
                      {t.unsupported}
                    </p>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="grid gap-3">
            <button
              type="button"
              onClick={() => setPicked(null)}
              className="w-fit text-[12px] text-muted-foreground hover:text-foreground"
            >
              ← Trocar template
            </button>
            {params.map((p, i) => (
              <div key={i} className="grid gap-1">
                <Label htmlFor={`tpl-${i}`}>
                  {picked.slots[i] ? slotLabel(picked.slots[i]) : `Variável ${i + 1}`}
                </Label>
                <Input
                  id={`tpl-${i}`}
                  value={p}
                  onChange={(e) =>
                    setParams((s) => s.map((x, j) => (j === i ? e.target.value : x)))
                  }
                />
              </div>
            ))}
            <div className="rounded-2xl bg-[#e7f6e7] p-3 text-[13px] whitespace-pre-wrap text-[#0b1f0b] dark:bg-[#1f3a2a] dark:text-white">
              {preview}
            </div>
            <p className="text-[12px] text-muted-foreground">
              Custo estimado deste envio: {formatUnitBRL(costOf(picked))} (
              {CATEGORY[picked.category] ?? picked.category}, cobrado pela Meta por mensagem
              entregue).
            </p>
          </div>
        )}
        <DialogFooter>
          <Button
            disabled={!picked || send.isPending || params.some((p) => !p.trim())}
            onClick={() => send.mutate()}
            className={cn(!picked && "hidden")}
          >
            {send.isPending ? <Loader2 className="animate-spin" /> : <Send />} Enviar template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
