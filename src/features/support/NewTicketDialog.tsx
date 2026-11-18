import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useTeamMembers } from "@/features/contacts/api";
import { ContactPicker, type PickedContact } from "@/features/contacts/components/ContactPicker";
import { OwnerSelect } from "@/features/contacts/components/OwnerSelect";
import { errorMessage } from "@/lib/functions";

import { useCreateTicket } from "./api";
import { PRIORITY_LABEL, PRIORITY_ORDER } from "./constants";

interface Props {
  accountId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaults?: {
    subject?: string;
    description?: string;
    contact?: PickedContact | null;
    conversationId?: string | null;
    source?: string;
  };
  onCreated?: (id: string) => void;
}

// Novo chamado: da tela de atendimento, da conversa ou da ficha do contato.
export function NewTicketDialog({ accountId, open, onOpenChange, defaults, onCreated }: Props) {
  const create = useCreateTicket(accountId);
  const team = useTeamMembers(accountId);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("normal");
  const [category, setCategory] = useState("");
  const [contact, setContact] = useState<PickedContact | null>(null);
  const [owner, setOwner] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSubject(defaults?.subject ?? "");
    setDescription(defaults?.description ?? "");
    setContact(defaults?.contact ?? null);
    setPriority("normal");
    setCategory("");
    setOwner(null);
    // Os valores iniciais valem na abertura; re-render do pai não pode apagar o que a pessoa digitou.
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim()) {
      toast.error("Descreva o assunto do chamado");
      return;
    }
    try {
      const id = await create.mutateAsync({
        subject: subject.trim(),
        description: description.trim() || null,
        contactId: contact?.id ?? null,
        conversationId: defaults?.conversationId ?? null,
        priority,
        source: defaults?.source ?? (defaults?.conversationId ? "conversation" : "manual"),
        category: category.trim() || null,
        ownerUserId: owner,
      });
      toast.success("Chamado aberto");
      onCreated?.(id);
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={(e) => void submit(e)}>
          <DialogHeader>
            <DialogTitle>Novo chamado</DialogTitle>
            <DialogDescription>
              O prazo de resposta e de solução sai da política de SLA da prioridade escolhida.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="tk-subject">Assunto</Label>
              <Input
                id="tk-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Ex.: Não consigo emitir a segunda via"
                autoFocus
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="tk-desc">Detalhes</Label>
              <Textarea
                id="tk-desc"
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>Prioridade</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger aria-label="Prioridade">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITY_ORDER.map((p) => (
                      <SelectItem key={p} value={p}>
                        {PRIORITY_LABEL[p]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="tk-cat">Categoria</Label>
                <Input
                  id="tk-cat"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="Financeiro, acesso, entrega…"
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Cliente</Label>
                <ContactPicker accountId={accountId} value={contact} onChange={setContact} />
              </div>
              <div className="grid gap-1.5">
                <Label>Responsável</Label>
                <OwnerSelect
                  members={team.data ?? []}
                  value={owner}
                  onChange={setOwner}
                  aria-label="Responsável"
                />
              </div>
            </div>
          </div>
          <DialogFooter className="mt-6">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending && <Loader2 className="animate-spin" />} Abrir chamado
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
