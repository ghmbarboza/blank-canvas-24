import { useState } from "react";
import { Loader2, X } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ContactPicker, type PickedContact } from "@/features/contacts/components/ContactPicker";
import { useWhatsAppPricing } from "@/features/inbox/useWhatsAppPricing";
import { flowCostPerContact, formatBRL, formatUnitBRL } from "@/features/inbox/whatsapp-pricing";
import { useSegmentCount, useSegments } from "@/features/segments/api";
import { errorMessage } from "@/lib/functions";

import { useActiveAutomations, useAutomation, useAutomationAction } from "./api";

interface Props {
  accountId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Contatos já escolhidos (ação em lote da lista). */
  contactIds?: string[];
  /** Inscrição a partir de um negócio. */
  dealId?: string | null;
  /** Abrindo de dentro de uma automação: o alvo já está escolhido. */
  fixedAutomationId?: string;
  onDone?: () => void;
}

// Inscrever contatos numa automação ativa: pela lista, por segmento, por negócio ou buscando um a um.
export function EnrollDialog({
  accountId,
  open,
  onOpenChange,
  contactIds,
  dealId,
  fixedAutomationId,
  onDone,
}: Props) {
  const autos = useActiveAutomations(accountId);
  const segments = useSegments(accountId);
  const action = useAutomationAction(accountId);
  const [automationId, setAutomationId] = useState<string>("");
  const [segmentId, setSegmentId] = useState<string>("");
  const [picked, setPicked] = useState<PickedContact[]>([]);
  const target = fixedAutomationId ?? automationId;
  const preset = (contactIds?.length ?? 0) > 0 || Boolean(dealId);
  const pricing = useWhatsAppPricing();
  const flow = useAutomation(target);
  const segment = (segments.data ?? []).find((s) => s.id === segmentId) ?? null;
  const segCount = useSegmentCount(accountId, segment?.filter ?? null, Boolean(segment));
  const perContact = flow.data
    ? flowCostPerContact(pricing, Object.values(flow.data.graph.nodes))
    : 0;
  const recipients = preset
    ? dealId
      ? 1
      : (contactIds?.length ?? 0)
    : picked.length + (segment ? (segCount.data ?? 0) : 0);

  function submit() {
    if (!target) {
      toast.error("Escolha a automação");
      return;
    }
    const ids = preset ? (contactIds ?? []) : picked.map((p) => p.id);
    if (!preset && !segmentId && ids.length === 0) {
      toast.error("Escolha um segmento ou alguns contatos");
      return;
    }
    action.mutate(
      {
        action: "enroll",
        automationId: target,
        ...(ids.length ? { contactIds: ids } : {}),
        ...(segmentId ? { segmentId } : {}),
        ...(dealId ? { dealId } : {}),
      },
      {
        onSuccess: (r) => {
          const res = r as { enrolled: number; skipped: number };
          toast.success(
            `${res.enrolled} inscrito(s)${res.skipped ? ` · ${res.skipped} já estavam ou já passaram por ela` : ""}`,
          );
          setPicked([]);
          setSegmentId("");
          onOpenChange(false);
          onDone?.();
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Inscrever em automação</DialogTitle>
          <DialogDescription>
            {preset
              ? dealId
                ? "O contato do negócio começa a cadência agora. Se ele responder, a cadência pausa sozinha."
                : `${contactIds?.length} contato(s) selecionado(s) começam agora.`
              : "Escolha um segmento inteiro ou contatos específicos."}
          </DialogDescription>
        </DialogHeader>
        <div className="mt-2 grid gap-4">
          {!fixedAutomationId && (
            <div className="grid gap-1.5">
              <Label>Automação ou cadência</Label>
              <Select value={automationId} onValueChange={setAutomationId}>
                <SelectTrigger aria-label="Automação">
                  <SelectValue
                    placeholder={autos.data?.length ? "Escolha" : "Nenhuma automação ativa"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {(autos.data ?? []).map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name} {a.kind === "sequence" ? "· cadência" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {!preset && (
            <>
              <div className="grid gap-1.5">
                <Label>Segmento inteiro</Label>
                <Select
                  value={segmentId || "__none"}
                  onValueChange={(v) => setSegmentId(v === "__none" ? "" : v)}
                >
                  <SelectTrigger aria-label="Segmento">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Nenhum</SelectItem>
                    {(segments.data ?? []).map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Ou contatos específicos</Label>
                <ContactPicker
                  accountId={accountId}
                  value={null}
                  onChange={(c) =>
                    c && !picked.some((p) => p.id === c.id) && setPicked((s) => [...s, c])
                  }
                />
                {picked.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {picked.map((p) => (
                      <span
                        key={p.id}
                        className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-[12px]"
                      >
                        {p.name ?? "Contato"}
                        <button
                          type="button"
                          aria-label="Remover"
                          onClick={() => setPicked((s) => s.filter((x) => x.id !== p.id))}
                        >
                          <X className="size-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
        {perContact > 0 && recipients > 0 && (
          <p className="mt-3 rounded-xl bg-surface-2 px-3 py-2 text-[12px] text-muted-foreground">
            Custo estimado no WhatsApp: {recipients} contato(s) × até {formatUnitBRL(perContact)} ={" "}
            <strong className="text-foreground">até {formatBRL(recipients * perContact)}</strong>
            {segment && segCount.isPending ? " (contando o segmento…)" : ""}. Quem já passou pela
            automação não é inscrito de novo e não conta.
          </p>
        )}
        <DialogFooter className="mt-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={action.isPending}>
            {action.isPending && <Loader2 className="animate-spin" />} Inscrever
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
