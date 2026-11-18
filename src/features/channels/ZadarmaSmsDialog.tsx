import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { BrandTile } from "@/components/brand/BrandIcon";
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
import { errorMessage } from "@/lib/functions";

import { channelsKey } from "./api";
import { CopyField } from "./CopyField";

const EMPTY = { name: "", sender: "" };

// SMS pela Zadarma: usa a mesma chave da telefonia (Ajustes › Integrações › Zadarma). O número
// virtual vira o remetente; o webhook da Zadarma (o mesmo das ligações) traz os SMS recebidos.
export function ZadarmaSmsDialog({
  accountId,
  open,
  onOpenChange,
}: {
  accountId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState(EMPTY);
  const [webhook, setWebhook] = useState<string | null>(null);
  const connect = useMutation({
    mutationFn: () =>
      callApi<{ id: string; webhookUrl: string }>("/api/sms", {
        accountId,
        action: "connect",
        name: form.name.trim(),
        sender: form.sender.trim(),
      }),
    onSuccess: (r) => {
      setWebhook(r.webhookUrl);
      setForm(EMPTY);
      toast.success("SMS conectado");
      void qc.invalidateQueries({ queryKey: channelsKey(accountId) });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const close = (next: boolean) => {
    if (!next) {
      setForm(EMPTY);
      setWebhook(null);
    }
    onOpenChange(next);
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    connect.mutate();
  };
  const set = (k: keyof typeof EMPTY) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BrandTile id="zadarma" size={20} /> SMS pela Zadarma
          </DialogTitle>
          <DialogDescription>
            Os SMS do seu número virtual da Zadarma entram na Caixa de entrada e a equipe responde
            por lá. Usa a mesma chave da telefonia.
          </DialogDescription>
        </DialogHeader>
        {webhook ? (
          <div className="space-y-3 text-[13px]">
            <p className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="size-4 text-success" aria-hidden /> Número conferido na
              Zadarma e conectado.
            </p>
            <p className="text-muted-foreground">
              Para receber SMS, na Zadarma: Configurações › Integrações e API › Notificações, ligue
              “SMS recebido” com o endereço abaixo (o mesmo das ligações). Sem isso, só o envio
              funciona.
            </p>
            <CopyField label="Endereço de notificações" value={webhook} />
          </div>
        ) : (
          <form id="zadarma-sms-form" onSubmit={submit} className="space-y-3" autoComplete="off">
            <ol className="list-decimal space-y-1 pl-5 text-[13px] text-muted-foreground">
              <li>Conecte a Zadarma em Ajustes › Integrações, se ainda não conectou.</li>
              <li>
                Em{" "}
                <a
                  href="https://my.zadarma.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-foreground underline-offset-4 hover:underline"
                >
                  my.zadarma.com
                </a>{" "}
                › Números, copie o número virtual com SMS (formato +55…).
              </li>
            </ol>
            <div className="space-y-1.5">
              <Label htmlFor="zd-sms-name">Nome do canal (opcional)</Label>
              <Input
                id="zd-sms-name"
                value={form.name}
                maxLength={80}
                onChange={(e) => set("name")(e.target.value)}
                placeholder="Ex.: SMS Vendas"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="zd-sms-sender">Número virtual na Zadarma</Label>
              <Input
                id="zd-sms-sender"
                inputMode="tel"
                value={form.sender}
                onChange={(e) => set("sender")(e.target.value)}
                placeholder="+5548999990000"
                required
              />
            </div>
          </form>
        )}
        <DialogFooter>
          {webhook ? (
            <Button onClick={() => close(false)}>Concluir</Button>
          ) : (
            <Button type="submit" form="zadarma-sms-form" disabled={connect.isPending}>
              {connect.isPending && <Loader2 className="animate-spin" aria-hidden />}
              {connect.isPending ? "Conferindo na Zadarma…" : "Conectar e conferir"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
