import { useEffect, useState } from "react";
import { Braces, Loader2, Send } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/functions";

import { useSendEmail, useTemplates } from "./api";
import { VARIABLES, isEmailBlocks } from "./render";

interface Props {
  accountId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  contactId?: string | null;
  dealId?: string | null;
  toEmail?: string | null;
  toName?: string | null;
}

// E-mail 1:1 do vendedor: sai pelo Resend da conta com o nome dele e a resposta volta para o e-mail dele.
export function EmailComposerDialog({
  accountId,
  open,
  onOpenChange,
  contactId,
  dealId,
  toEmail,
  toName,
}: Props) {
  const send = useSendEmail(accountId);
  const templates = useTemplates(accountId, "one_to_one");
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");

  useEffect(() => {
    if (open) {
      setTo(toEmail ?? "");
      setSubject("");
      setText("");
    }
  }, [open, toEmail]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await send.mutateAsync({
        to,
        subject,
        text,
        contactId: contactId ?? null,
        dealId: dealId ?? null,
      });
      toast.success("E-mail enviado e registrado na linha do tempo");
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <form onSubmit={(e) => void submit(e)}>
          <DialogHeader>
            <DialogTitle>Enviar e-mail{toName ? ` para ${toName}` : ""}</DialogTitle>
            <DialogDescription>
              Sai com o seu nome e a resposta chega no seu e-mail. Fica registrado na ficha.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="em-to">Para</Label>
              <Input
                id="em-to"
                type="email"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                required={!contactId}
                placeholder={contactId ? "E-mail cadastrado no contato" : "nome@empresa.com.br"}
              />
            </div>
            {(templates.data ?? []).length > 0 && (
              <Select
                onValueChange={(id) => {
                  const t = (templates.data ?? []).find((x) => x.id === id);
                  if (!t) return;
                  setSubject(t.subject);
                  const blocks = isEmailBlocks(t.blocks) ? t.blocks : [];
                  setText(
                    blocks
                      .map((b) => b.text ?? "")
                      .filter(Boolean)
                      .join("\n\n"),
                  );
                }}
              >
                <SelectTrigger aria-label="Usar modelo">
                  <SelectValue placeholder="Usar um modelo" />
                </SelectTrigger>
                <SelectContent>
                  {(templates.data ?? []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor="em-subject">Assunto</Label>
              <Input
                id="em-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={200}
                required
              />
            </div>
            <div className="grid gap-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="em-text">Mensagem</Label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      <Braces className="size-3" /> Variável
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {VARIABLES.map((v) => (
                      <DropdownMenuItem
                        key={v.key}
                        onSelect={() => setText((t) => `${t}{{${v.key}}}`)}
                      >
                        {v.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <Textarea
                id="em-text"
                rows={9}
                value={text}
                onChange={(e) => setText(e.target.value)}
                required
              />
              <p className="text-[11px] text-subtle">
                A assinatura da empresa (Ajustes › E-mail) entra no fim.
              </p>
            </div>
          </div>
          <DialogFooter className="mt-6">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={send.isPending}>
              {send.isPending ? <Loader2 className="animate-spin" /> : <Send />} Enviar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
