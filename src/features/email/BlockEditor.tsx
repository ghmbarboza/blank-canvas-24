import { useMemo, useState } from "react";
import {
  AlignCenter,
  AlignLeft,
  ArrowDown,
  ArrowUp,
  Braces,
  Heading1,
  Image as ImageIcon,
  Minus,
  Monitor,
  MousePointerClick,
  Smartphone,
  Space,
  Trash2,
  Type,
  type LucideIcon,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { fieldsFor, useCustomFields } from "@/features/custom-fields/api";
import { cn } from "@/lib/utils";

import {
  VARIABLES,
  blocksToHtml,
  newBlock,
  renderVariables,
  type BlockType,
  type EmailBlock,
} from "./render";

const BLOCKS: { type: BlockType; label: string; icon: LucideIcon }[] = [
  { type: "heading", label: "Título", icon: Heading1 },
  { type: "text", label: "Texto", icon: Type },
  { type: "image", label: "Imagem", icon: ImageIcon },
  { type: "button", label: "Botão", icon: MousePointerClick },
  { type: "divider", label: "Divisor", icon: Minus },
  { type: "spacer", label: "Espaço", icon: Space },
];

const SAMPLE = {
  nome: "Maria Silva",
  primeiro_nome: "Maria",
  email: "maria@empresa.com.br",
  empresa: "Empresa Exemplo",
  cargo: "Diretora",
  cidade: "São Paulo",
  vendedor: "Seu nome",
};

interface Props {
  accountId: string;
  blocks: EmailBlock[];
  onChange: (blocks: EmailBlock[]) => void;
  preheader: string;
  brand: string;
  marketing: boolean;
}

// Editor de blocos com pré-visualização ao vivo (computador e celular), como o cliente vai ver.
export function BlockEditor({ accountId, blocks, onChange, preheader, brand, marketing }: Props) {
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [focus, setFocus] = useState<string | null>(blocks[0]?.id ?? null);
  const custom = useCustomFields(accountId);
  const vars = [
    ...VARIABLES,
    ...fieldsFor(custom.data, "contact").map((f) => ({ key: `campo.${f.key}`, label: f.label })),
  ];

  const preview = useMemo(() => {
    const html = blocksToHtml(blocks, { preheader, brand: { name: brand }, marketing });
    return renderVariables(html, SAMPLE, true).out.replace(/\{\{\s*unsubscribe_url\s*\}\}/g, "#");
  }, [blocks, preheader, brand, marketing]);

  const update = (id: string, patch: Partial<EmailBlock>) =>
    onChange(blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange(next);
  };
  const add = (type: BlockType) => {
    const b = newBlock(type);
    onChange([...blocks, b]);
    setFocus(b.id);
  };
  const insertVar = (id: string, key: string) => {
    const b = blocks.find((x) => x.id === id);
    if (b) update(id, { text: `${b.text ?? ""}{{${key}}}` });
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {BLOCKS.map((b) => (
            <button
              key={b.type}
              type="button"
              onClick={() => add(b.type)}
              className="lift inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-[12px] font-medium hover:bg-surface-2"
            >
              <b.icon className="size-3.5" aria-hidden /> {b.label}
            </button>
          ))}
        </div>
        {blocks.length === 0 && (
          <p className="rounded-2xl border border-dashed border-border p-6 text-center text-[13px] text-muted-foreground">
            Comece por um título e um texto. O rodapé com descadastro entra sozinho.
          </p>
        )}
        <ol className="space-y-2">
          {blocks.map((b, i) => {
            const meta = BLOCKS.find((x) => x.type === b.type)!;
            const open = focus === b.id;
            return (
              <li
                key={b.id}
                className={cn(
                  "rounded-2xl border bg-surface transition-colors",
                  open ? "border-primary" : "border-border",
                )}
              >
                <div className="flex items-center gap-2 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setFocus(open ? null : b.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <meta.icon className="size-4 shrink-0 text-subtle" aria-hidden />
                    <span className="truncate text-[13px] font-medium">{meta.label}</span>
                    <span className="truncate text-[12px] text-subtle">
                      {b.text ?? b.src ?? ""}
                    </span>
                  </button>
                  <IconBtn label="Subir" onClick={() => move(i, -1)}>
                    <ArrowUp className="size-3.5" />
                  </IconBtn>
                  <IconBtn label="Descer" onClick={() => move(i, 1)}>
                    <ArrowDown className="size-3.5" />
                  </IconBtn>
                  <IconBtn
                    label="Remover"
                    danger
                    onClick={() => onChange(blocks.filter((x) => x.id !== b.id))}
                  >
                    <Trash2 className="size-3.5" />
                  </IconBtn>
                </div>
                {open && (
                  <div className="grid gap-3 border-t border-border p-3">
                    {(b.type === "heading" || b.type === "text" || b.type === "button") && (
                      <div className="grid gap-1.5">
                        <div className="flex items-center justify-between">
                          <Label htmlFor={`blk-${b.id}`}>
                            {b.type === "button" ? "Texto do botão" : "Texto"}
                          </Label>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                              >
                                <Braces className="size-3" /> Inserir variável
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {vars.map((v) => (
                                <DropdownMenuItem
                                  key={v.key}
                                  onSelect={() => insertVar(b.id, v.key)}
                                >
                                  {v.label}{" "}
                                  <span className="ml-auto font-mono text-[10px] text-subtle">{`{{${v.key}}}`}</span>
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        {b.type === "text" ? (
                          <Textarea
                            id={`blk-${b.id}`}
                            rows={5}
                            value={b.text ?? ""}
                            onChange={(e) => update(b.id, { text: e.target.value })}
                          />
                        ) : (
                          <Input
                            id={`blk-${b.id}`}
                            value={b.text ?? ""}
                            onChange={(e) => update(b.id, { text: e.target.value })}
                          />
                        )}
                        {b.type === "text" && (
                          <p className="text-[11px] text-subtle">
                            Use **texto** para negrito. Variável sem valor barra o envio; use{" "}
                            {"{{primeiro_nome | cliente}}"} para ter um padrão.
                          </p>
                        )}
                      </div>
                    )}
                    {b.type === "image" && (
                      <>
                        <Field
                          id={`src-${b.id}`}
                          label="Endereço da imagem (https)"
                          value={b.src ?? ""}
                          onChange={(v) => update(b.id, { src: v })}
                        />
                        <Field
                          id={`alt-${b.id}`}
                          label="Descrição (para quem não vê imagens)"
                          value={b.alt ?? ""}
                          onChange={(v) => update(b.id, { alt: v })}
                        />
                      </>
                    )}
                    {(b.type === "button" || b.type === "image") && (
                      <Field
                        id={`url-${b.id}`}
                        label={
                          b.type === "image" ? "Link ao clicar (opcional)" : "Link do botão (https)"
                        }
                        value={b.url ?? ""}
                        onChange={(v) => update(b.id, { url: v })}
                      />
                    )}
                    {(b.type === "heading" || b.type === "text" || b.type === "button") && (
                      <div className="flex gap-1">
                        {(["left", "center"] as const).map((al) => (
                          <button
                            key={al}
                            type="button"
                            aria-label={al === "left" ? "Alinhar à esquerda" : "Centralizar"}
                            onClick={() => update(b.id, { align: al })}
                            className={cn(
                              "rounded-lg border p-1.5",
                              (b.align ?? "left") === al
                                ? "border-primary bg-primary-soft"
                                : "border-border",
                            )}
                          >
                            {al === "left" ? (
                              <AlignLeft className="size-3.5" />
                            ) : (
                              <AlignCenter className="size-3.5" />
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </div>
      <div className="lg:sticky lg:top-4 lg:self-start">
        <div className="mb-2 flex items-center justify-between">
          <p className="eyebrow">Pré-visualização</p>
          <div className="flex rounded-full border border-border p-0.5">
            {(["desktop", "mobile"] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDevice(d)}
                aria-label={d === "desktop" ? "Computador" : "Celular"}
                className={cn(
                  "rounded-full p-1.5",
                  device === d ? "bg-primary text-primary-foreground" : "text-subtle",
                )}
              >
                {d === "desktop" ? (
                  <Monitor className="size-3.5" />
                ) : (
                  <Smartphone className="size-3.5" />
                )}
              </button>
            ))}
          </div>
        </div>
        <div className="grid place-items-center rounded-[24px] border border-border bg-surface-2 p-3">
          <iframe
            title="Pré-visualização do e-mail"
            srcDoc={preview}
            sandbox=""
            className={cn(
              "rounded-2xl border border-border bg-white transition-[width]",
              device === "desktop" ? "h-[620px] w-full" : "h-[620px] w-[375px] max-w-full",
            )}
          />
        </div>
        <p className="mt-2 text-[11px] text-subtle">
          Exemplo com dados fictícios (Maria Silva). Os links e o pixel de abertura entram no envio.
        </p>
      </div>
    </div>
  );
}

function IconBtn({
  label,
  onClick,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "rounded-full p-1.5 text-subtle hover:bg-surface-2",
        danger ? "hover:text-danger" : "hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
