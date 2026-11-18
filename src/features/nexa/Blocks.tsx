// Blocos do palco: o que a Nexa desenha (escolhas, formulário, cartões, etapas) e as ações
// que as ferramentas deixaram. Responder pelo palco vira mensagem da pessoa (answerText).
import { useState, type ComponentType } from "react";
import { toast } from "sonner";
import {
  Copy,
  Building2,
  CalendarDays,
  Car,
  Check,
  Circle,
  CircleAlert,
  ExternalLink,
  FileText,
  Globe,
  GraduationCap,
  HeartPulse,
  Home,
  Instagram,
  KeyRound,
  Lock,
  Mail,
  Megaphone,
  MessageCircle,
  Phone,
  Star,
  Store,
  Users,
  Bot,
  ArrowRight,
} from "lucide-react";

import {
  answerText,
  type StageAction,
  type StageBlock,
  type StageIcon,
} from "@/backend/setup-agent/stage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const ICONS: Record<StageIcon, ComponentType<{ className?: string }>> = {
  saude: HeartPulse,
  imovel: Home,
  loja: Store,
  empresa: Building2,
  carro: Car,
  escola: GraduationCap,
  whatsapp: MessageCircle,
  instagram: Instagram,
  email: Mail,
  telefone: Phone,
  agente: Bot,
  equipe: Users,
  documento: FileText,
  site: Globe,
  anuncio: Megaphone,
  calendario: CalendarDays,
  chave: KeyRound,
  estrela: Star,
  outro: Bot,
};

// cada ícone tem um tom da rampa navy (DS: sem cor solta): ajuda a achar a opção pelo olho
const TONE: Partial<Record<StageIcon, string>> = {
  saude: "bg-hot-soft text-hot-fg",
  imovel: "bg-warm-soft text-warm-fg",
  loja: "bg-cold-soft text-cold-fg",
  whatsapp: "bg-hot-soft text-hot-fg",
  instagram: "bg-warm-soft text-warm-fg",
  anuncio: "bg-cold-soft text-cold-fg",
  agente: "bg-primary-soft text-foreground",
};

function Glyph({ icon, className }: { icon?: StageIcon | undefined; className?: string }) {
  const Icon = ICONS[icon ?? "outro"];
  return (
    <span
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-full",
        TONE[icon ?? "outro"] ?? "bg-surface-2 text-foreground/70",
        className,
      )}
    >
      <Icon className="size-[18px]" />
    </span>
  );
}

function Head({
  title,
  hint,
  compact,
}: {
  title: string;
  hint?: string | undefined;
  compact?: boolean | undefined;
}) {
  return (
    <header className={compact ? "mb-3" : "mb-5"}>
      <h3
        className={cn(
          "font-semibold leading-tight tracking-tight",
          compact ? "text-[14px] text-muted-foreground" : "text-[22px] md:text-[26px]",
        )}
      >
        {title}
      </h3>
      {hint ? <p className="mt-1 text-[13.5px] text-muted-foreground">{hint}</p> : null}
    </header>
  );
}

interface BlockProps {
  block: StageBlock;
  /** false quando já foi respondido ou a Nexa está falando: o bloco fica só para leitura */
  active: boolean;
  onAnswer: (text: string) => void;
  /** dentro da conversa: título menor */
  compact?: boolean;
  /** em resposta antiga: o que a pessoa já escolheu */
  picked?: string[];
}

/** Convite e links gerados pela Nexa: copiar para mandar pelo WhatsApp se o e-mail não chegar. */
function copyLink(url: string) {
  void navigator.clipboard
    .writeText(url)
    .then(() => toast.success("Link copiado. Se o e-mail não chegar, mande pelo WhatsApp."))
    .catch(() => toast.error("Não deu para copiar. Selecione o link e copie à mão."));
}

