import { useRef, useState } from "react";
import {
  Check,
  CircleDashed,
  FileText,
  Globe,
  HardDrive,
  Lightbulb,
  Loader2,
  Pencil,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useRoteiro } from "@/features/setup/progress";
import { formatRelative } from "@/lib/format";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";

import {
  useDeleteDocument,
  useDeleteFact,
  useDeleteWish,
  useDocuments,
  useSaveFact,
  useSetupFacts,
  useUploadDocuments,
  useWishes,
  type KbDocument,
  type SetupFact,
} from "./api";

const CATEGORY: Record<string, string> = {
  empresa: "Empresa",
  clientes: "Clientes",
  produtos: "Produtos e serviços",
  atendimento: "Atendimento",
  vendas: "Vendas",
  equipe: "Equipe",
  canais: "Canais",
  outros: "Outros",
};

export const ACCEPT = ".pdf,.docx,.txt,.md,.csv,.html,.htm";

type Tab = "fatos" | "biblioteca" | "pedidos" | "progresso";

function FactRow({ accountId, f }: { accountId: string; f: SetupFact }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(f.value);
  const save = useSaveFact(accountId);
  const del = useDeleteFact(accountId);
  return (
    <li className="group rounded-xl px-3 py-2.5 hover:bg-surface-2">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-medium text-muted-foreground">{f.label}</p>
          {editing ? (
            <div className="mt-1.5 space-y-2">
              <Textarea
                value={value}
                onChange={(e) => setValue(e.target.value)}
                rows={3}
                className="text-[13px]"
                autoFocus
              />
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  disabled={!value.trim() || save.isPending}
                  onClick={() =>
                    save.mutate(
                      { id: f.id, label: f.label, value: value.trim() },
                      {
                        onSuccess: () => setEditing(false),
                        onError: (e) => toast.error(errorMessage(e)),
                      },
                    )
                  }
                >
                  Salvar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => (setValue(f.value), setEditing(false))}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <p className="mt-0.5 text-[13px] leading-snug whitespace-pre-wrap text-foreground">
              {f.value}
            </p>
          )}
        </div>
        {!editing ? (
          <div className="flex shrink-0 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
            <Button
              size="icon"
              variant="ghost"
              className="size-7"
              aria-label={`Corrigir ${f.label}`}
              onClick={() => setEditing(true)}
            >
              <Pencil className="size-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="size-7"
              aria-label={`Apagar ${f.label}`}
              onClick={() => del.mutate(f.id, { onError: (e) => toast.error(errorMessage(e)) })}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ) : null}
      </div>
    </li>
  );
}

