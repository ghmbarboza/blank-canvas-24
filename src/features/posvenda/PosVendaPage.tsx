import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { HeartHandshake, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import { enabledModules } from "@/components/layout/modules";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccount } from "@/lib/account";
import { errorMessage } from "@/lib/functions";

import {
  useAtRiskStage,
  useRuleRows,
  useSaveDailyCap,
  useSaveRule,
  useToggleRule,
  useWhatsAppConnected,
} from "./api";
import { avaliacoesOf, prazosOf } from "./moment";
import { AvaliacoesBlock, PrazosBlock } from "./PrazosBlock";
import { RuleCard } from "./RuleCard";
import {
  MAX_DAILY_CAP,
  RULES,
  dailyCapOf,
  ruleDef,
  type RuleDef,
  type RuleKey,
  type RuleOptions,
} from "./rules";

// A jornada em quatro momentos, na ordem em que o cliente vive cada um.
const MOMENTS: { title: string; lead: string; keys: RuleKey[] }[] = [
  {
    title: "Chegada",
    lead: "Os primeiros dias depois da compra.",
    keys: ["boas_vindas", "checkin_7d"],
  },
  {
    title: "Prazos da compra",
    lead: "Falar com o cliente antes de o prazo de arrependimento e a garantia vencerem.",
    keys: ["fim_arrependimento", "fim_garantia"],
  },
  {
    title: "Escuta",
    lead: "Perguntar a nota e agir em cima da resposta.",
    keys: ["pesquisa", "nota_baixa_chamado", "nota_alta_indicacao"],
  },
  {
    title: "Retorno",
    lead: "Trazer de volta quem pode comprar de novo ou está sumindo.",
    keys: ["recompra", "cliente_parado"],
  },
];

const STEP = Object.fromEntries(MOMENTS.flatMap((m) => m.keys).map((k, i) => [k, i + 1])) as Record<
  RuleKey,
  number
>;

