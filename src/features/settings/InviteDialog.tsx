import { useState, type FormEvent } from "react";
import { Loader2, MailWarning } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";
import { CopyField } from "@/features/channels/CopyField";
import { inviteLink, useCreateInvite } from "./api";
import { emailApi } from "@/features/email/api";
import { useIntegration } from "@/features/integrations/api";
import { ASSIGNABLE_ROLES, ROLE_INFO, isAssignableRole, type AssignableRole } from "./roles";

const emailSchema = z.string().trim().toLowerCase().email();

interface Props {
  accountId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InviteDialog({ accountId, open, onOpenChange }: Props) {
  const { user } = useAuth();
  const create = useCreateInvite(accountId, user?.id);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AssignableRole>("agent");
  const [link, setLink] = useState<string | null>(null);
  const [emailed, setEmailed] = useState<"sent" | "not_configured" | "failed" | null>(null);
  const resend = useIntegration(accountId, "resend");
  const canEmail = resend.data?.status === "connected";

  function close(next: boolean) {
    if (!next) {
      setEmail("");
      setRole("agent");
      setLink(null);
      setEmailed(null);
    }
    onOpenChange(next);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      toast.error("E-mail inválido");
      return;
    }
    create.mutate(
      { email: parsed.data, role },
      {
        onSuccess: (invite) => {
          setLink(inviteLink(invite.token));
          // Issue #4: com o Resend conectado, o convite já sai por e-mail; o link continua para copiar.
          emailApi<{ ok: boolean; sent: boolean }>(accountId, "invite", { inviteId: invite.id })
            .then((r) => {
              setEmailed(r.sent ? "sent" : "not_configured");
              toast.success(r.sent ? `Convite enviado para ${invite.email}` : "Convite criado");
            })
            .catch(() => {
              setEmailed("failed");
              toast.success("Convite criado (o e-mail não saiu; copie o link)");
            });
        },
        onError: (err) => toast.error(errorMessage(err)),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90dvh] max-w-md overflow-y-auto rounded-xl bg-surface">
        <DialogHeader>
          <DialogTitle>{link ? "Envie este link" : "Convidar pessoa"}</DialogTitle>
          <DialogDescription>
            {link
              ? emailed === "sent"
                ? `Enviamos o convite para ${email.trim()}. Se preferir, mande também este link. Vale por 3 dias e só uma vez.`
                : `Mande para ${email.trim()} pelo WhatsApp ou e-mail. Vale por 3 dias e só uma vez.`
              : "A pessoa entra com o e-mail convidado."}
          </DialogDescription>
        </DialogHeader>
        <p className="flex gap-2 rounded-lg border border-note-line bg-note px-3 py-2 text-[12px] text-note-fg">
          <MailWarning className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {canEmail
            ? "O convite sai por e-mail pelo Resend da empresa. O link também fica disponível para copiar."
            : "Sem o Resend conectado (Ajustes › Integrações), o convite não sai por e-mail: copie o link e mande você mesmo."}
        </p>
        {link ? (
          <>
            <CopyField label="Link do convite" value={link} />
            <DialogFooter>
              <Button onClick={() => close(false)}>Concluir</Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="invite-email">E-mail</Label>
              <Input
                id="invite-email"
                type="email"
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>
            <fieldset className="space-y-1.5">
              <legend className="mb-1.5 text-[13px] font-medium">Papel</legend>
              <RadioGroup
                value={role}
                onValueChange={(v) => isAssignableRole(v) && setRole(v)}
                className="gap-2"
              >
                {ASSIGNABLE_ROLES.map((r) => (
                  <Label
                    key={r}
                    htmlFor={`invite-role-${r}`}
                    className={cn(
                      "flex cursor-pointer items-start gap-2 rounded-lg border border-border p-2.5 hover:bg-surface-2",
                      role === r && "border-primary-line bg-primary-soft",
                    )}
                  >
                    <RadioGroupItem id={`invite-role-${r}`} value={r} className="mt-0.5" />
                    <span>
                      <span className="block text-[13px] font-medium">{ROLE_INFO[r].label}</span>
                      <span className="block text-[12px] font-normal text-muted-foreground">
                        {ROLE_INFO[r].description}
                      </span>
                    </span>
                  </Label>
                ))}
              </RadioGroup>
            </fieldset>
            <DialogFooter>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending && <Loader2 className="animate-spin" aria-hidden />}
                Criar convite
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