function FactsTab({ accountId }: { accountId: string }) {
  const q = useSetupFacts(accountId);
  const facts = q.data ?? [];
  if (q.isPending) return <p className="p-4 text-[13px] text-muted-foreground">Carregando…</p>;
  if (!facts.length)
    return (
      <p className="p-4 text-[13px] leading-relaxed text-muted-foreground">
        Tudo o que você contar para a Nexa aparece aqui, organizado. Se algo estiver errado, corrija
        ou apague: ela passa a usar a versão nova.
      </p>
    );
  const groups = [...new Set(facts.map((f) => f.category))];
  return (
    <div className="space-y-4 p-2">
      {groups.map((g) => (
        <section key={g}>
          <h3 className="eyebrow px-3 pb-1 !text-[10px]">{CATEGORY[g] ?? g}</h3>
          <ul>
            {facts
              .filter((f) => f.category === g)
              .map((f) => (
                <FactRow key={f.id} accountId={accountId} f={f} />
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

const SOURCE_ICON: Record<KbDocument["source"], typeof FileText> = {
  upload: FileText,
  texto: FileText,
  site: Globe,
  google_drive: HardDrive,
  onedrive: HardDrive,
};

function LibraryTab({ accountId }: { accountId: string }) {
  const q = useDocuments(accountId);
  const upload = useUploadDocuments(accountId);
  const del = useDeleteDocument(accountId);
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const docs = q.data ?? [];

  function send(files: FileList | File[] | null) {
    const list = [...(files ?? [])];
    if (!list.length) return;
    upload.mutate(list, {
      onSuccess: (r) => {
        const ok = r.filter((x) => x.ok).length;
        const bad = r.filter((x) => !x.ok);
        if (ok) toast.success(`${ok} arquivo(s) na biblioteca. Os agentes já podem consultar.`);
        for (const b of bad) toast.error(`${b.name}: ${b.error}`);
      },
    });
  }

  return (
    <div className="space-y-3 p-3">
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => (e.preventDefault(), setOver(true))}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => (e.preventDefault(), setOver(false), send(e.dataTransfer.files))}
        className={cn(
          "flex w-full flex-col items-center gap-1.5 rounded-2xl border border-dashed px-4 py-5 text-center transition",
          over ? "border-primary bg-primary/[0.04]" : "border-border hover:bg-surface-2",
        )}
      >
        {upload.isPending ? (
          <Loader2 className="size-5 animate-spin text-subtle" />
        ) : (
          <Upload className="size-5 text-subtle" aria-hidden />
        )}
        <span className="text-[13px] font-medium">Enviar documentos</span>
        <span className="text-[12px] text-muted-foreground">
          PDF, Word, TXT, CSV. Arraste aqui ou clique.
        </span>
      </button>
      <input
        ref={input}
        type="file"
        multiple
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => (send(e.target.files), (e.target.value = ""))}
      />
      <p className="px-1 text-[12px] text-muted-foreground">
        Do Google Drive ou do OneDrive? Peça para a Nexa: “importe os arquivos do meu Drive”.
      </p>
      <ul className="space-y-1">
        {docs.map((d) => {
          const Icon = SOURCE_ICON[d.source] ?? FileText;
          return (
            <li
              key={d.id}
              className="group flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-surface-2"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2">
                <Icon className="size-4 text-muted-foreground" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium" title={d.name}>
                  {d.name}
                </span>
                <span
                  className={cn(
                    "block truncate text-[11px]",
                    d.status === "error" ? "text-danger" : "text-subtle",
                  )}
                  title={d.error ?? undefined}
                >
                  {d.status === "processing"
                    ? "Lendo…"
                    : d.status === "error"
                      ? `Não deu para ler: ${d.error ?? "erro"}`
                      : `${d.chunks} trecho(s) · ${formatRelative(d.created_at)}`}
                </span>
              </span>
              <Button
                size="icon"
                variant="ghost"
                className="size-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                aria-label={`Apagar ${d.name}`}
                onClick={() => del.mutate(d, { onError: (e) => toast.error(errorMessage(e)) })}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const WISH_STATUS: Record<string, string> = {
  novo: "Anotado",
  em_analise: "Em análise pela VIA",
  planejado: "Planejado",
  feito: "Feito",
  descartado: "Não vai entrar",
};

function WishesTab({ accountId }: { accountId: string }) {
  const q = useWishes(accountId);
  const del = useDeleteWish(accountId);
  const list = q.data ?? [];
  if (!list.length)
    return (
      <p className="p-4 text-[13px] leading-relaxed text-muted-foreground">
        Sonhe alto: conte para a Nexa o que você gostaria que a central fizesse. Ela anota aqui e a
        equipe da Viver de IA avalia para adaptar o produto ao seu negócio.
      </p>
    );
  return (
    <ul className="space-y-1 p-2">
      {list.map((w) => (
        <li key={w.id} className="group rounded-xl px-3 py-2.5 hover:bg-surface-2">
          <div className="flex items-start gap-2">
            <Lightbulb className="mt-0.5 size-4 shrink-0 text-warm" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium">{w.title}</p>
              {w.description ? (
                <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
                  {w.description}
                </p>
              ) : null}
              <p className="mt-1 text-[11px] text-subtle">
                {WISH_STATUS[w.status]} · importância {w.importance}
              </p>
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="size-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              aria-label={`Apagar pedido ${w.title}`}
              onClick={() => del.mutate(w.id)}
            >
              <X className="size-3.5" />
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function ProgressTab({ accountId }: { accountId: string }) {
  const roteiro = useRoteiro(accountId, true);
  const steps = roteiro.data?.steps ?? [];
  const required = steps.filter((s) => s.required);
  return (
    <div className="p-3">
      <p className="px-1 pb-2 text-[12px] text-muted-foreground">
        {required.filter((s) => s.done).length} de {required.length} obrigatórios prontos
      </p>
      <ul className="space-y-0.5">
        {steps.map((s) => (
          <li key={s.id} className="flex items-start gap-2.5 rounded-lg px-2 py-1.5">
            {s.done ? (
              <Check className="mt-0.5 size-4 shrink-0 text-foreground" aria-label="pronto" />
            ) : (
              <CircleDashed className="mt-0.5 size-4 shrink-0 text-subtle" aria-label="pendente" />
            )}
            <span className="min-w-0">
              <span className="block text-[13px] font-medium">
                {s.title}
                {s.required ? null : <span className="font-normal text-subtle"> · opcional</span>}
              </span>
              {s.skipped && !s.done ? (
                <span className="block text-[11px] text-muted-foreground">
                  {s.required ? "pulado, mas continua pendente" : "pulado"}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const TABS: { id: Tab; label: string }[] = [
  { id: "fatos", label: "O que já sei" },
  { id: "biblioteca", label: "Biblioteca" },
  { id: "pedidos", label: "Pedidos" },
  { id: "progresso", label: "Progresso" },
];

export function SidePanel({ accountId }: { accountId: string }) {
  const [tab, setTab] = useState<Tab>("fatos");
  const facts = useSetupFacts(accountId).data?.length ?? 0;
  const docs = useDocuments(accountId).data?.length ?? 0;
  const wishes = useWishes(accountId).data?.length ?? 0;
  const count: Partial<Record<Tab, number>> = { fatos: facts, biblioteca: docs, pedidos: wishes };
  return (
    <aside aria-label="O que a Nexa já organizou" className="flex min-h-0 flex-col">
      <div
        role="tablist"
        className="flex shrink-0 gap-1 overflow-x-auto border-b border-border px-2 pt-2"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "-mb-px shrink-0 border-b-2 px-2.5 pb-2 text-[13px] whitespace-nowrap transition",
              tab === t.id
                ? "border-foreground font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {count[t.id] ? (
              <span className="ml-1 text-subtle tabular-nums">{count[t.id]}</span>
            ) : null}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "fatos" ? <FactsTab accountId={accountId} /> : null}
        {tab === "biblioteca" ? <LibraryTab accountId={accountId} /> : null}
        {tab === "pedidos" ? <WishesTab accountId={accountId} /> : null}
        {tab === "progresso" ? <ProgressTab accountId={accountId} /> : null}
      </div>
    </aside>
  );
}
