import { useEffect, useRef, useState } from "react";
import { FileUp, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/lib/auth";
import { formatDateTime, formatPhone } from "@/lib/format";
import { errorMessage } from "@/lib/functions";

import {
  useCallCenterSettings,
  useCampaignDialing,
  useDncCount,
  useImportDnc,
  useSaveCampaignDialing,
  useSaveDialing,
} from "./api";
import {
  DIALING_TERM,
  anyRuleOn,
  chunk,
  parseDialingRules,
  parseDncFile,
  type DialingRules,
} from "./lib";

const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function NmpImport({ accountId }: { accountId: string }) {
  const input = useRef<HTMLInputElement>(null);
  const imp = useImportDnc(accountId);
  const count = useDncCount(accountId);
  const [progress, setProgress] = useState<string | null>(null);
  const onFile = async (f: File) => {
    if (f.size > 20 * 1024 * 1024) {
      toast.error("Arquivo grande demais (até 20 MB)");
      return;
    }
    const numbers = parseDncFile(await f.text());
    if (!numbers.length) {
      toast.error("Não achei telefones no arquivo. Use CSV ou TXT com um número por linha.");
      return;
    }
    let added = 0;
    const parts = chunk(numbers, 5000);
    try {
      for (const [i, part] of parts.entries()) {
        setProgress(`Enviando ${i + 1} de ${parts.length}…`);
        added += (await imp.mutateAsync(part)).added;
      }
      toast.success(`${numbers.length} números lidos, ${added} novos na lista de não contatar`);
      void count.refetch();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setProgress(null);
    }
  };
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-[14px] font-semibold">Lista de não contatar</p>
      <p className="mt-1 text-[13px] text-muted-foreground">
        {count.data === undefined ? "…" : `${count.data} números`} hoje (inclui quem pediu na
        ligação para não receber mais). Importe o arquivo exportado do Não Me Perturbe (CSV ou TXT).
      </p>
      <input
        ref={input}
        type="file"
        accept=".csv,.txt,text/csv,text/plain"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onFile(f);
          e.target.value = "";
        }}
      />
      <Button
        variant="outline"
        className="mt-3 rounded-full"
        disabled={Boolean(progress)}
        onClick={() => input.current?.click()}
      >
        {progress ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />}
        {progress ?? "Importar lista"}
      </Button>
    </div>
  );
}

