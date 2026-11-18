import { useState } from "react";
import { Check, Copy, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/functions";
import { formatRelative } from "@/lib/format";
import { inviteLink, usePendingInvites, useRevokeInvite, type Invite } from "./api";
import { ROLE_INFO } from "./roles";
import { SettingsCard } from "./SettingsCard";

export function PendingInvites({ accountId }: { accountId: string }) {
  const invites = usePendingInvites(accountId, true);
  const revoke = useRevokeInvite(accountId);
  const [target, setTarget] = useState<Invite | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function copy(invite: Invite) {
    try {
      await navigator.clipboard.writeText(inviteLink(invite.token));
      setCopiedId(invite.id);
      toast.success("Link copiado");
      window.setTimeout(() => setCopiedId(null), 1800);
    } catch {
      toast.error("Não deu para copiar o link");
    }
  }

  function confirmRevoke() {
    if (!target) return;
    const invite = target;
    setTarget(null);
    revoke.mutate(invite.id, {
      onSuccess: () => toast.success(`Convite de ${invite.email} revogado`),
      onError: (err) => toast.error(errorMessage(err)),
    });
  }

  if (invites.isLoading) return null;
  const list = invites.data ?? [];

  return (
    <SettingsCard title="Convites pendentes" description="Quem foi convidado e ainda não entrou.">
      {invites.isError && <p className="text-[13px] text-danger">{errorMessage(invites.error)}</p>}
      {list.length === 0 && !invites.isError && (
        <p className="text-[13px] text-muted-foreground">Nenhum convite esperando resposta.</p>
      )}
      {list.length > 0 && (
        <ul className="divide-y divide-border">
          {list.map((inv) => {
            const expired = new Date(inv.expires_at).getTime() < Date.now();
            return (
              <li key={inv.id} className="flex flex-wrap items-center gap-3 py-3 sm:flex-nowrap">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium">{inv.email}</p>
                  <p className="text-[12px] text-muted-foreground">
                    {ROLE_INFO[inv.role].label} ·{" "}
                    {expired ? (
                      <span className="text-danger">expirou {formatRelative(inv.expires_at)}</span>
                    ) : (
                      `expira ${formatRelative(inv.expires_at)}`
                    )}
                  </p>
                </div>
                {!expired && (
                  <Button variant="outline" size="sm" onClick={() => void copy(inv)}>
                    {copiedId === inv.id ? (
                      <Check className="text-foreground" aria-hidden />
                    ) : (
                      <Copy aria-hidden />
                    )}
                    Copiar link
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setTarget(inv)}
                  disabled={revoke.isPending && revoke.variables === inv.id}
                >
                  {revoke.isPending && revoke.variables === inv.id ? (
                    <Loader2 className="animate-spin" aria-hidden />
                  ) : (
                    <X aria-hidden />
                  )}
                  {expired ? "Apagar" : "Revogar"}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      <AlertDialog open={Boolean(target)} onOpenChange={(o) => !o && setTarget(null)}>
        <AlertDialogContent className="rounded-xl bg-surface">
          <AlertDialogHeader>
            <AlertDialogTitle>Revogar o convite de {target?.email}?</AlertDialogTitle>
            <AlertDialogDescription>
              O link para de funcionar na hora. Dá para convidar de novo depois.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRevoke}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Revogar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsCard>
  );
}
