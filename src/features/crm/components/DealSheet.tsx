import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ExternalLink, Loader2, Mail, Trash2, Zap } from "lucide-react";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { useAccount } from "@/lib/account";
import { errorMessage } from "@/lib/functions";
import { formatMoney } from "@/lib/format";
import { ContactPicker, type PickedContact } from "@/features/contacts/components/ContactPicker";
import { CallButton } from "@/features/telephony/softphone/CallButton";
import { OwnerSelect } from "@/features/contacts/components/OwnerSelect";
import type { TeamMember } from "@/features/contacts/types";

import { useDeleteDeal, useUpdateDeal } from "../api";
import { moneyInputValue, parseMoneyInput } from "../money";
import { stageKind, type BoardDeal, type Stage } from "../types";
import { DealRoom } from "./DealRoom";
import { DealTimeline } from "./DealTimeline";
import { DealItemsEditor } from "@/features/opportunity/DealItemsEditor";
import { EmailComposerDialog } from "@/features/email/EmailComposerDialog";
import { hasChannel } from "@/lib/edition";
import { EnrollDialog } from "@/features/automations/EnrollDialog";
import { DealCommercialBlock } from "@/features/commerce/DealCommercialBlock";

type Props = {
  accountId: string;
  deal: BoardDeal | undefined;
  stages: Stage[];
  members: TeamMember[];
  memberMap: Map<string, TeamMember>;
  onClose: () => void;
};

