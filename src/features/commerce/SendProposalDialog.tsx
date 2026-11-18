import { useEffect, useState } from "react";
import { Copy, Loader2, MessageCircle, Send } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { errorMessage } from "@/lib/functions";

import { proposalLink, useSendProposal, type Proposal } from "./api";

interface Props {
  accountId: string;
  dealId: string;
  proposal: Proposal | null;
  onClose: () => void;
}

// Enviar a proposta: e-mail (pelo módulo de e-mail) e/ou WhatsApp com o link pronto.
export function SendProposalDialog({ accountId, dealId, proposal, onClose }: Props) {
  const send = useSendProposal(accountId, dealId);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!proposal) return;
    setMessage("");
    if (!proposal.contact_id) {
      setEmail("");
      setPhone("");
      return;
    }
    void supabase
      .from("contacts")
      .select("email, phone")
      .eq("id", proposal.contact_id)
      .maybeSingle()
      .then(({ data }) => {
        setEmail(data?.email ?? "");
        setPhone(data?.phone ?? "");
      });
  }, [proposal]);
  if (!proposal) return null;
  const link = proposalLink(proposal.token);
  const waText = encodeURIComponent(
    `${message || `Olá! Segue a proposta "${proposal.title}".`} ${link}`,
  );
  const waPhone = phone.replace(/\D/g, "");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const r = await send.mutateAsync({
        proposalId: proposal!.id,
        ...(email ? { email } : {}),
        ...(message ? { message } : {}),
      });
      toast.success(
        r.emailed
          ? `Proposta enviada para ${email}`
          : "Proposta marcada como enviada. Mande o link pelo canal que preferir.",
      );
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <Dialog open={Boolean(proposal)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form onSubmit={(e) => void submit(e)}>
          <DialogHeader>
            <DialogTitle>Enviar proposta nº {proposal.number}</DialogTitle>
            <DialogDescription>
              Você recebe um aviso quando o cliente abrir e quando aceitar.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="sp-email">E-mail do cliente</Label>
              <Input
                id="sp-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="cliente@empresa.com.br"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sp-msg">Mensagem (opcional)</Label>
              <Textarea
                id="sp-msg"
                rows={3}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Conforme combinamos na reunião, segue a proposta…"
              />
            </div>
            <div className="flex gap-2">
              <Input
                readOnly
                value={link}
                className="font-mono text-[12px]"
                aria-label="Link da proposta"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  void navigator.clipboard.writeText(link).then(() => toast.success("Link copiado"))
                }
              >
                <Copy />
              </Button>
            </div>
          </div>
          <DialogFooter className="mt-6 gap-2">
            {waPhone && (
              <Button type="button" variant="outline" asChild>
                <a
                  href={`https://wa.me/${waPhone.length <= 11 ? `55${waPhone}` : waPhone}?text=${waText}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessageCircle /> WhatsApp
                </a>
              </Button>
            )}
            <Button type="submit" disabled={send.isPending}>
              {send.isPending ? <Loader2 className="animate-spin" /> : <Send />}{" "}
              {email ? "Enviar por e-mail" : "Marcar como enviada"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