function Choices({
  block,
  active,
  onAnswer,
  compact,
  picked: initial,
}: BlockProps & { block: Extract<StageBlock, { kind: "choices" }> }) {
  const [picked, setPicked] = useState<string[]>(initial ?? []);
  const toggle = (label: string) => {
    if (!active) return;
    if (!block.multiple) {
      setPicked([label]);
      onAnswer(answerText(block, [label]));
      return;
    }
    setPicked((p) => (p.includes(label) ? p.filter((x) => x !== label) : [...p, label]));
  };
  return (
    <div>
      <Head title={block.title} hint={block.hint} compact={compact} />
      <div role={block.multiple ? "group" : "radiogroup"} className="grid gap-3 sm:grid-cols-2">
        {block.options.map((o) => {
          const on = picked.includes(o.label);
          return (
            <button
              key={o.label}
              type="button"
              role={block.multiple ? "checkbox" : "radio"}
              aria-checked={on}
              disabled={!active}
              onClick={() => toggle(o.label)}
              className={cn(
                "group relative flex items-center gap-3.5 rounded-2xl border bg-surface p-4 text-left transition",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                on
                  ? "border-foreground shadow-[0_0_0_1px_var(--foreground)]"
                  : "border-border hover:-translate-y-px hover:border-foreground/30 hover:shadow-[var(--shadow-card)]",
                !active && !on && "opacity-55",
              )}
            >
              <Glyph icon={o.icon} />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold leading-tight">{o.label}</span>
                {o.description ? (
                  <span className="mt-0.5 block text-[13px] text-muted-foreground">
                    {o.description}
                  </span>
                ) : null}
              </span>
              {on ? (
                <span className="grid size-5 place-items-center rounded-full bg-foreground text-background">
                  <Check className="size-3" />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {block.multiple && active ? (
        <div className="mt-4 flex justify-end">
          <Button
            disabled={!picked.length}
            onClick={() => onAnswer(answerText(block, picked))}
            className="rounded-full"
          >
            Confirmar {picked.length ? `(${picked.length})` : ""}
            <ArrowRight className="size-4" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function Form({
  block,
  active,
  onAnswer,
  compact,
}: BlockProps & { block: Extract<StageBlock, { kind: "form" }> }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const missing = block.fields.some((f) => !f.optional && !values[f.name]?.trim());
  const hasSecret = block.fields.some((f) => f.type === "segredo");
  return (
    <div>
      <Head title={block.title} hint={block.hint} compact={compact} />
      <form
        className="rounded-2xl border border-border bg-surface p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!active || missing) return;
          onAnswer(answerText(block, values));
          setValues({}); // segredo não fica parado na tela depois de enviado
        }}
      >
        <div className="grid gap-4">
          {block.fields.map((f) => {
            const id = `nexa-f-${f.name}`;
            const common = {
              id,
              name: f.name,
              disabled: !active,
              value: values[f.name] ?? "",
              placeholder: f.placeholder,
              onChange: (e: { target: { value: string } }) =>
                setValues((v) => ({ ...v, [f.name]: e.target.value })),
            };
            return (
              <div key={f.name} className="grid gap-1.5">
                <label htmlFor={id} className="text-[13px] font-medium">
                  {f.label}
                  {f.optional ? (
                    <span className="ml-1 text-muted-foreground">(opcional)</span>
                  ) : null}
                </label>
                {f.type === "texto_longo" ? (
                  <Textarea {...common} rows={3} />
                ) : (
                  <Input
                    {...common}
                    autoComplete={f.type === "segredo" ? "off" : undefined}
                    type={
                      f.type === "segredo"
                        ? "password"
                        : f.type === "email"
                          ? "email"
                          : f.type === "url"
                            ? "url"
                            : f.type === "telefone"
                              ? "tel"
                              : "text"
                    }
                  />
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          {hasSecret ? (
            <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
              <Lock className="size-3.5" /> A chave vai direto para o cofre e não aparece de novo.
            </p>
          ) : (
            <span />
          )}
          <Button type="submit" disabled={!active || missing} className="rounded-full">
            {block.submit}
            <ArrowRight className="size-4" />
          </Button>
        </div>
      </form>
    </div>
  );
}

function Cards({
  block,
  compact,
}: {
  block: Extract<StageBlock, { kind: "cards" }>;
  compact?: boolean | undefined;
}) {
  return (
    <div>
      <Head title={block.title} hint={block.hint} compact={compact} />
      <div className="grid gap-3 sm:grid-cols-2">
        {block.cards.map((c) => (
          <article
            key={c.title}
            className="overflow-hidden rounded-2xl border border-border bg-surface"
          >
            {c.image ? (
              <img
                src={c.image}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
                className="h-32 w-full object-cover"
              />
            ) : null}
            <div className="flex gap-3 p-4">
              {c.icon ? <Glyph icon={c.icon} className="size-9" /> : null}
              <div className="min-w-0">
                <h4 className="text-[15px] font-semibold leading-tight">{c.title}</h4>
                {c.text ? <p className="mt-1 text-[13px] text-muted-foreground">{c.text}</p> : null}
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function Steps({
  block,
  compact,
}: {
  block: Extract<StageBlock, { kind: "steps" }>;
  compact?: boolean | undefined;
}) {
  return (
    <div>
      <Head title={block.title} hint={block.hint} compact={compact} />
      <ol className="relative grid gap-0">
        {block.steps.map((s, i) => (
          <li key={`${s.label}-${i}`} className="relative flex gap-4 pb-5 last:pb-0">
            {i < block.steps.length - 1 ? (
              <span
                aria-hidden
                className="absolute left-[13px] top-7 h-[calc(100%-20px)] w-px bg-border"
              />
            ) : null}
            <span
              className={cn(
                "relative grid size-7 shrink-0 place-items-center rounded-full border",
                s.state === "feito" && "border-foreground bg-foreground text-background",
                s.state === "agora" && "border-foreground bg-surface text-foreground",
                s.state === "depois" && "border-border bg-surface text-muted-foreground",
              )}
            >
              {s.state === "feito" ? (
                <Check className="size-3.5" />
              ) : (
                <Circle className={cn("size-2.5", s.state === "agora" && "fill-current")} />
              )}
            </span>
            <span
              className={cn(
                "pt-1 text-[15px]",
                s.state === "agora"
                  ? "font-semibold"
                  : s.state === "depois" && "text-muted-foreground",
              )}
            >
              {s.label}
              {s.state === "agora" ? (
                <span className="ml-2 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium">
                  agora
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function StageBlockView(props: BlockProps) {
  const b = props.block;
  if (b.kind === "choices") return <Choices {...props} block={b} />;
  if (b.kind === "form") return <Form {...props} block={b} />;
  if (b.kind === "cards") return <Cards block={b} compact={props.compact} />;
  return <Steps block={b} compact={props.compact} />;
}

/** O que as ferramentas deixaram: botão de conexão, atalho para tela, feito, erro. */
export function ActionList({
  actions,
  onOpen,
}: {
  actions: StageAction[];
  onOpen: (to: string) => void;
}) {
  if (!actions.length) return null;
  return (
    <ul className="grid gap-2" aria-label="O que a Nexa fez">
      {actions.map((a, i) => (
        <li
          key={`${a.tool}-${i}`}
          className={cn(
            "flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-[14px]",
            a.kind === "error"
              ? "border-destructive/30 bg-destructive/5 text-destructive"
              : "border-border bg-surface",
          )}
        >
          {a.kind === "error" ? (
            <CircleAlert className="size-4 shrink-0" />
          ) : a.kind === "done" ? (
            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary-soft text-foreground">
              <Check className="size-3" />
            </span>
          ) : (
            <Bot className="size-4 shrink-0 text-muted-foreground" />
          )}
          <span className="min-w-0 flex-1">{a.label}</span>
          {a.kind === "link" && a.url ? (
            <span className="flex shrink-0 gap-1.5">
              <Button
                size="sm"
                variant="outline"
                className="rounded-full"
                onClick={() => copyLink(a.url!)}
              >
                <Copy className="size-3.5" aria-hidden /> Copiar link
              </Button>
              <Button asChild size="sm" className="rounded-full">
                <a href={a.url} target="_blank" rel="noopener noreferrer">
                  Abrir <ExternalLink className="size-3.5" />
                </a>
              </Button>
            </span>
          ) : null}
          {a.kind === "open" && a.to ? (
            <Button
              size="sm"
              variant="outline"
              className="rounded-full"
              onClick={() => onOpen(a.to!)}
            >
              Ir agora <ArrowRight className="size-3.5" />
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