export function DealSheet({ deal, onClose, ...rest }: Props) {
  return (
    <Sheet open={Boolean(deal)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-xl">
        {deal && <DealSheetBody key={deal.id} deal={deal} onClose={onClose} {...rest} />}
      </SheetContent>
    </Sheet>
  );
}

function toPicked(deal: BoardDeal): PickedContact | null {
  const c = deal.contact;
  return c ? { id: c.id, name: c.name, source: c.source, avatarUrl: c.avatar_url } : null;
}

function DealSheetBody({
  accountId,
  deal,
  stages,
  members,
  memberMap,
  onClose,
}: Props & { deal: BoardDeal }) {
  const { isManager } = useAccount();
  const update = useUpdateDeal(accountId);
  const remove = useDeleteDeal(accountId);
  const [title, setTitle] = useState(deal.title);
  const [value, setValue] = useState(moneyInputValue(Number(deal.value)));
  const [stageId, setStageId] = useState(deal.stage_id);
  const [ownerId, setOwnerId] = useState(deal.owner_user_id);
  const [enrolling, setEnrolling] = useState(false);
  const [closeDate, setCloseDate] = useState(deal.expected_close_date ?? "");
  const [contact, setContact] = useState<PickedContact | null>(toPicked(deal));
  const [lostReason, setLostReason] = useState(deal.lost_reason ?? "");
  const [emailing, setEmailing] = useState(false);

  const byItems = deal.value_source === "items";
  const stage = stages.find((s) => s.id === stageId);
  const isLost = stageKind(stage) === "lost";
  const parsedValue = parseMoneyInput(value);
  const titleError = !title.trim() ? "Dê um nome ao negócio" : null;
  const lostError = isLost && !lostReason.trim() ? "Conte por que perdemos" : null;
  const valueError = parsedValue === null ? "Valor inválido" : null;
  const invalid = Boolean(titleError || lostError || valueError);

  async function save() {
    if (invalid || parsedValue === null) return;
    const patch: TablesUpdate<"deals"> = {
      title: title.trim().slice(0, 160),
      ...(byItems ? {} : { value: parsedValue }),
      owner_user_id: ownerId,
      expected_close_date: closeDate || null,
      contact_id: contact?.id ?? null,
      lost_reason: isLost ? lostReason.trim().slice(0, 500) : deal.lost_reason,
    };
    if (stageId !== deal.stage_id) {
      patch.stage_id = stageId;
      // Mudou de etapa pelo formulário: vai para o fim da coluna (segundos desde 1970 > qualquer posição do quadro).
      patch.position = Date.now() / 1000;
    }
    try {
      await update.mutateAsync({ id: deal.id, patch });
      toast.success("Negócio salvo");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function destroy() {
    try {
      await remove.mutateAsync(deal.id);
      toast.success("Negócio excluído");
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <>
      <SheetHeader className="border-b border-border p-5 text-left">
        <SheetTitle className="pr-8 font-display text-xl font-medium">{deal.title}</SheetTitle>
        <SheetDescription className="flex items-baseline gap-3 font-display text-[15px] font-semibold text-foreground tabular-nums">
          {formatMoney(deal.value)}
          {Number(deal.potential_value) > Number(deal.value) && (
            <span className="font-sans text-[12px] font-normal text-muted-foreground">
              potencial {formatMoney(deal.potential_value)}
            </span>
          )}
        </SheetDescription>
      </SheetHeader>

      <form
        className="grid gap-4 border-b border-border p-5 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        noValidate
      >
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="deal-title">Título</Label>
          <Input
            id="deal-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-invalid={Boolean(titleError)}
          />
          {titleError && <p className="text-[12px] text-danger">{titleError}</p>}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="deal-value">Valor (R$)</Label>
          <Input
            id="deal-value"
            inputMode="decimal"
            value={byItems ? moneyInputValue(Number(deal.value)) : value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="0"
            disabled={byItems}
            aria-invalid={Boolean(valueError)}
          />
          {byItems ? (
            <p className="text-[12px] text-subtle">Calculado pelos itens aceitos abaixo.</p>
          ) : (
            valueError && <p className="text-[12px] text-danger">{valueError}</p>
          )}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="deal-stage">Etapa</Label>
          <Select value={stageId} onValueChange={setStageId}>
            <SelectTrigger id="deal-stage" className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {stages.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {isLost && (
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="deal-lost">Motivo da perda</Label>
            <Textarea
              id="deal-lost"
              value={lostReason}
              onChange={(e) => setLostReason(e.target.value)}
              aria-invalid={Boolean(lostError)}
            />
            {lostError && <p className="text-[12px] text-danger">{lostError}</p>}
          </div>
        )}
        <div className="grid gap-1.5">
          <Label htmlFor="deal-owner">Dono</Label>
          <OwnerSelect id="deal-owner" members={members} value={ownerId} onChange={setOwnerId} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="deal-close">Previsão de fechamento</Label>
          <Input
            id="deal-close"
            type="date"
            value={closeDate}
            onChange={(e) => setCloseDate(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="deal-contact">Contato</Label>
          <ContactPicker
            id="deal-contact"
            accountId={accountId}
            value={contact}
            onChange={setContact}
          />
          {contact && (
            <Link
              to="/contatos/$contactId"
              params={{ contactId: contact.id }}
              className="inline-flex items-center gap-1 text-[12px] text-primary hover:underline"
            >
              Abrir contato <ExternalLink className="size-3" aria-hidden />
            </Link>
          )}
          {contact && (
            <div className="flex flex-wrap items-center gap-3">
              {hasChannel("email") && (
                <button
                  type="button"
                  onClick={() => setEmailing(true)}
                  className="inline-flex w-fit items-center gap-1 text-[12px] text-primary hover:underline"
                >
                  <Mail className="size-3" aria-hidden /> Enviar e-mail sobre este negócio
                </button>
              )}
              <CallButton contactId={contact.id} name={contact.name} size="sm" variant="ghost" />
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 sm:col-span-2">
          {isManager ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="ghost" className="text-danger hover:text-danger">
                  <Trash2 aria-hidden /> Excluir
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir este negócio?</AlertDialogTitle>
                  <AlertDialogDescription>
                    A linha do tempo dele também some. Para registrar que não fechou, mova para
                    “Perdido”.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => void destroy()}>Excluir</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <span />
          )}
          <Button type="submit" disabled={invalid || update.isPending}>
            {update.isPending && <Loader2 className="animate-spin" aria-hidden />}
            Salvar alterações
          </Button>
        </div>
      </form>

      <div className="border-b border-border p-5">
        <DealRoom accountId={accountId} deal={deal} />
      </div>

      <div className="border-b border-border p-5">
        <DealItemsEditor accountId={accountId} dealId={deal.id} contactId={deal.contact_id} />
      </div>

      <EmailComposerDialog
        accountId={accountId}
        open={emailing}
        onOpenChange={setEmailing}
        contactId={contact?.id ?? null}
        dealId={deal.id}
        toName={contact?.name ?? null}
      />
      {deal.contact_id && (
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
          <p className="text-[12px] text-muted-foreground">
            Cadência de vendas: toques automáticos até o contato responder.
          </p>
          <Button type="button" size="sm" variant="outline" onClick={() => setEnrolling(true)}>
            <Zap /> Inscrever
          </Button>
          <EnrollDialog
            accountId={accountId}
            open={enrolling}
            onOpenChange={setEnrolling}
            dealId={deal.id}
          />
        </div>
      )}
      <div className="border-b border-border p-5">
        <DealCommercialBlock accountId={accountId} deal={deal} />
      </div>

      <div className="p-5">
        <DealTimeline
          accountId={accountId}
          dealId={deal.id}
          contactId={deal.contact_id}
          members={memberMap}
        />
      </div>
    </>
  );
}
