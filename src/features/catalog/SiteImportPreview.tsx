// Prévia do que foi lido no site: o dono confere, desmarca o que não quer e confirma. Nada é
// gravado antes do clique. Usada na tela de Catálogo, no passo "Sua empresa" e dentro da conversa.
import { useMemo, useState } from "react";
import { CheckCircle2, CircleAlert, Globe, Loader2 } from "lucide-react";

import {
  POLICY_KEYS,
  POLICY_LABEL,
  SOURCE_LABEL,
  type ConfirmResult,
  type SitePreview,
} from "@/backend/setup-agent/site-import/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { errorMessage } from "@/lib/functions";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

import { resultText, useConfirmSite } from "./site-import-api";

interface Props {
  accountId: string;
  preview: SitePreview;
  /** preencher também o passo "Sua empresa" (só campos vazios) */
  fillCompany?: boolean;
  /** false = só leitura (prévia antiga na conversa) */
  active?: boolean;
  onDone?: (result: ConfirmResult, text: string) => void;
  className?: string;
}

const SHOWN = 60;

export function SiteImportPreview({
  accountId,
  preview,
  fillCompany = false,
  active = true,
  onDone,
  className,
}: Props) {
  const confirm = useConfirmSite(accountId);
  const [off, setOff] = useState<Set<number>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const items = preview.items;
  const picked = useMemo(() => items.filter((_, i) => !off.has(i)), [items, off]);
  const policies = POLICY_KEYS.filter((k) => preview.company.policies[k]);
  const hasCompany = Boolean(preview.company.sells || preview.company.name || policies.length);
  const host = (() => {
    try {
      return new URL(preview.url).hostname.replace(/^www\./, "");
    } catch {
      return preview.url;
    }
  })();

  function toggle(i: number) {
    setOff((cur) => {
      const next = new Set(cur);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  function submit() {
    setError(null);
    confirm.mutate(
      {
        url: preview.url,
        items: picked,
        company: preview.company,
        saveKnowledge: true,
        fillCompany,
      },
      {
        onSuccess: (r) => {
          const text = resultText(r);
          setSaved(text);
          onDone?.(r, text);
        },
        onError: (e) =>
          setError(`Não consegui gravar: ${errorMessage(e)}. Tente de novo em instantes.`),
      },
    );
  }

  if (saved)
    return (
      <p
        role="status"
        className={cn(
          "flex items-start gap-2.5 rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-[13px]",
          className,
        )}
      >
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          Importado de {host}: {saved}.
        </span>
      </p>
    );

  const visible = showAll ? items : items.slice(0, SHOWN);
  return (
    <section className={cn("rounded-2xl border border-border bg-surface", className)}>
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <Globe className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <p className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">{host}</p>
        <p className="text-[12px] text-muted-foreground">
          {items.length
            ? `${items.length} itens · ${SOURCE_LABEL[preview.source]}`
            : `${preview.pages} página(s) lida(s)`}
        </p>
      </header>

      {hasCompany ? (
        <dl className="grid gap-1.5 border-b border-border px-4 py-3 text-[13px]">
          {preview.company.name ? (
            <div className="flex gap-2">
              <dt className="w-28 shrink-0 text-muted-foreground">Empresa</dt>
              <dd className="min-w-0">{preview.company.name}</dd>
            </div>
          ) : null}
          {preview.company.sells ? (
            <div className="flex gap-2">
              <dt className="w-28 shrink-0 text-muted-foreground">O que vende</dt>
              <dd className="min-w-0">{preview.company.sells}</dd>
            </div>
          ) : null}
          {preview.company.tone ? (
            <div className="flex gap-2">
              <dt className="w-28 shrink-0 text-muted-foreground">Jeito de falar</dt>
              <dd className="min-w-0">{preview.company.tone}</dd>
            </div>
          ) : null}
          {policies.map((k) => (
            <div key={k} className="flex gap-2">
              <dt className="w-28 shrink-0 text-muted-foreground">{POLICY_LABEL[k]}</dt>
              <dd className="min-w-0">{preview.company.policies[k]}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {items.length ? (
        <ul className="max-h-[340px] divide-y divide-border overflow-y-auto">
          {visible.map((it, i) => {
            const on = !off.has(i);
            const id = `site-item-${i}`;
            return (
              <li key={`${it.name}-${i}`} className="flex items-start gap-3 px-4 py-2.5">
                <Checkbox
                  id={id}
                  checked={on}
                  disabled={!active || confirm.isPending}
                  onCheckedChange={() => toggle(i)}
                  className="mt-0.5"
                />
                <label
                  htmlFor={id}
                  className={cn("min-w-0 flex-1 cursor-pointer", !on && "opacity-50")}
                >
                  <span className="block truncate text-[13.5px] font-medium">{it.name}</span>
                  {it.description || it.category ? (
                    <span className="block truncate text-[12px] text-muted-foreground">
                      {[it.category, it.description].filter(Boolean).join(" · ")}
                    </span>
                  ) : null}
                </label>
                <span
                  className={cn(
                    "shrink-0 text-[13px] tabular-nums",
                    it.price === null ? "text-muted-foreground" : "font-semibold",
                    !on && "opacity-50",
                  )}
                >
                  {it.price === null ? "sem preço" : formatMoney(it.price)}
                </span>
              </li>
            );
          })}
          {!showAll && items.length > SHOWN ? (
            <li className="px-4 py-2.5">
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowAll(true)}>
                Mostrar os outros {items.length - SHOWN}
              </Button>
            </li>
          ) : null}
        </ul>
      ) : null}

      {preview.notes.length ? (
        <ul className="grid gap-1.5 border-t border-border px-4 py-3">
          {preview.notes.map((n) => (
            <li key={n} className="flex items-start gap-2 text-[12.5px] text-muted-foreground">
              <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {n}
            </li>
          ))}
        </ul>
      ) : null}

      {error ? (
        <p role="alert" className="border-t border-border px-4 py-2.5 text-[13px] text-destructive">
          {error}
        </p>
      ) : null}

      {active && (items.length || hasCompany) ? (
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
          <p className="text-[12px] text-muted-foreground">
            {items.length
              ? `${picked.length} de ${items.length} marcados. Item que já existe é atualizado, sem duplicar.`
              : "Guarda o resumo e as políticas para o atendente consultar."}
          </p>
          <Button
            type="button"
            className="rounded-full"
            disabled={confirm.isPending || (!picked.length && !hasCompany)}
            onClick={submit}
          >
            {confirm.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {picked.length
              ? `Importar ${picked.length} ${picked.length === 1 ? "item" : "itens"}`
              : "Guardar o resumo"}
          </Button>
        </footer>
      ) : null}
    </section>
  );
}
