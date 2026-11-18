// Contrato com o Flow CRM (webhook-inbound, WEBHOOKS.md do Flow CRM): POST { action, data } com
// Authorization: Bearer fcrm_… e Idempotency-Key. Puro: a montagem do corpo é testada sem rede.

export interface FlowContact {
  name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  /** canal/origem do primeiro toque (whatsapp, site, formulário, anúncio…) */
  origin: string | null;
}

/** O endereço precisa ser https público: nada de http, IP local ou credencial na URL. */
export function validFlowUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new Error("Endereço inválido: cole o endereço completo do webhook de entrada.");
  }
  if (u.protocol !== "https:") throw new Error("O endereço precisa começar com https://");
  if (u.username || u.password) throw new Error("O endereço não pode ter usuário e senha.");
  const host = u.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".local") ||
    /^(127|10|0)\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^169\.254\./.test(host) ||
    host.includes(":")
  )
    throw new Error("O endereço precisa ser público (o Flow CRM no ar).");
  return u;
}

export function contactUpsert(c: FlowContact) {
  return {
    action: "contact.upsert",
    data: {
      name: c.name,
      email: c.email,
      telefone: c.phone,
      company: c.company,
      source: "vinculo",
      tags: ["vinculo", ...(c.origin ? [c.origin] : [])],
    },
  };
}

export function saleNote(
  c: FlowContact,
  deal: { title: string; value: number | null; status: "won" | "lost"; reason?: string | null },
) {
  const valor =
    deal.value != null
      ? ` (${deal.value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })})`
      : "";
  const what = deal.status === "won" ? "Venda ganha" : "Venda perdida";
  return {
    action: "note.create",
    data: {
      contact: { name: c.name, email: c.email, telefone: c.phone },
      title: `${what} na Central de CS: ${deal.title}${valor}`,
      body: deal.status === "lost" && deal.reason ? `Motivo: ${deal.reason}` : null,
    },
  };
}
