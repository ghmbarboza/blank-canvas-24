// Regras do piloto automático (motor Agents SDK), sem rede: o que pausa para aprovação do
// gestor, como cada agente se chama dentro do SDK (o estado pausado acha o agente pelo nome)
// e o texto que o gestor lê para decidir.

/** Ferramentas internas que mexem em dinheiro ou disparam para muita gente: pedem o sim. */
export const SENSITIVE_TOOLS = new Set(["asaas_create_charge", "enroll_sequence"]);

/**
 * Pede aprovação? A configuração da ferramenta manda (requires_approval true/false);
 * sem ela, ação em sistema externo (Composio) e as sensíveis pedem; o resto segue sozinho.
 */
export function requiresApproval(
  slug: string,
  opts: { isComposio: boolean; config?: unknown },
): boolean {
  const cfg = (opts.config ?? {}) as { requires_approval?: unknown };
  if (typeof cfg.requires_approval === "boolean") return cfg.requires_approval;
  return opts.isComposio || SENSITIVE_TOOLS.has(slug);
}

/** Nome do agente dentro do SDK: só ASCII, único (sufixo do id) e estável entre pausa e retomada. */
export function sdkAgentName(name: string, id: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return `${base || "agente"}_${id.replace(/-/g, "").slice(0, 6)}`;
}

const brl = (v: unknown) =>
  Number.isFinite(Number(v))
    ? Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : String(v);

/** O que a IA quer fazer, em uma linha que o gestor entende sem abrir nada. */
export function approvalSummary(
  tool: string,
  args: Record<string, unknown>,
  agentName: string,
): string {
  const who = agentName ? `${agentName} quer ` : "A IA quer ";
  if (tool === "asaas_create_charge")
    return `${who}cobrar ${brl(args["value"] ?? args["valor"] ?? args["amount"])}${args["description"] ? ` (${String(args["description"]).slice(0, 120)})` : ""}.`;
  if (tool === "enroll_sequence")
    return `${who}colocar o contato na sequência "${String(args["sequence"] ?? args["sequence_id"] ?? "").slice(0, 80)}".`;
  const shown = Object.entries(args)
    .filter(([, v]) => v !== undefined && v !== "" && typeof v !== "object")
    .slice(0, 4)
    .map(([k, v]) => `${k}: ${String(v).slice(0, 60)}`)
    .join(", ");
  return `${who}usar ${tool}${shown ? ` (${shown})` : ""}.`.slice(0, 600);
}

/** O que o cliente ouve enquanto o gestor decide: não promete, não some. */
export const WAITING_MESSAGE = "Só um instante: vou confirmar isso com a equipe e já te retorno.";

/** O que o modelo lê quando o gestor recusa: sem isso ele achava que ainda estava pendente
 *  e prometia ao cliente fazer depois (28/10: "assim que for liberada, te mando o Pix"). */
export const REJECTION_TO_MODEL =
  "O gestor RECUSOU esta ação. Ela NÃO vai acontecer: não faça, não diga que está pendente e não prometa fazer depois. Diga ao cliente, com educação, que isso não vai ser possível agora e ofereça outra forma de ajudar ou passar para a equipe.";

/** Texto ao cliente quando o gestor recusa e a IA não tem outra resposta. */
export const REJECTED_FALLBACK =
  "Conferi com a equipe e não vou conseguir fazer isso agora. Posso te ajudar de outro jeito?";
