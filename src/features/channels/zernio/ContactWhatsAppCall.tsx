import { Loader2, ShieldQuestion } from "lucide-react";
import { BrandIcon } from "@/components/brand/BrandIcon";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/functions";

import { useAskPermission, useCallOnWhatsApp, useCallPermission } from "../zernio-api";

const EXPIRED = (iso: string | null) => Boolean(iso && new Date(iso).getTime() < Date.now());

/**
 * Ligação pelo WhatsApp para um contato: pede a permissão no chat (exigência do WhatsApp) e,
 * com ela concedida, liga. Montável na ficha do contato e no cabeçalho da conversa.
 */
export function ContactWhatsAppCall({
  accountId,
  contactId,
  channelId,
}: {
  accountId: string;
  contactId: string;
  channelId: string;
}) {
  const perm = useCallPermission(accountId, contactId);
  const ask = useAskPermission(accountId, contactId);
  const call = useCallOnWhatsApp(accountId, contactId);
  const p = perm.data;
  const granted = p?.status === "granted" && (p.is_permanent || !EXPIRED(p.expires_at));

  if (perm.isLoading)
    return (
      <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Carregando" />
    );

  if (granted)
    return (
      <Button
        size="sm"
        variant="outline"
        disabled={call.isPending}
        onClick={() =>
          call.mutate(channelId, {
            onSuccess: () => toast.success("Chamando no WhatsApp do cliente…"),
            onError: (err) => toast.error(errorMessage(err)),
          })
        }
      >
        {call.isPending ? (
          <Loader2 className="animate-spin" aria-hidden />
        ) : (
          <BrandIcon id="whatsapp" size={16} />
        )}
        Ligar pelo WhatsApp
      </Button>
    );

  return (
    <div className="flex flex-col gap-1">
      <Button
        size="sm"
        variant="outline"
        disabled={ask.isPending || p?.status === "requested"}
        onClick={() =>
          ask.mutate(channelId, {
            onSuccess: (r) =>
              toast.success(
                r.status === "granted"
                  ? "O cliente já permite ligação. Pode ligar."
                  : "Pedido enviado no WhatsApp. Avisamos quando o cliente responder.",
              ),
            onError: (err) => toast.error(errorMessage(err)),
          })
        }
      >
        {ask.isPending ? (
          <Loader2 className="animate-spin" aria-hidden />
        ) : (
          <ShieldQuestion aria-hidden />
        )}
        {p?.status === "requested" ? "Permissão pedida" : "Pedir permissão para ligar"}
      </Button>
      {p?.status === "rejected" && (
        <span className="text-[11px] text-muted-foreground">
          O cliente recusou. Dá para pedir de novo amanhã.
        </span>
      )}
    </div>
  );
}