// Regras de pós-venda: o dono liga cada regra pronta e ajusta a mensagem, sem montar automação.
export function PosVendaPage() {
  const { current, isAdmin } = useAccount();
  const accountId = current!.accountId;
  const engineOn = enabledModules(current?.settings).has("automacoes");
  const rules = useRuleRows(accountId);
  const stage = useAtRiskStage(accountId);
  const whatsapp = useWhatsAppConnected(accountId);
  const toggle = useToggleRule(accountId);
  const save = useSaveRule(accountId);
  const [busy, setBusy] = useState<RuleKey | null>(null);
  const [saving, setSaving] = useState<RuleKey | null>(null);
  const prazos = prazosOf(current?.settings);

  const isOn = (k: RuleKey) => rules.byRule[k]?.status === "active";
  const onCount = RULES.filter((r) => isOn(r.key)).length;

  function withStage(key: RuleKey, opts: RuleOptions): RuleOptions {
    if (key === "cliente_parado") return { ...opts, atRiskStage: stage.data ?? null };
    // as duas regras contadas da compra seguem os prazos da conta
    return key === "fim_arrependimento" || key === "fim_garantia" ? { ...opts, prazos } : opts;
  }

  function onToggle(def: RuleDef, on: boolean, opts: RuleOptions) {
    setBusy(def.key);
    toggle.mutate(
      {
        key: def.key,
        on,
        row: rules.byRule[def.key],
        opts: withStage(def.key, opts),
        current: Object.fromEntries(RULES.map((r) => [r.key, isOn(r.key)])),
      },
      {
        onSuccess: () =>
          toast.success(on ? `Regra ligada: ${def.title}` : `Regra desligada: ${def.title}`),
        onError: (e) => toast.error(errorMessage(e)),
        onSettled: () => setBusy(null),
      },
    );
  }

  async function onSave(def: RuleDef, opts: RuleOptions) {
    setSaving(def.key);
    try {
      await save.mutateAsync({
        key: def.key,
        row: rules.byRule[def.key],
        opts: withStage(def.key, opts),
      });
      toast.success("Salvo. Vale para as próximas mensagens.");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(null);
    }
  }

  function hintFor(def: RuleDef): string | undefined {
    if (def.needs && isOn(def.key) && !isOn(def.needs))
      return `Só dispara com a regra "${ruleDef(def.needs).title}" ligada.`;
    if (def.key === "fim_arrependimento")
      return `Com o prazo de ${prazos.arrependimento_dias} dias, a mensagem sai ${prazos.arrependimento_dias - 1} ${prazos.arrependimento_dias - 1 === 1 ? "dia" : "dias"} depois da compra. Vale para quem tem data da compra na ficha.`;
    if (def.key === "fim_garantia")
      return `Garantia de ${prazos.garantia_dias} dias (ajuste em Prazos do pós-venda). Vale para quem tem data da compra na ficha.`;
    if (def.key === "cliente_parado" && stage.isSuccess && !stage.data)
      return 'Sua Carteira não tem a etapa "Em risco": a regra marca o cliente com a etiqueta "em risco" e cria a tarefa.';
    return undefined;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="Regras de pós-venda"
        description="Ligue o que o seu pós-venda faz sozinho. Cada regra já vem pronta: você só ajusta a mensagem."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/atendimento" search={{ aba: "pesquisas" }}>
              Ver respostas das pesquisas
            </Link>
          </Button>
        }
      />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-4xl space-y-8 p-4 sm:p-6 lg:p-8">
          <PrazosBlock
            accountId={accountId}
            prazos={prazos}
            rows={rules.byRule}
            canEdit={isAdmin}
          />
          <AvaliacoesBlock
            accountId={accountId}
            links={avaliacoesOf(current?.settings)}
            rows={rules.byRule}
            canEdit={isAdmin}
          />
          <VolumeNote
            accountId={accountId}
            cap={dailyCapOf(current?.settings)}
            canEdit={isAdmin}
            onCount={onCount}
            loading={rules.isPending}
          />

          {!engineOn && (
            <Notice
              title="As regras estão paradas"
              text='O recurso "Automações" está desligado nesta conta. Com ele desligado nenhuma regra dispara.'
              action={
                isAdmin ? (
                  <Button asChild size="sm" variant="outline">
                    <Link to="/ajustes" search={{ aba: "recursos" }}>
                      Ligar em Recursos extras
                    </Link>
                  </Button>
                ) : undefined
              }
            />
          )}
          {engineOn && whatsapp.data === false && (
            <Notice
              title="Nenhum WhatsApp conectado"
              text="Você pode ligar as regras agora; as mensagens começam a sair quando um número for conectado."
              action={
                <Button asChild size="sm" variant="outline">
                  <Link to="/canais">Conectar WhatsApp</Link>
                </Button>
              }
            />
          )}
          {!isAdmin && (
            <p className="rounded-xl bg-surface-2 px-4 py-3 text-[13px] text-muted-foreground">
              Só o dono ou um administrador liga, desliga ou edita as regras.
            </p>
          )}

          {rules.isPending ? (
            <div className="space-y-3" aria-busy="true" aria-label="Carregando as regras">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-28 rounded-[20px]" />
              ))}
            </div>
          ) : rules.isError ? (
            <EmptyState
              icon={HeartHandshake}
              className="rounded-[20px] border border-danger/40"
              title="Não deu para carregar as regras"
              description={errorMessage(rules.error)}
              action={
                <Button size="sm" variant="outline" onClick={() => void rules.refetch()}>
                  Tentar de novo
                </Button>
              }
            />
          ) : (
            MOMENTS.map((m) => (
              <section key={m.title} aria-labelledby={`moment-${m.title}`} className="space-y-3">
                <header className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                  <h2
                    id={`moment-${m.title}`}
                    className="font-display text-[19px] font-medium text-foreground"
                  >
                    {m.title}
                  </h2>
                  <p className="text-[13px] text-muted-foreground">{m.lead}</p>
                </header>
                <ol className="relative space-y-3 before:absolute before:top-4 before:bottom-4 before:left-4 before:w-px before:bg-border sm:before:left-5">
                  {m.keys.map((key) => {
                    const def = ruleDef(key);
                    return (
                      <RuleCard
                        key={key}
                        def={def}
                        step={STEP[key]}
                        row={rules.byRule[key]}
                        canEdit={isAdmin}
                        engineOn={engineOn}
                        toggling={busy === key}
                        saving={saving === key}
                        hint={hintFor(def)}
                        onToggle={(on, opts) => onToggle(def, on, opts)}
                        onSave={(opts) => onSave(def, opts)}
                      />
                    );
                  })}
                </ol>
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function Notice({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-[20px] border border-border bg-surface-2 px-4 py-3.5 sm:px-5"
    >
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-foreground">{title}</p>
        <p className="mt-0.5 text-[13px] text-muted-foreground">{text}</p>
      </div>
      {action}
    </div>
  );
}

// O cuidado com volume, em uma linha, com o teto do dia editável ali mesmo.
function VolumeNote({
  accountId,
  cap,
  canEdit,
  onCount,
  loading,
}: {
  accountId: string;
  cap: number;
  canEdit: boolean;
  onCount: number;
  loading: boolean;
}) {
  const saveCap = useSaveDailyCap(accountId);
  const [value, setValue] = useState(String(cap));
  useEffect(() => setValue(String(cap)), [cap]);
  const n = Number(value);
  const valid = value !== "" && Number.isInteger(n) && n >= 0 && n <= MAX_DAILY_CAP;
  const dirty = valid && n !== cap;

  function commit() {
    if (!dirty) {
      if (!valid) setValue(String(cap));
      return;
    }
    saveCap.mutate(n, {
      onSuccess: () =>
        toast.success(n === 0 ? "Teto do dia removido" : `Teto do dia: ${n} mensagens`),
      onError: (e) => {
        setValue(String(cap));
        toast.error(errorMessage(e));
      },
    });
  }

  return (
    <section
      aria-label="Cuidado com o volume de mensagens"
      className="flex flex-col gap-4 rounded-[24px] border border-border bg-surface p-4 sm:flex-row sm:items-center sm:p-5"
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-surface-2">
          <ShieldCheck className="size-[18px] text-primary" aria-hidden />
        </span>
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          <span className="font-semibold text-foreground">
            As mensagens saem aos poucos e só para quem já é cliente.
          </span>{" "}
          No máximo{" "}
          <label htmlFor="pv-cap" className="sr-only">
            Mensagens automáticas por dia (0 tira o teto)
          </label>
          <Input
            id="pv-cap"
            inputMode="numeric"
            value={value}
            disabled={!canEdit || saveCap.isPending}
            onChange={(e) => setValue(e.target.value.replace(/\D/g, "").slice(0, 3))}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            aria-invalid={!valid}
            className="mx-1 inline-block h-7 w-14 px-1.5 text-center align-baseline text-[13px] tabular-nums"
          />{" "}
          por dia, de segunda a sexta, das 8h às 20h, e até 3 por cliente na semana. O que passar do
          teto fica para o dia seguinte.
          {saveCap.isPending && (
            <Loader2 className="ml-1.5 inline size-3.5 animate-spin" aria-label="Salvando" />
          )}
        </p>
      </div>
      <p className="shrink-0 border-t border-border pt-3 text-[12px] text-subtle sm:border-t-0 sm:border-l sm:pt-0 sm:pl-5 sm:text-right">
        <span className="block font-display text-[22px] leading-none font-semibold text-foreground tabular-nums">
          {loading ? "…" : `${onCount} de ${RULES.length}`}
        </span>
        regras ligadas
      </p>
    </section>
  );
}
