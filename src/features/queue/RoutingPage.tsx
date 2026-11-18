import { hasChannel } from "@/lib/edition";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, Loader2, MonitorPlay, PhoneCall, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAccount, useAccountId } from "@/lib/account";
import { errorMessage } from "@/lib/functions";

import { useCallCenterSettings, useSaveSettings, useZadarmaCheck } from "./api";
import { DialingPanel } from "./DialingPanel";
import { QueueHeader } from "./QueueHeader";
import { QueueRules } from "./QueueRules";
import { TeamCapacity } from "./TeamCapacity";

function RulesPanel({ accountId }: { accountId: string }) {
  const s = useCallCenterSettings(accountId);
  const save = useSaveSettings(accountId);
  if (s.isLoading) return <Skeleton className="h-40 w-full rounded-xl" />;
  if (s.isError) return <p className="text-[13px] text-danger">{errorMessage(s.error)}</p>;
  const v = {
    reservation_seconds: s.data?.reservation_seconds ?? 30,
    owner_wait_seconds: s.data?.owner_wait_seconds ?? 120,
    sla_risk_seconds: s.data?.sla_risk_seconds ?? 120,
    auto_callback_on_abandon: s.data?.auto_callback_on_abandon ?? true,
    offer_callback: s.data?.offer_callback ?? true,
    offer_whatsapp: s.data?.offer_whatsapp ?? true,
  };
  const put = (patch: Partial<typeof v>) =>
    save.mutate(
      { ...v, ...patch },
      {
        onSuccess: () => toast.success("Regra salva"),
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  const num = (
    key: "reservation_seconds" | "owner_wait_seconds" | "sla_risk_seconds",
    min: number,
    max: number,
  ) => (
    <Input
      type="number"
      min={min}
      max={max}
      className="mx-1 inline-flex h-8 w-20"
      defaultValue={v[key]}
      aria-label={key}
      onBlur={(e) => {
        const n = Math.min(max, Math.max(min, Number(e.target.value) || min));
        if (n !== v[key]) put({ [key]: n });
      }}
    />
  );
  return (
    <div className="space-y-3 text-[14px]">
      <div className="rounded-xl border border-border bg-surface p-4">
        <p className="eyebrow mb-2">Ordem da fila</p>
        <ol className="list-decimal space-y-1 pl-5 text-[13px] text-muted-foreground">
          <li>
            Primeiro quem está com o prazo de resposta acabando (faltando{" "}
            {num("sla_risk_seconds", 0, 86400)} segundos ou menos).
          </li>
          <li>
            Depois o cliente de maior valor: valor na carteira e a mensalidade anotada na ficha do
            contato.
          </li>
          <li>Depois a ordem de chegada.</li>
        </ol>
      </div>
      <div className="rounded-xl border border-border bg-surface p-4 text-[13px]">
        <p>
          Cliente com caso aberto espera
          {num("owner_wait_seconds", 0, 3600)}
          segundos pela pessoa que já cuida dele antes de ir para outra.
        </p>
        <p className="mt-2">
          Quando a fila reserva um atendimento para alguém, a pessoa tem
          {num("reservation_seconds", 10, 300)}
          segundos para aceitar; depois ele volta para a fila.
        </p>
      </div>
      {hasChannel("phone") && (
        <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
          <label className="flex items-center justify-between gap-3">
            <span>Ligação perdida vira retorno na fila automaticamente</span>
            <Switch
              checked={v.auto_callback_on_abandon}
              onCheckedChange={(x) => put({ auto_callback_on_abandon: x })}
            />
          </label>
          <label className="flex items-center justify-between gap-3">
            <span>Sem ninguém livre, a IA oferece retorno de ligação</span>
            <Switch
              checked={v.offer_callback}
              onCheckedChange={(x) => put({ offer_callback: x })}
            />
          </label>
          <label className="flex items-center justify-between gap-3">
            <span>Sem ninguém livre, a IA oferece continuar pelo WhatsApp</span>
            <Switch
              checked={v.offer_whatsapp}
              onCheckedChange={(x) => put({ offer_whatsapp: x })}
            />
          </label>
        </div>
      )}
    </div>
  );
}

function SupervisionCheck({ accountId }: { accountId: string }) {
  const check = useZadarmaCheck(accountId);
  return (
    <div className="space-y-3 rounded-xl border border-border bg-surface p-4 text-[13px]">
      <p className="text-[14px] font-semibold">Escuta, sussurro e entrada na ligação</p>
      <p className="text-muted-foreground">
        Na Zadarma a supervisão é da própria central telefônica: com o modo supervisor ligado no
        ramal do gestor, ele disca 007, o ramal do atendente e tecla 4 (ouvir), 5 (sussurrar) ou 6
        (entrar). O Painel ao vivo mostra o passo a passo e liga o modo supervisor para você. A
        transferência com apresentação é *ramal# durante a ligação, depois que o colega recebe o
        resumo pela fila.
      </p>
      <Button
        variant="outline"
        className="rounded-full"
        disabled={check.isPending}
        onClick={() => check.mutate(undefined, { onError: (e) => toast.error(errorMessage(e)) })}
      >
        {check.isPending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <ShieldCheck className="size-4" />
        )}
        Testar a Zadarma
      </Button>
      {check.data && (
        <div className="space-y-1">
          <p className="flex items-center gap-1.5 text-foreground">
            <CheckCircle2 className="size-4" /> Zadarma respondeu. PABX {check.data.pbx_id ?? "–"}{" "}
            com {check.data.pbx_extensions.length} ramais.
          </p>
          {check.data.extensions.length === 0 ? (
            <p className="text-muted-foreground">
              Ninguém da equipe tem ramal ainda (Ajustes › Telefonia).
            </p>
          ) : (
            <ul className="space-y-0.5">
              {check.data.extensions.map((e) => (
                <li key={e.extension} className="flex items-center gap-1.5">
                  {e.found ? (
                    <CheckCircle2 className="size-3.5 text-foreground" />
                  ) : (
                    <XCircle className="size-3.5 text-danger" />
                  )}
                  Ramal {e.extension}:{" "}
                  {e.found
                    ? e.supervisor
                      ? "modo supervisor ligado"
                      : "modo supervisor desligado"
                    : "não existe na Zadarma"}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// Fila e roteamento (direção AIDesigner): as regras lidas como frase à esquerda, a equipe com o uso
// de cada canal à direita e, embaixo, os ajustes finos da fila, da discagem e da supervisão.
export function RoutingPage() {
  const accountId = useAccountId();
  const { isManager } = useAccount();
  if (!isManager)
    return (
      <div className="flex h-full flex-col">
        <PageHeader title="Fila e roteamento" />
        <EmptyState
          icon={ShieldCheck}
          title="Só gestores mexem aqui"
          description="Peça a um gestor para ajustar a equipe e as filas."
        />
      </div>
    );
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[1180px] px-4 pt-8 pb-16 md:px-10 md:pt-12">
        <QueueHeader
          eyebrow="Configuração"
          title="Fila e roteamento"
          description={`Como as ${hasChannel("phone") ? "mensagens e ligações" : "conversas"} são distribuídas, e quanto cada pessoa aguenta ao mesmo tempo, para ninguém ficar sobrecarregado e o cliente ser atendido rápido.`}
          actions={
            <Button asChild variant="outline">
              <Link to="/fila/painel">
                <MonitorPlay /> Painel ao vivo
              </Link>
            </Button>
          }
        />
        <div className="mt-12 grid gap-12 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-16">
          <QueueRules accountId={accountId} />
          <TeamCapacity accountId={accountId} />
        </div>

        <section aria-labelledby="fila-ajustes" className="mt-16">
          <div className="border-b border-border pb-4">
            <h2 id="fila-ajustes" className="font-display text-[20px] font-medium">
              Ajustes finos
            </h2>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {hasChannel("phone")
                ? "Ordem de quem é atendido primeiro, quanto tempo esperar, discagem automática e escuta de ligação."
                : "Ordem de quem é atendido primeiro e quanto tempo esperar."}
            </p>
          </div>
          <Tabs defaultValue="regras" className="mt-5">
            <TabsList className="mb-4 flex-wrap">
              <TabsTrigger value="regras">Ordem e espera</TabsTrigger>
              {hasChannel("phone") && <TabsTrigger value="discagem">Discagem</TabsTrigger>}
              {hasChannel("phone") && <TabsTrigger value="supervisao">Supervisão</TabsTrigger>}
            </TabsList>
            <TabsContent value="regras" className="max-w-3xl">
              <RulesPanel accountId={accountId} />
            </TabsContent>
            <TabsContent value="discagem" className="max-w-3xl">
              <DialingPanel accountId={accountId} />
            </TabsContent>
            <TabsContent value="supervisao" className="max-w-3xl">
              <SupervisionCheck accountId={accountId} />
            </TabsContent>
          </Tabs>
        </section>
      </div>
    </div>
  );
}
