import { useState, type FormEvent } from "react";
import { BrandIcon } from "@/components/brand/BrandIcon";
import { CheckCircle2, Loader2 } from "lucide-react";
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
import { errorMessage } from "@/lib/functions";
import { useChannelAction, type MetaConnectResult } from "./api";
import { CopyField } from "./CopyField";
import { EmbeddedSignupButton } from "./EmbeddedSignupButton";

interface Props {
  accountId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const EMPTY = { name: "", phoneNumberId: "", wabaId: "", accessToken: "", appSecret: "" };
type Field = keyof typeof EMPTY;

const FIELDS: { key: Field; label: string; hint?: string; secret?: boolean; numeric?: boolean }[] =
  [
    { key: "name", label: "Nome do canal", hint: "Como a equipe vai ver. Ex.: WhatsApp Vendas" },
    {
      key: "phoneNumberId",
      label: "ID do número (Phone Number ID)",
      numeric: true,
      hint: "Meta for Developers › WhatsApp › Configuração da API",
    },
    { key: "wabaId", label: "ID da conta do WhatsApp Business (WABA ID)", numeric: true },
    {
      key: "accessToken",
      label: "Token permanente",
      secret: true,
      hint: "Gerado por um usuário do sistema no Business Manager",
    },
    {
      key: "appSecret",
      label: "Chave secreta do app (App Secret)",
      secret: true,
      hint: "Configurações do app › Básico",
    },
  ];

export function MetaConnectDialog({ accountId, open, onOpenChange }: Props) {
  const connect = useChannelAction<typeof EMPTY, MetaConnectResult>(accountId, "meta.connect");
  const [form, setForm] = useState(EMPTY);
  const [result, setResult] = useState<MetaConnectResult | null>(null);

  function close(next: boolean) {
    if (!next) {
      setForm(EMPTY);
      setResult(null);
    }
    onOpenChange(next);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const payload = {
      name: form.name.trim(),
      phoneNumberId: form.phoneNumberId.trim(),
      wabaId: form.wabaId.trim(),
      accessToken: form.accessToken.trim(),
      appSecret: form.appSecret.trim(),
    };
    if (!/^\d{6,20}$/.test(payload.phoneNumberId) || !/^\d{6,20}$/.test(payload.wabaId)) {
      toast.error("O ID do número e o ID da conta do WhatsApp Business são só números");
      return;
    }
    connect.mutate(payload, {
      onSuccess: (res) => {
        setResult(res);
        setForm(EMPTY);
        toast.success("WhatsApp oficial conectado");
      },
      onError: (err) => toast.error(errorMessage(err)),
    });
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto rounded-xl bg-surface">
        {result ? (
          <div className="space-y-4">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="size-5 text-foreground" aria-hidden /> Falta um passo na
                Meta
              </DialogTitle>
              <DialogDescription>
                Sem o webhook (o endereço que recebe as mensagens), as mensagens que os clientes
                mandam não chegam aqui.
              </DialogDescription>
            </DialogHeader>
            <ol className="list-decimal space-y-1.5 pl-5 text-[13px] text-muted-foreground">
              <li>Abra o seu app em developers.facebook.com.</li>
              <li>Vá em WhatsApp › Configuração › Webhook e clique em Editar.</li>
              <li>Cole o endereço e o token de verificação abaixo e confirme.</li>
              <li>
                Em Campos do webhook, assine o campo{" "}
                <strong className="text-foreground">messages</strong>.
              </li>
            </ol>
            <CopyField label="Endereço do webhook" value={result.webhookUrl} />
            <CopyField label="Token de verificação" value={result.verifyToken} />
            <DialogFooter>
              <Button onClick={() => close(false)}>Pronto, configurei</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4" autoComplete="off">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <BrandIcon id="meta" size={20} />
                WhatsApp com o app próprio na Meta
              </DialogTitle>
              <DialogDescription>
                Cole os dados do seu app na Meta. Conferimos tudo com a Meta antes de salvar.
              </DialogDescription>
            </DialogHeader>
            <EmbeddedSignupButton accountId={accountId} onConnected={() => close(false)} />
            {FIELDS.map((f) => (
              <div key={f.key} className="space-y-1.5">
                <Label htmlFor={`meta-${f.key}`}>{f.label}</Label>
                <Input
                  id={`meta-${f.key}`}
                  type={f.secret ? "password" : "text"}
                  inputMode={f.numeric ? "numeric" : undefined}
                  autoComplete="off"
                  spellCheck={false}
                  required={f.key !== "name"}
                  value={form[f.key]}
                  onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                />
                {f.hint && <p className="text-[11px] text-subtle">{f.hint}</p>}
              </div>
            ))}
            <DialogFooter>
              <Button type="submit" disabled={connect.isPending}>
                {connect.isPending && <Loader2 className="animate-spin" aria-hidden />}
                {connect.isPending ? "Conferindo com a Meta…" : "Conectar"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
