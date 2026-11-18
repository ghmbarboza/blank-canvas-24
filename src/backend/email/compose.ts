// Saída da IA que escreve e-mail marketing → blocos do editor (sem rede, testável). A IA só
// propõe: aqui o texto é limpo, o link é conferido e o e-mail nunca sai sem descadastro (o
// render coloca). Nada vai para a base sem a pessoa revisar no editor.
import type { EmailBlock } from "@/features/email/render";

export interface ComposedEmail {
  subject: string;
  preheader: string;
  blocks: EmailBlock[];
}

export interface RawComposed {
  subject?: unknown;
  preheader?: unknown;
  blocks?: { type?: unknown; text?: unknown; url?: unknown }[];
}

export const COMPOSE_SCHEMA = {
  type: "object",
  properties: {
    subject: { type: "string", description: "Assunto, até 60 caracteres, sem caixa alta" },
    preheader: { type: "string", description: "Texto de prévia, até 90 caracteres" },
    blocks: {
      type: "array",
      description: "Corpo em blocos, na ordem",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["heading", "text", "button", "divider"] },
          text: { type: "string" },
          url: { type: "string", description: "Só no botão: link https real ou vazio" },
        },
        required: ["type", "text"],
      },
    },
  },
  required: ["subject", "preheader", "blocks"],
} as const;

const TYPES = new Set(["heading", "text", "button", "divider"]);
const clean = (v: unknown, max: number) =>
  String(v ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+\n/g, "\n")
    .trim()
    .slice(0, max);

export function toBlocks(raw: RawComposed, fallbackUrl: string | null): ComposedEmail {
  let n = 0;
  const id = () => `ia-${Date.now().toString(36)}-${(n += 1)}`;
  const blocks: EmailBlock[] = [];
  for (const b of (raw.blocks ?? []).slice(0, 14)) {
    const type = String(b?.type ?? "");
    if (!TYPES.has(type)) continue;
    if (type === "divider") {
      blocks.push({ id: id(), type: "divider" });
      continue;
    }
    const text = clean(b.text, type === "heading" ? 120 : 1500);
    if (!text) continue;
    if (type === "button") {
      const url = String(b.url ?? "").trim();
      const ok = /^https:\/\/[^\s"<>]+$/i.test(url) ? url : fallbackUrl;
      // botão sem link de verdade não vai: vira frase no texto
      if (!ok) blocks.push({ id: id(), type: "text", text });
      else
        blocks.push({
          id: id(),
          type: "button",
          text: text.slice(0, 40),
          url: ok,
          align: "center",
        });
      continue;
    }
    blocks.push({ id: id(), type: type as "heading" | "text", text });
  }
  return {
    subject: clean(raw.subject, 120) || "Novidade para você",
    preheader: clean(raw.preheader, 160),
    blocks,
  };
}
