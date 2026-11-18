import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Copy,
  ExternalLink,
  LayoutTemplate,
  Loader2,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Textarea } from "@/components/ui/textarea";
import { useAccount } from "@/lib/account";
import { formatNumber, formatRelative } from "@/lib/format";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";

import {
  useDeleteLanding,
  useForms,
  useLandingPage,
  useLandingPages,
  useSaveLanding,
  type LandingRow,
} from "./api";
import { DeleteWithConfirm } from "./DeleteWithConfirm";
import { copyText } from "./copy-text";
import { LandingView } from "./LandingView";
import { BLOCK_LABEL, type LandingBlock } from "./types";

function slugify(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

const STARTER: LandingBlock[] = [
  {
    id: "b1",
    type: "hero",
    title: "Venda mais com atendimento que não deixa ninguém esperando",
    subtitle: "Conte o que você precisa e um especialista retorna ainda hoje.",
    cta: "Quero falar com um especialista",
  },
  {
    id: "b2",
    type: "features",
    title: "Por que escolher a gente",
    items: [
      { title: "Resposta rápida", text: "Atendimento em minutos, não em dias." },
      { title: "Sob medida", text: "Proposta pensada para o seu momento." },
      { title: "Sem amarras", text: "Comece pequeno e cresça quando quiser." },
    ],
  },
  { id: "b3", type: "form", title: "Fale com a gente", subtitle: "Leva menos de um minuto." },
  {
    id: "b4",
    type: "faq",
    title: "Perguntas frequentes",
    items: [{ q: "Quanto tempo leva para começar?", a: "Normalmente menos de uma semana." }],
  },
];

export function LandingPagesPage() {
  const { current, isManager } = useAccount();
  const accountId = current!.accountId;
  const pages = useLandingPages(accountId);
  const save = useSaveLanding(accountId);
  const navigate = useNavigate();
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  async function create() {
    const title = "Nova página";
    try {
      const p = await save.mutateAsync({
        title,
        slug: `${slugify(current!.accountName)}-${Date.now().toString(36)}`,
        blocks: STARTER,
        published: false,
      });
      void navigate({ to: "/formularios/paginas/$pageId", params: { pageId: p.id } });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="Landing pages"
        description="Páginas simples para campanhas, com formulário e atribuição"
        actions={
          <>
            <Button variant="ghost" asChild>
              <Link to="/formularios">
                <ArrowLeft /> Captação
              </Link>
            </Button>
            {isManager && (
              <Button onClick={() => void create()} disabled={save.isPending}>
                {save.isPending ? <Loader2 className="animate-spin" /> : <Plus />} Nova página
              </Button>
            )}
          </>
        }
      />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {pages.isPending ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {Array.from({ length: 2 }, (_, i) => (
              <Skeleton key={i} className="h-32 rounded-[24px]" />
            ))}
          </div>
        ) : (pages.data ?? []).length === 0 ? (
          <EmptyState
            icon={LayoutTemplate}
            title="Nenhuma página ainda"
            description="Monte uma página de campanha em minutos: capa, benefícios, depoimento, perguntas e o formulário."
          />
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {(pages.data ?? []).map((p) => (
              <li key={p.id} className="lift rounded-[24px] border border-border bg-surface p-5">
                <div className="flex items-start gap-3">
                  <Link
                    to="/formularios/paginas/$pageId"
                    params={{ pageId: p.id }}
                    className="min-w-0 flex-1"
                  >
                    <p className="truncate text-[15px] font-semibold hover:underline">{p.title}</p>
                    <p className="truncate font-mono text-[11px] text-subtle">/p/{p.slug}</p>
                  </Link>
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[11px] font-medium",
                      p.published
                        ? "bg-primary text-primary-foreground"
                        : "bg-surface-2 text-muted-foreground",
                    )}
                  >
                    {p.published ? "Publicada" : "Rascunho"}
                  </span>
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-[12px] text-subtle">
                  <span>
                    {formatNumber(p.views)} visitas · editada {formatRelative(p.updated_at)}
                  </span>
                  {p.published && (
                    <span className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => copyText(`${origin}/p/${p.slug}`)}
                      >
                        <Copy />
                      </Button>
                      <Button size="sm" variant="ghost" asChild>
                        <a
                          href={`/p/${p.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Abrir a página ${p.slug} em nova aba`}
                        >
                          <ExternalLink aria-hidden />
                        </a>
                      </Button>
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function newBlock(type: LandingBlock["type"]): LandingBlock {
  const id = `b${Date.now().toString(36)}`;
  switch (type) {
    case "hero":
      return {
        id,
        type,
        title: "Título principal",
        subtitle: "Uma frase que explica o valor.",
        cta: "Quero saber mais",
      };
    case "features":
      return {
        id,
        type,
        title: "Benefícios",
        items: [{ title: "Benefício", text: "Explique em uma frase." }],
      };
    case "text":
      return { id, type, title: "Título", body: "Texto livre." };
    case "form":
      return { id, type, title: "Fale com a gente" };
    case "testimonial":
      return { id, type, quote: "O que o cliente disse.", author: "Nome", role: "Cargo, empresa" };
    case "faq":
      return {
        id,
        type,
        title: "Perguntas frequentes",
        items: [{ q: "Pergunta?", a: "Resposta." }],
      };
    case "cta":
      return { id, type, title: "Pronto para começar?", button: "Falar com especialista" };
  }
}

export function LandingBuilder({ pageId }: { pageId: string }) {
  const { current, isManager } = useAccount();
  const accountId = current!.accountId;
  const q = useLandingPage(pageId);
  const forms = useForms(accountId);
  const save = useSaveLanding(accountId);
  const remove = useDeleteLanding(accountId);
  const navigate = useNavigate();
  const [draft, setDraft] = useState<LandingRow | null>(null);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (q.data && !dirty) setDraft(q.data);
  }, [q.data, dirty]);

  if (q.isPending)
    return (
      <div className="p-6">
        <Skeleton className="h-[70dvh] rounded-[24px]" />
      </div>
    );
  if (!draft) return <EmptyState icon={LayoutTemplate} title="Página não encontrada" />;
  const ro = !isManager;
  const upd = (patch: Partial<LandingRow>) => {
    setDraft((d) => (d ? { ...d, ...patch } : d));
    setDirty(true);
  };
  const setBlock = (i: number, b: LandingBlock) =>
    upd({ blocks: draft.blocks.map((x, j) => (j === i ? b : x)) });
  const move = (i: number, dir: -1 | 1) => {
    const arr = [...draft.blocks];
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
    upd({ blocks: arr });
  };
  const selectedForm = (forms.data ?? []).find((f) => f.id === draft.form_id);
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  async function persist() {
    if (!draft) return;
    if (!/^[a-z0-9](?:[a-z0-9-]{1,60})[a-z0-9]$/.test(draft.slug)) {
      toast.error("Endereço inválido: use letras minúsculas, números e hífen (3 a 62).");
      return;
    }
    try {
      const saved = await save.mutateAsync({
        id: draft.id,
        title: draft.title,
        slug: draft.slug,
        description: draft.description,
        blocks: draft.blocks,
        form_id: draft.form_id,
        theme: draft.theme,
        published: draft.published,
      });
      setDraft(saved);
      setDirty(false);
      toast.success(saved.published ? "Página publicada" : "Página salva");
    } catch (err) {
      const msg = errorMessage(err);
      toast.error(msg.includes("landing_pages_slug_key") ? "Esse endereço já está em uso" : msg);
    }
  }

  const blockEditor = (b: LandingBlock, i: number) => {
    const t = (label: string, value: string, onChange: (v: string) => void, rows?: number) => (
      <div className="grid gap-1">
        <Label className="text-[11px]">{label}</Label>
        {rows ? (
          <Textarea
            rows={rows}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={ro}
          />
        ) : (
          <Input value={value} onChange={(e) => onChange(e.target.value)} disabled={ro} />
        )}
      </div>
    );
    switch (b.type) {
      case "hero":
        return (
          <>
            {t("Título", b.title, (v) => setBlock(i, { ...b, title: v }))}
            {t("Subtítulo", b.subtitle ?? "", (v) => setBlock(i, { ...b, subtitle: v }), 2)}
            {t("Botão (rola até o formulário)", b.cta ?? "", (v) => setBlock(i, { ...b, cta: v }))}
          </>
        );
      case "text":
        return (
          <>
            {t("Título", b.title ?? "", (v) => setBlock(i, { ...b, title: v }))}
            {t("Texto", b.body, (v) => setBlock(i, { ...b, body: v }), 4)}
          </>
        );
      case "form":
        return (
          <>
            {t("Título", b.title ?? "", (v) => setBlock(i, { ...b, title: v }))}
            {t("Subtítulo", b.subtitle ?? "", (v) => setBlock(i, { ...b, subtitle: v }))}
          </>
        );
      case "testimonial":
        return (
          <>
            {t("Depoimento", b.quote, (v) => setBlock(i, { ...b, quote: v }), 3)}
            {t("Quem", b.author, (v) => setBlock(i, { ...b, author: v }))}
            {t("Cargo e empresa", b.role ?? "", (v) => setBlock(i, { ...b, role: v }))}
          </>
        );
      case "cta":
        return (
          <>
            {t("Título", b.title, (v) => setBlock(i, { ...b, title: v }))}
            {t("Botão", b.button, (v) => setBlock(i, { ...b, button: v }))}
          </>
        );
      case "features":
        return (
          <>
            {t("Título", b.title ?? "", (v) => setBlock(i, { ...b, title: v }))}
            {b.items.map((it, k) => (
              <div key={k} className="grid gap-1 rounded-xl border border-border p-2">
                <Input
                  value={it.title}
                  onChange={(e) =>
                    setBlock(i, {
                      ...b,
                      items: b.items.map((x, z) => (z === k ? { ...x, title: e.target.value } : x)),
                    })
                  }
                  disabled={ro}
                  aria-label="Título do benefício"
                />
                <Textarea
                  rows={2}
                  value={it.text}
                  onChange={(e) =>
                    setBlock(i, {
                      ...b,
                      items: b.items.map((x, z) => (z === k ? { ...x, text: e.target.value } : x)),
                    })
                  }
                  disabled={ro}
                  aria-label="Texto do benefício"
                />
                {!ro && (
                  <button
                    type="button"
                    className="justify-self-end text-[11px] text-subtle hover:text-danger"
                    onClick={() => setBlock(i, { ...b, items: b.items.filter((_, z) => z !== k) })}
                  >
                    remover
                  </button>
                )}
              </div>
            ))}
            {!ro && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  setBlock(i, { ...b, items: [...b.items, { title: "Benefício", text: "" }] })
                }
              >
                <Plus /> Item
              </Button>
            )}
          </>
        );
      case "faq":
        return (
          <>
            {t("Título", b.title ?? "", (v) => setBlock(i, { ...b, title: v }))}
            {b.items.map((it, k) => (
              <div key={k} className="grid gap-1 rounded-xl border border-border p-2">
                <Input
                  value={it.q}
                  onChange={(e) =>
                    setBlock(i, {
                      ...b,
                      items: b.items.map((x, z) => (z === k ? { ...x, q: e.target.value } : x)),
                    })
                  }
                  disabled={ro}
                  aria-label="Pergunta"
                />
                <Textarea
                  rows={2}
                  value={it.a}
                  onChange={(e) =>
                    setBlock(i, {
                      ...b,
                      items: b.items.map((x, z) => (z === k ? { ...x, a: e.target.value } : x)),
                    })
                  }
                  disabled={ro}
                  aria-label="Resposta"
                />
              </div>
            ))}
            {!ro && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  setBlock(i, { ...b, items: [...b.items, { q: "Pergunta?", a: "" }] })
                }
              >
                <Plus /> Pergunta
              </Button>
            )}
          </>
        );
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="atmosphere flex flex-wrap items-center gap-3 border-b border-border bg-background px-4 py-3 sm:px-6">
        <Link
          to="/formularios/paginas"
          className="rounded-full p-1.5 text-subtle hover:bg-surface-2"
          aria-label="Voltar"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <Input
          value={draft.title}
          onChange={(e) => upd({ title: e.target.value })}
          disabled={ro}
          className="h-9 max-w-xs border-transparent bg-transparent font-display text-[18px] font-semibold shadow-none hover:border-border"
          aria-label="Título da página"
        />
        <label className="flex items-center gap-2 text-[13px]">
          <Switch
            checked={draft.published}
            onCheckedChange={(c) => upd({ published: c })}
            disabled={ro}
          />{" "}
          {draft.published ? "Publicada" : "Rascunho"}
        </label>
        <div className="ml-auto flex gap-2">
          {draft.published && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => copyText(`${origin}/p/${draft.slug}`)}
            >
              <Copy /> Link
            </Button>
          )}
          {!ro && (
            <DeleteWithConfirm
              title={`Excluir “${draft.title}”?`}
              description={`${draft.published ? "Esta página está publicada. " : ""}O endereço dela para de funcionar na hora, inclusive em anúncios e no site. Os contatos que chegaram por ela continuam guardados. Para só tirar do ar, desligue a publicação em vez de excluir.`}
              pending={remove.isPending}
              onConfirm={() =>
                remove
                  .mutateAsync(draft.id)
                  .then(() => {
                    toast.success("Página excluída");
                    void navigate({ to: "/formularios/paginas" });
                    return true;
                  })
                  .catch((e: unknown) => {
                    toast.error(errorMessage(e));
                    return false;
                  })
              }
            />
          )}
          {!ro && (
            <Button size="sm" onClick={() => void persist()} disabled={!dirty || save.isPending}>
              {save.isPending ? <Loader2 className="animate-spin" /> : <Save />} Salvar
            </Button>
          )}
        </div>
      </header>
      <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-4 sm:p-6 xl:grid-cols-[400px_minmax(0,1fr)]">
        <div className="space-y-4">
          <section className="rounded-[24px] border border-border bg-surface p-4">
            <p className="eyebrow mb-3">Página</p>
            <div className="grid gap-3">
              <div className="grid gap-1">
                <Label className="text-[11px]">Endereço</Label>
                <div className="flex items-center gap-1 text-[12px] text-subtle">
                  /p/
                  <Input
                    value={draft.slug}
                    onChange={(e) => upd({ slug: slugify(e.target.value) })}
                    disabled={ro}
                    className="h-8 font-mono text-[12px]"
                  />
                </div>
              </div>
              <div className="grid gap-1">
                <Label className="text-[11px]">Formulário</Label>
                <Select
                  value={draft.form_id ?? "__none"}
                  onValueChange={(v) => upd({ form_id: v === "__none" ? null : v })}
                  disabled={ro}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Nenhum</SelectItem>
                    {(forms.data ?? []).map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1">
                <Label className="text-[11px]">Cor principal</Label>
                <Input
                  type="color"
                  className="h-9 w-24 p-1"
                  value={draft.theme.accent ?? "#0A1F3B"}
                  onChange={(e) => upd({ theme: { ...draft.theme, accent: e.target.value } })}
                  disabled={ro}
                />
              </div>
            </div>
          </section>
          <section className="rounded-[24px] border border-border bg-surface p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="eyebrow">Blocos</p>
              {!ro && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline">
                      <Plus /> Bloco
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {(Object.keys(BLOCK_LABEL) as LandingBlock["type"][]).map((t) => (
                      <DropdownMenuItem
                        key={t}
                        onSelect={() => upd({ blocks: [...draft.blocks, newBlock(t)] })}
                      >
                        {BLOCK_LABEL[t]}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
            <ul className="space-y-3">
              {draft.blocks.map((b, i) => (
                <li key={b.id} className="rounded-2xl border border-border bg-surface-2/40 p-3">
                  <div className="mb-2 flex items-center gap-1">
                    <p className="flex-1 text-[12px] font-semibold">{BLOCK_LABEL[b.type]}</p>
                    <button
                      type="button"
                      aria-label="Subir"
                      onClick={() => move(i, -1)}
                      disabled={ro}
                      className="rounded-full p-1 text-subtle hover:bg-surface"
                    >
                      <ArrowUp className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label="Descer"
                      onClick={() => move(i, 1)}
                      disabled={ro}
                      className="rounded-full p-1 text-subtle hover:bg-surface"
                    >
                      <ArrowDown className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label="Remover bloco"
                      onClick={() => upd({ blocks: draft.blocks.filter((_, j) => j !== i) })}
                      disabled={ro}
                      className="rounded-full p-1 text-subtle hover:bg-surface hover:text-danger"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                  <div className="grid gap-2">{blockEditor(b, i)}</div>
                </li>
              ))}
            </ul>
          </section>
        </div>
        <div className="min-h-[70dvh] overflow-hidden rounded-[24px] border border-border">
          <div className="flex items-center gap-1.5 border-b border-border bg-surface-2 px-4 py-2">
            <span className="size-2.5 rounded-full bg-border-strong" />
            <span className="size-2.5 rounded-full bg-border-strong" />
            <span className="size-2.5 rounded-full bg-border-strong" />
            <span className="ml-3 truncate font-mono text-[11px] text-subtle">
              {origin}/p/{draft.slug}
            </span>
          </div>
          <div className="max-h-[75dvh] overflow-y-auto">
            <LandingView
              title={draft.title}
              blocks={draft.blocks}
              form={
                selectedForm
                  ? {
                      id: selectedForm.id,
                      title: selectedForm.title ?? selectedForm.name,
                      description: selectedForm.description,
                      fields: selectedForm.fields,
                      consent: selectedForm.consent,
                      submit_label: selectedForm.submit_label,
                      theme: selectedForm.theme,
                    }
                  : null
              }
              accent={draft.theme.accent ?? "#0A1F3B"}
              preview
            />
          </div>
        </div>
      </div>
    </div>
  );
}
