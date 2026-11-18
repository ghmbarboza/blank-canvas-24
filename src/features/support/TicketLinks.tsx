import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { GitBranch, Handshake, Package, Siren, X } from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAccount } from "@/lib/account";
import { callApi } from "@/lib/api";
import { errorMessage } from "@/lib/functions";

import { useUpdateTicket, type TicketRow } from "./api";

const NONE = "__none__";

// Central de CSs do chamado: pai/filho, negócio, pedido e incidente (o artigo da base tem cartão próprio).
export function TicketLinks({ accountId, ticket: t }: { accountId: string; ticket: TicketRow }) {
  const { isManager } = useAccount();
  const update = useUpdateTicket(accountId);
  const [order, setOrder] = useState(t.order_ref ?? "");
  const [parentNumber, setParentNumber] = useState("");

  const children = useQuery({
    queryKey: ["support", accountId, "children", t.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tickets")
        .select("id, number, subject, status")
        .eq("account_id", accountId)
        .eq("parent_ticket_id", t.id)
        .order("number");
      if (error) throw error;
      return data ?? [];
    },
  });
  const parent = useQuery({
    queryKey: ["support", accountId, "parent", t.parent_ticket_id],
    enabled: Boolean(t.parent_ticket_id),
    queryFn: async () => {
      const { data } = await supabase
        .from("tickets")
        .select("id, number, subject")
        .eq("id", t.parent_ticket_id!)
        .maybeSingle();
      return data;
    },
  });
  const deals = useQuery({
    queryKey: ["support", accountId, "deals-of", t.contact_id],
    enabled: Boolean(t.contact_id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deals")
        .select("id, title, status")
        .eq("account_id", accountId)
        .eq("contact_id", t.contact_id!)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });
  const incident = useQuery({
    queryKey: ["support", accountId, "ticket-incident", t.incident_id],
    enabled: Boolean(t.incident_id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("incidents")
        .select("id, title, status")
        .eq("account_id", accountId)
        .eq("id", t.incident_id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const patch = (p: Parameters<typeof update.mutate>[0]["patch"], ok?: string) =>
    update.mutate(
      { id: t.id, patch: p },
      {
        onSuccess: () => ok && toast.success(ok),
        onError: (e) => toast.error(errorMessage(e)),
      },
    );

  async function setParent() {
    const n = Number(parentNumber.replace(/\D/g, ""));
    if (!n) return;
    const { data } = await supabase
      .from("tickets")
      .select("id")
      .eq("account_id", accountId)
      .eq("number", n)
      .maybeSingle();
    if (!data) {
      toast.error(`Não achei o chamado #${n}`);
      return;
    }
    patch({ parent_ticket_id: data.id }, `Ligado ao chamado #${n}`);
    setParentNumber("");
  }

  return (
    <section
      className="mb-5 grid gap-2 rounded-2xl border border-border bg-surface p-3 text-[12px]"
      aria-label="Central de CSs"
    >
      <div className="flex flex-wrap items-center gap-2">
        <GitBranch className="size-3.5 text-muted-foreground" aria-hidden />
        {t.parent_ticket_id ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-[3px]">
            Filho de #{parent.data?.number ?? "…"} {parent.data?.subject}
            <button
              type="button"
              onClick={() => patch({ parent_ticket_id: null }, "Central de CS removido")}
              aria-label="Desligar do chamado pai"
            >
              <X className="size-3" />
            </button>
          </span>
        ) : (
          <form
            className="flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              void setParent();
            }}
          >
            <Input
              value={parentNumber}
              onChange={(e) => setParentNumber(e.target.value)}
              placeholder="Chamado pai #"
              className="h-7 w-32 text-[12px]"
              aria-label="Número do chamado pai"
            />
          </form>
        )}
        {(children.data ?? []).map((c) => (
          <span key={c.id} className="rounded-full bg-surface-2 px-2 py-[3px]" title={c.subject}>
            Filho #{c.number}
          </span>
        ))}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex items-center gap-2">
          <Handshake className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <Select
            value={t.deal_id ?? NONE}
            onValueChange={(v) => patch({ deal_id: v === NONE ? null : v }, "Negócio ligado")}
            disabled={!t.contact_id}
          >
            <SelectTrigger className="h-7 text-[12px]" aria-label="Negócio ligado">
              <SelectValue
                placeholder={t.contact_id ? "Ligar a um negócio" : "Chamado sem contato"}
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Sem negócio</SelectItem>
              {(deals.data ?? []).map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            patch({ order_ref: order.trim().slice(0, 80) || null }, "Pedido salvo");
          }}
        >
          <Package className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <Input
            value={order}
            onChange={(e) => setOrder(e.target.value)}
            onBlur={() =>
              order !== (t.order_ref ?? "") &&
              patch({ order_ref: order.trim().slice(0, 80) || null })
            }
            placeholder="Número do pedido"
            className="h-7 text-[12px]"
            aria-label="Número do pedido"
          />
        </form>
      </div>

      {incident.data && (
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/incidentes"
            className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-[3px] text-primary hover:underline"
          >
            <Siren className="size-3" aria-hidden /> Incidente: {incident.data.title}
          </Link>
        </div>
      )}
    </section>
  );
}
