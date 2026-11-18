import { hasChannel } from "@/lib/edition";
import { useState } from "react";
import { Loader2, Phone } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useAccountId } from "@/lib/account";
import { errorMessage } from "@/lib/functions";

import { telephonyApi } from "../api";
import { useSoftphone } from "./softphone-context";

interface Props {
  contactId?: string | null;
  phone?: string | null;
  name?: string | null;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "icon";
  label?: string;
}

// Clicar para ligar: usa o telefone do navegador quando montado; senão, só o callback da Zadarma.
function CallButtonImpl({
  contactId = null,
  phone = null,
  name = null,
  variant = "outline",
  size = "default",
  label = "Ligar",
}: Props) {
  const sp = useSoftphone();
  const accountId = useAccountId();
  const [busy, setBusy] = useState(false);
  const disabled = (!phone && !contactId) || busy || Boolean(sp?.dialing);

  async function click() {
    if (sp) return sp.dial({ contactId, phone, name });
    setBusy(true);
    try {
      const r = await telephonyApi.callback(accountId, { contactId, phone });
      toast.success(`Atenda no ${r.from}; em seguida ligamos para ${name ?? r.to}.`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={() => void click()}
      disabled={disabled}
      title={
        phone || contactId
          ? `Ligar para ${name ?? phone ?? "o contato"}`
          : "Sem telefone cadastrado"
      }
      aria-label={size === "icon" ? label : undefined}
    >
      {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Phone aria-hidden />}
      {size !== "icon" && label}
    </Button>
  );
}

/** Só aparece quando a edição tem o canal (ver src/lib/edition.ts). */
export function CallButton(props: Parameters<typeof CallButtonImpl>[0]) {
  return hasChannel("phone") ? <CallButtonImpl {...props} /> : null;
}
