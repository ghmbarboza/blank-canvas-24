import { useState } from "react";
import { BrandIcon } from "@/components/brand/BrandIcon";
import {
  ArrowDownToLine,
  ExternalLink,
  Loader2,
  Lock,
  PhoneCall,
  RefreshCw,
  ShoppingCart,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/functions";
import { formatPhone } from "@/lib/format";
import { cn } from "@/lib/utils";

import { isConnected, useIntegrations } from "../api";
import { useSyncNumbers, useZernioNumbers, type ZernioNumber } from "../zernio-api";
import { parseForwardTo } from "../zernio-rules";
import { BuyNumberDialog } from "./BuyNumberDialog";
import { NumberHealthPanel } from "./NumberHealthPanel";
import { PortNumberDialog } from "./PortNumberDialog";
import { VoiceDialog } from "./VoiceDialog";
import { ZernioWebCall } from "./ZernioWebCall";

const STATUS: Record<string, { label: string; live: boolean }> = {
  active: { label: "Ativo", live: true },
  pending_regulatory: { label: "Em análise", live: false },
  regulatory_declined: { label: "Recusado na análise", live: false },
  suspended: { label: "Suspenso", live: false },
  released: { label: "Liberado", live: false },
  provisioning: { label: "Ativando", live: false },
  verifying: { label: "Ativando", live: false },
  pending: { label: "Pedido", live: false },
};

const DEST_LABEL = {
  ai: "Agente de IA",
  phone: "Atendente",
  zadarma: "Central",
  none: "Caixa postal",
} as const;

function NumberRow({ n, onConfigure }: { n: ZernioNumber; onConfigure: () => void }) {
  const st = STATUS[n.status] ?? { label: n.status, live: false };
  const dest = parseForwardTo((n.voice as { forwardTo?: string } | null)?.forwardTo);
  return (
    <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="font-display text-[15px] font-semibold tabular-nums">
          {n.phone_number ? formatPhone(n.phone_number) : "Número a definir"}
        </p>
        <p className="text-[12px] text-muted-foreground">
          {n.source === "port_in" ? "Portabilidade" : "Comprado na Zernio"}
          {n.monthly_cents
            ? ` · US$ ${(n.monthly_cents / 100).toFixed(2).replace(".", ",")}/mês`
            : ""}
          {st.live ? ` · ligações: ${DEST_LABEL[dest.kind]}` : ""}
        </p>
        {n.status_reason && <p className="mt-1 text-[12px] text-hot-fg">{n.status_reason}</p>}
      </div>
      <span className="inline-flex items-center gap-1.5 text-[12px] font-medium">
        <span
          className={cn("size-2 rounded-full", st.live ? "bg-success" : "bg-subtle")}
          aria-hidden
        />
        {st.label}
      </span>
      {n.verification_url && n.status !== "active" && (
        <Button variant="outline" size="sm" asChild>
          <a href={n.verification_url} target="_blank" rel="noopener noreferrer">
            Verificar identidade <ExternalLink aria-hidden />
          </a>
        </Button>
      )}
      {st.live && (
        <Button variant="outline" size="sm" onClick={onConfigure}>
          <PhoneCall aria-hidden /> Configurar ligações
        </Button>
      )}
    </li>
  );
}

/** "Número real": comprar, trazer, configurar ligações, testar pelo navegador e saúde. */
export function NumbersSection({ accountId, isAdmin }: { accountId: string; isAdmin: boolean }) {
  const integrations = useIntegrations(accountId, isAdmin);
  const numbers = useZernioNumbers(accountId);
  const sync = useSyncNumbers(accountId);
  const [buy, setBuy] = useState(false);
  const [port, setPort] = useState(false);
  const [configure, setConfigure] = useState<ZernioNumber | null>(null);
  const ready = isConnected(integrations.data, "zernio");
  const list = (numbers.data ?? []).filter((n) => n.status !== "released");
  const active = list.find((n) => n.status === "active" && n.phone_number);

  function refresh() {
    sync.mutate(undefined, {
      onSuccess: (r) =>
        toast.success(
          `${r.numbers.length} ${r.numbers.length === 1 ? "número" : "números"} na Zernio`,
        ),
      onError: (err) => toast.error(errorMessage(err)),
    });
  }

  return (
    <section aria-labelledby="numbers-heading" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="numbers-heading" className="eyebrow flex items-center gap-1.5">
            <BrandIcon id="zernio" size={14} />
            Número real
          </h2>
          <p className="text-[13px] text-muted-foreground">
            Um número brasileiro da empresa: recebe ligação e WhatsApp no mesmo número.
          </p>
        </div>
        {isAdmin && ready && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={refresh}
              disabled={sync.isPending}
              aria-label="Atualizar números da Zernio"
            >
              {sync.isPending ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <RefreshCw aria-hidden />
              )}
              Atualizar
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPort(true)}>
              <ArrowDownToLine aria-hidden /> Trazer meu número
            </Button>
            <Button size="sm" onClick={() => setBuy(true)}>
              <ShoppingCart aria-hidden /> Comprar número
            </Button>
          </div>
        )}
      </div>

      {!isAdmin ? (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4 text-[13px] text-muted-foreground">
          <Lock className="size-4 shrink-0" aria-hidden />
          Só donos e administradores compram ou configuram números.
        </div>
      ) : integrations.isLoading || numbers.isLoading ? (
        <Skeleton className="h-24 rounded-xl" />
      ) : !ready ? (
        <p className="rounded-xl border border-dashed border-border bg-surface p-4 text-[13px] text-muted-foreground">
          Conecte a Zernio no WhatsApp acima para comprar ou trazer um número.
        </p>
      ) : numbers.isError ? (
        <p className="text-[13px] text-danger">{errorMessage(numbers.error)}</p>
      ) : list.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface p-5 text-[13px]">
          <p className="font-medium">Nenhum número ainda</p>
          <p className="mt-1 text-muted-foreground">
            Compre um fixo com o DDD da sua cidade ou traga o número que seus clientes já conhecem.
            Depois escolha quem atende: o agente de IA, um atendente ou a central.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
          {list.map((n) => (
            <NumberRow key={n.id} n={n} onConfigure={() => setConfigure(n)} />
          ))}
        </ul>
      )}

      {isAdmin && ready && active && (
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="mb-3 text-[13px] font-medium">Testar uma ligação pelo navegador</p>
          <ZernioWebCall accountId={accountId} fromNumber={active.phone_number} />
        </div>
      )}

      {isAdmin && <NumberHealthPanel accountId={accountId} />}

      <BuyNumberDialog accountId={accountId} open={buy} onOpenChange={setBuy} />
      <PortNumberDialog accountId={accountId} open={port} onOpenChange={setPort} />
      <VoiceDialog accountId={accountId} number={configure} onClose={() => setConfigure(null)} />
    </section>
  );
}
