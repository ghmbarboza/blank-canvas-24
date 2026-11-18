// Forma de um modelo aprovado do WhatsApp para a tela de envio: texto de prévia, os campos que a pessoa
// preenche e, quando o Vínculo ainda não consegue enviar o modelo, o motivo em linguagem simples.
// A Zernio recebe os valores numa lista só, na ordem em que aparecem: cabeçalho de texto, corpo e
// botões de link (https://docs.zernio.com, "Send a template").

export interface TemplateComponent {
  type: string;
  format?: string;
  text?: string;
  buttons?: { type?: string; text?: string; url?: string }[];
}

export interface TemplateSlot {
  /** Onde a variável aparece, para o rótulo do campo. */
  where: "cabeçalho" | "corpo" | "botão";
  /** Nome no modelo: "1", "2"… ou o nome dado na Meta ("nome", "data"). */
  name: string;
}

export interface TemplateShape {
  header: string;
  body: string;
  slots: TemplateSlot[];
  /** Preenchido quando o modelo não pode sair pelo Vínculo (ex.: imagem no topo). */
  unsupported: string | null;
}

const VAR = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;
const HAS_VAR = /\{\{\s*[A-Za-z0-9_]+\s*\}\}/;
const MEDIA_HEADER: Record<string, string> = {
  IMAGE: "imagem",
  VIDEO: "vídeo",
  DOCUMENT: "documento",
  LOCATION: "localização",
};

/** Variáveis na ordem da primeira aparição; numeradas ({{1}}, {{2}}) seguem a ordem do número. */
function varsOf(text: string): string[] {
  const seen: string[] = [];
  for (const m of text.matchAll(VAR)) {
    const name = m[1] ?? "";
    if (name && !seen.includes(name)) seen.push(name);
  }
  return seen.every((n) => /^\d+$/.test(n))
    ? [...seen].sort((a, b) => Number(a) - Number(b))
    : seen;
}

export function templateShape(components: TemplateComponent[] | undefined): TemplateShape {
  const list = components ?? [];
  const head = list.find((c) => c.type === "HEADER");
  const bodyText = list.find((c) => c.type === "BODY")?.text ?? "";
  const headFormat = (head?.format ?? "TEXT").toUpperCase();
  const media = head ? MEDIA_HEADER[headFormat] : undefined;
  const headerText = head && headFormat === "TEXT" ? (head.text ?? "") : "";
  const urlButtons = list
    .filter((c) => c.type === "BUTTONS")
    .flatMap((c) => c.buttons ?? [])
    .filter((b) => (b.type ?? "").toUpperCase() === "URL" && HAS_VAR.test(b.url ?? ""));

  const slots: TemplateSlot[] = [
    ...varsOf(headerText).map((name) => ({ where: "cabeçalho" as const, name })),
    ...varsOf(bodyText).map((name) => ({ where: "corpo" as const, name })),
    ...urlButtons.flatMap((b) =>
      varsOf(b.url ?? "").map((name) => ({ where: "botão" as const, name })),
    ),
  ];
  return {
    header: headerText,
    body: bodyText,
    slots,
    unsupported: media
      ? `Este modelo tem ${media} no topo e o Vínculo ainda não envia mídia em modelo. Escolha um modelo só com texto.`
      : null,
  };
}

/** Prévia com os valores preenchidos; o que estiver vazio continua como {{nome}}. */
export function fillPreview(shape: TemplateShape, values: string[]): string {
  const valueOf = (where: TemplateSlot["where"], name: string) => {
    const i = shape.slots.findIndex((s) => s.where === where && s.name === name);
    return i >= 0 && values[i]?.trim() ? values[i] : `{{${name}}}`;
  };
  const fill = (text: string, where: TemplateSlot["where"]) =>
    text.replace(VAR, (_, name: string) => valueOf(where, name));
  const header = fill(shape.header, "cabeçalho");
  const body = fill(shape.body, "corpo");
  return header ? `${header}\n\n${body}` : body;
}

export function slotLabel(slot: TemplateSlot): string {
  const name = /^\d+$/.test(slot.name) ? `{{${slot.name}}}` : slot.name;
  return slot.where === "corpo" ? `Variável ${name}` : `Variável ${name} (${slot.where})`;
}