function CampaignRows({ accountId }: { accountId: string }) {
  const q = useCampaignDialing(accountId);
  const save = useSaveCampaignDialing(accountId);
  if (q.isLoading) return <Skeleton className="h-20 w-full rounded-xl" />;
  if (q.isError) return <p className="text-[13px] text-danger">{errorMessage(q.error)}</p>;
  if (!q.data?.campaigns.length)
    return (
      <p className="text-[13px] text-muted-foreground">
        Nenhuma campanha de voz ainda. Crie em Ligações › Campanhas.
      </p>
    );
  return (
    <ul className="space-y-2">
      {q.data.campaigns.map((c) => (
        <li
          key={c.id}
          className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-3"
        >
          <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{c.name}</span>
          <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
            Prefixo
            <Input
              className="h-8 w-24"
              inputMode="numeric"
              maxLength={8}
              defaultValue={c.dial_prefix ?? ""}
              placeholder="nenhum"
              aria-label={`Prefixo de ${c.name}`}
              onBlur={(e) => {
                const v = e.target.value.replace(/\D/g, "") || null;
                if (v === (c.dial_prefix ?? null)) return;
                save.mutate(
                  { id: c.id, dial_prefix: v, phone_number_id: c.phone_number_id },
                  {
                    onSuccess: () => toast.success("Prefixo salvo"),
                    onError: (err) => toast.error(errorMessage(err)),
                  },
                );
              }}
            />
          </label>
          <Select
            value={c.phone_number_id ?? "none"}
            onValueChange={(v) =>
              save.mutate(
                { id: c.id, dial_prefix: c.dial_prefix, phone_number_id: v === "none" ? null : v },
                {
                  onSuccess: () => toast.success("Número de saída salvo"),
                  onError: (err) => toast.error(errorMessage(err)),
                },
              )
            }
          >
            <SelectTrigger className="h-8 w-52" aria-label={`Número de saída de ${c.name}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Número do agente de voz</SelectItem>
              {q.data.numbers.map((n) => (
                <SelectItem key={n.id} value={n.id}>
                  {n.label ? `${n.label} · ` : ""}
                  {formatPhone(n.number)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </li>
      ))}
    </ul>
  );
}

/** Regras de discagem (padrão desligado) + Não Me Perturbe + prefixo e número por campanha. */
export function DialingPanel({ accountId }: { accountId: string }) {
  const { user } = useAuth();
  const settings = useCallCenterSettings(accountId);
  const save = useSaveDialing(accountId, user?.id);
  const [rules, setRules] = useState<DialingRules>(() => parseDialingRules({}));
  const [agree, setAgree] = useState(false);
  const loaded = settings.data;
  useEffect(() => {
    if (loaded) setRules(parseDialingRules(loaded.dialing));
  }, [loaded]);
  if (settings.isLoading) return <Skeleton className="h-48 w-full rounded-xl" />;
  if (settings.isError)
    return <p className="text-[13px] text-danger">{errorMessage(settings.error)}</p>;
  const accepted = settings.data?.dialing_accepted_at;
  const upd = (r: DialingRules) => setRules(r);

  return (
    <div className="space-y-5">
      <div className="flex gap-3 rounded-xl border border-border bg-surface-2 p-4 text-[13px]">
        <ShieldAlert className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
        <p>{DIALING_TERM}</p>
      </div>

      <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
        <label className="flex items-center justify-between gap-3">
          <span>
            <span className="block text-[14px] font-semibold">Janela de horário</span>
            <span className="text-[12px] text-muted-foreground">
              Só liga dentro do horário e dos dias escolhidos (fuso da conta).
            </span>
          </span>
          <Switch
            checked={rules.window.enabled}
            onCheckedChange={(v) => upd({ ...rules, window: { ...rules.window, enabled: v } })}
            aria-label="Janela de horário"
          />
        </label>
        {rules.window.enabled && (
          <div className="flex flex-wrap items-center gap-3 text-[13px]">
            das
            <Input
              type="time"
              className="h-8 w-28"
              value={rules.window.start}
              onChange={(e) =>
                upd({ ...rules, window: { ...rules.window, start: e.target.value } })
              }
              aria-label="Início"
            />
            às
            <Input
              type="time"
              className="h-8 w-28"
              value={rules.window.end}
              onChange={(e) => upd({ ...rules, window: { ...rules.window, end: e.target.value } })}
              aria-label="Fim"
            />
            <div className="flex flex-wrap gap-2">
              {DAYS.map((d, i) => (
                <label key={d} className="flex items-center gap-1">
                  <Checkbox
                    checked={rules.window.days.includes(i)}
                    onCheckedChange={(v) =>
                      upd({
                        ...rules,
                        window: {
                          ...rules.window,
                          days: v
                            ? [...rules.window.days, i].sort()
                            : rules.window.days.filter((x) => x !== i),
                        },
                      })
                    }
                  />
                  {d}
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
        <label className="flex items-center justify-between gap-3">
          <span>
            <span className="block text-[14px] font-semibold">Teto de tentativas por número</span>
            <span className="text-[12px] text-muted-foreground">
              Para de ligar para o mesmo número depois de N tentativas no período.
            </span>
          </span>
          <Switch
            checked={rules.attempts.enabled}
            onCheckedChange={(v) => upd({ ...rules, attempts: { ...rules.attempts, enabled: v } })}
            aria-label="Teto de tentativas"
          />
        </label>
        {rules.attempts.enabled && (
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            até
            <Input
              type="number"
              min={1}
              max={20}
              className="h-8 w-20"
              value={rules.attempts.max_per_number}
              onChange={(e) =>
                upd({
                  ...rules,
                  attempts: { ...rules.attempts, max_per_number: Number(e.target.value) || 1 },
                })
              }
              aria-label="Tentativas"
            />
            tentativas a cada
            <Input
              type="number"
              min={1}
              max={30}
              className="h-8 w-20"
              value={rules.attempts.period_days}
              onChange={(e) =>
                upd({
                  ...rules,
                  attempts: { ...rules.attempts, period_days: Number(e.target.value) || 1 },
                })
              }
              aria-label="Dias"
            />
            dia(s)
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-surface p-4">
        <label className="flex items-center justify-between gap-3">
          <span>
            <span className="block text-[14px] font-semibold">
              Respeitar a lista de não contatar
            </span>
            <span className="text-[12px] text-muted-foreground">
              Bloqueia ligação para qualquer número da lista abaixo, inclusive a importada do Não Me
              Perturbe.
            </span>
          </span>
          <Switch
            checked={rules.dnc.enabled}
            onCheckedChange={(v) => upd({ ...rules, dnc: { enabled: v } })}
            aria-label="Lista de não contatar"
          />
        </label>
      </div>

      <div className="space-y-2">
        <label className="flex items-start gap-2 text-[13px]">
          <Checkbox
            checked={agree}
            onCheckedChange={(v) => setAgree(v === true)}
            className="mt-0.5"
          />
          Li o aviso acima e entendo que ligar ou desligar estas regras é decisão da minha empresa.
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            className="rounded-full"
            disabled={!agree || save.isPending}
            onClick={() =>
              save.mutate(parseDialingRules(rules), {
                onSuccess: () =>
                  toast.success(
                    anyRuleOn(rules) ? "Regras salvas e valendo" : "Salvo: nenhuma regra ligada",
                  ),
                onError: (e) => toast.error(errorMessage(e)),
              })
            }
          >
            Salvar regras
          </Button>
          {accepted && (
            <span className="text-[12px] text-subtle">
              Última escolha registrada em {formatDateTime(accepted)}
            </span>
          )}
        </div>
      </div>

      <NmpImport accountId={accountId} />

      <section className="space-y-2">
        <h3 className="text-[14px] font-medium">Prefixo e número de saída por campanha</h3>
        <p className="text-[13px] text-muted-foreground">
          Opcional. O prefixo vai antes do número discado (ex.: código de operadora).
        </p>
        <CampaignRows accountId={accountId} />
      </section>
    </div>
  );
}
