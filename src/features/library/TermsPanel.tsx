import { useMemo, useState } from "react";
import { Bell, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";

import {
  TERM_CATEGORY,
  lastWeeks,
  mentionSeries,
  useDeleteTerm,
  useSaveTerm,
  useTermMentions,
  useTrackedTerms,
} from "./api";

// Termos monitorados: cadastro (gestão) e menções por semana nas reuniões e ligações.
export function TermsPanel({ accountId, isManager }: { accountId: string; isManager: boolean }) {
  const terms = useTrackedTerms(accountId);
  const mentions = useTermMentions(accountId, 84);
  const save = useSaveTerm(accountId);
  const remove = useDeleteTerm(accountId);
  const [term, setTerm] = useState("");
  const [category, setCategory] = useState("competitor");
  const [alert, setAlert] = useState(false);
  const weeks = useMemo(() => lastWeeks(12), []);
  const series = useMemo(
    () =>
      mentionSeries(
        (mentions.data ?? []).map((m) => ({
          ...m,
          week: String(m.week),
          mentions: Number(m.mentions),
        })),
        weeks,
      ),
    [mentions.data, weeks],
  );
  const max = Math.max(1, ...series.flatMap((s) => s.series));

  return (
    <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
      <section className="rounded-[24px] border border-border bg-surface p-4" aria-label="Termos">
        <p className="eyebrow mb-3">Termos monitorados</p>
        {isManager && (
          <form
            className="mb-4 space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (term.trim().length < 2) return;
              save.mutate(
                { term: term.trim(), category, alert },
                {
                  onSuccess: () => {
                    setTerm("");
                    toast.success("Termo monitorado");
                  },
                  onError: (er) =>
                    toast.error(
                      errorMessage(er).includes("duplicate")
                        ? "Esse termo já está na lista"
                        : errorMessage(er),
                    ),
                },
              );
            }}
          >
            <Input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Ex.: RD Station, desconto, cancelar"
              aria-label="Termo"
            />
            <div className="flex gap-2">
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="flex-1" aria-label="Categoria">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TERM_CATEGORY).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? <Loader2 className="animate-spin" /> : <Plus />} Adicionar
              </Button>
            </div>
            <label className="flex items-center justify-between gap-2 text-[12px] text-muted-foreground">
              Avisar a gestão quando aparecer
              <Switch checked={alert} onCheckedChange={setAlert} />
            </label>
          </form>
        )}
        {(terms.data ?? []).length === 0 ? (
          <p className="py-4 text-center text-[12px] text-muted-foreground">
            Nenhum termo ainda. Comece pelos concorrentes e por “preço”.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {(terms.data ?? []).map((t) => (
              <li key={t.id} className="flex items-center gap-2 py-2">
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{t.term}</span>
                {t.alert && <Bell className="size-3.5 text-subtle" aria-label="com alerta" />}
                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-muted-foreground">
                  {TERM_CATEGORY[t.category] ?? t.category}
                </span>
                {isManager && (
                  <button
                    type="button"
                    aria-label={`Remover ${t.term}`}
                    onClick={() => remove.mutate(t.id)}
                    className="rounded-full p-1.5 text-subtle hover:bg-surface-2 hover:text-danger"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        className="rounded-[24px] border border-border bg-surface p-4"
        aria-label="Menções por semana"
      >
        <p className="eyebrow mb-1">Menções por semana</p>
        <p className="mb-4 text-[12px] text-muted-foreground">
          Últimas 12 semanas, em reuniões e ligações.
        </p>
        {mentions.isPending ? (
          <Skeleton className="h-40 rounded-xl" />
        ) : series.length === 0 ? (
          <p className="py-10 text-center text-[12px] text-muted-foreground">
            Nenhuma menção dos termos no período.
          </p>
        ) : (
          <ul className="space-y-4">
            {series.map((s) => (
              <li key={s.id}>
                <div className="mb-1.5 flex items-baseline justify-between">
                  <span className="text-[13px] font-medium">{s.term}</span>
                  <span className="text-[12px] text-subtle tabular-nums">{s.total} menções</span>
                </div>
                <div
                  className="flex h-12 items-end gap-1"
                  role="img"
                  aria-label={`${s.term}: ${s.series.join(", ")} menções por semana`}
                >
                  {s.series.map((v, i) => (
                    <div
                      key={weeks[i]}
                      title={`Semana de ${new Date(`${weeks[i]}T12:00:00`).toLocaleDateString("pt-BR")}: ${v}`}
                      className={cn(
                        "flex-1 rounded-t-md transition-[height]",
                        v > 0 ? "bg-primary" : "bg-surface-3",
                      )}
                      style={{ height: `${Math.max(6, (v / max) * 100)}%` }}
                    />
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
