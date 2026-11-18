import { hasChannel } from "@/lib/edition";
import { useState } from "react";
import { Bot, Loader2 } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useIntegrationEnabled } from "@/features/integrations/api";
import { useAccount, useAccountId } from "@/lib/account";
import { errorMessage } from "@/lib/functions";

import { telephonyApi } from "./api";

type Props = {
  contactId: string;
  phone: string | null;
  name: string | null;
};

// A IA de voz liga para o contato com o motivo dito aqui. Transcrição, resumo e tudo o que ela
// fizer na ligação (agendar, abrir chamado, criar negócio, tarefa) voltam para esta ficha.
function AiCallButtonImpl({ contactId, phone, name }: Props) {
  const accountId = useAccountId();
  const [isOpen, setIsOpen] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [isSending, setIsSending] = useState(false);
  const { isManager } = useAccount();
  const voiceOn = useIntegrationEnabled(accountId, "elevenlabs");
  const who = name ?? phone ?? "o contato";

  async function handleSubmit() {
    setIsSending(true);
    try {
      await telephonyApi.callContact(accountId, contactId, motivo);
      toast.success(`A IA vai ligar para ${who} agora. O resultado aparece aqui na ficha.`);
      setIsOpen(false);
      setMotivo("");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setIsSending(false);
    }
  }

  // Ligação pela IA consome minutos pagos: só gestor ou administrador (o servidor confere também).
  // Sem a ElevenLabs a IA de voz não existe: o botão some em vez de falhar no clique.
  if (!isManager || voiceOn === false) return null;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setIsOpen(true)}
        disabled={!phone}
        title={phone ? `A IA de voz liga para ${who}` : "Sem telefone cadastrado"}
      >
        <Bot aria-hidden /> Ligar com IA
      </Button>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>IA de voz liga para {who}</DialogTitle>
            <DialogDescription>
              Ela se apresenta, fala do motivo e combina o próximo passo. A ligação, a transcrição e
              tudo o que ela fizer ficam nesta ficha.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="ai-call-motivo">Motivo da ligação</Label>
            <Textarea
              id="ai-call-motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: lembrar a revisão anual e oferecer um horário"
              rows={3}
              maxLength={400}
            />
            <p className="text-[12px] text-muted-foreground">
              Vazio: ela apresenta a empresa e descobre se faz sentido para a pessoa.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)} disabled={isSending}>
              Cancelar
            </Button>
            <Button onClick={() => void handleSubmit()} disabled={isSending}>
              {isSending && <Loader2 className="animate-spin" aria-hidden />}
              Ligar agora
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Só aparece quando a edição tem o canal (ver src/lib/edition.ts). */
export function AiCallButton(props: Parameters<typeof AiCallButtonImpl>[0]) {
  return hasChannel("phone") ? <AiCallButtonImpl {...props} /> : null;
}
