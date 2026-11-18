import { Loader2, Plus } from "lucide-react";

import { NODE_ICON } from "./nodeMeta";
import { buildSentence } from "./sentence";
import { templatesFor, type AutomationTemplate } from "./templates";

type Props = { busy: boolean; onPick: (t: AutomationTemplate | null) => void };

// "Comece por um modelo": os modelos prontos do produto, cada um com o desenho dos seus passos.
export function TemplateGallery({ busy, onPick }: Props) {
  const templates = templatesFor();
  // edição em que nenhum modelo se aplica (todos usam um canal ausente): a seção some
  if (templates.length === 0) return null;
  return (
    <section aria-labelledby="tpl-title" className="space-y-4">
      <div>
        <h2 id="tpl-title" className="font-display text-[18px] font-medium">
          Comece por um modelo
        </h2>
        <p className="text-[13px] text-muted-foreground">
          Fluxos prontos com gatilho, passos e regras de saída. Nascem como rascunho: nada é enviado
          até você ligar.
        </p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {templates.map((t) => {
          const s = buildSentence(t.trigger, t.graph, 3);
          return (
            <li key={t.key}>
              <button
                type="button"
                disabled={busy}
                onClick={() => onPick(t)}
                className="lift flex h-full w-full flex-col overflow-hidden rounded-[24px] border border-border bg-surface text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-[0.99] disabled:opacity-60"
              >
                <span
                  className="flex h-[118px] flex-col gap-1.5 overflow-hidden border-b border-border bg-surface-2 bg-[radial-gradient(var(--color-border)_1px,transparent_1px)] [background-size:14px_14px] px-4 py-4"
                  aria-hidden
                >
                  {s.steps.map((st, i) => {
                    const Icon = NODE_ICON[st.type];
                    return (
                      <span
                        key={st.id}
                        className="inline-flex w-fit max-w-full items-center gap-1.5 rounded-lg border border-border bg-surface px-2 py-1 text-[11px] text-muted-foreground shadow-xs"
                        style={{ marginLeft: `${i * 14}px` }}
                      >
                        <Icon className="size-3 shrink-0 text-foreground" />
                        <span className="truncate">{st.text.replace(/,$/, "")}</span>
                      </span>
                    );
                  })}
                </span>
                <span className="flex flex-1 flex-col p-4">
                  <span className="text-[14px] font-semibold">{t.name}</span>
                  <span className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                    {t.description}
                  </span>
                  <span className="mt-auto pt-3 text-[11px] text-subtle">{s.trigger}</span>
                </span>
              </button>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            disabled={busy}
            onClick={() => onPick(null)}
            className="flex h-full min-h-40 w-full flex-col items-center justify-center gap-2 rounded-[24px] border border-dashed border-border-strong p-6 text-center text-[13px] text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
          >
            <span className="grid size-10 place-items-center rounded-full border border-border bg-surface">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            </span>
            <span className="font-medium text-foreground">Começar do zero</span>
            <span className="text-[12px]">Monte o fluxo passo a passo no editor.</span>
          </button>
        </li>
      </ul>
    </section>
  );
}
