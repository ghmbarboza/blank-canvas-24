import type { ProposalItem } from "../totals";

export interface PublicProposal {
  seller: { name: string; logo_url: string | null; color: string | null };
  client: { name: string | null; legal_name: string | null; cnpj: string | null };
  proposal: {
    number: number;
    version: number;
    title: string;
    status: "draft" | "sent" | "viewed" | "accepted" | "declined" | "expired";
    valid_until: string | null;
    created_at: string;
    items: ProposalItem[];
    one_time_total: number;
    monthly_total: number;
    yearly_total: number;
    discount_total: number;
    total: number;
    conditions: string | null;
    accepted_name: string | null;
    accepted_at: string | null;
  };
  can_pay: boolean;
  payments: {
    kind: string;
    cycle: string | null;
    amount: number;
    status: string;
    billing_type: string;
    invoice_url: string | null;
    pix_payload: string | null;
    due_date: string | null;
  }[];
  charges?: {
    id: string;
    amount: number;
    kind: string;
    invoice_url: string | null;
    pix_payload: string | null;
    pix_image: string | null;
  }[];
}

export class PublicError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function proposalAction(
  token: string,
  action: string,
  extra: Record<string, unknown> = {},
): Promise<PublicProposal> {
  const res = await fetch("/api/public/proposal", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token, action, ...extra }),
  });
  const body = (await res.json().catch(() => null)) as (PublicProposal & { error?: string }) | null;
  if (!res.ok || !body)
    throw new PublicError(body?.error ?? "Não deu para abrir a proposta agora", res.status);
  return body;
}

// Leitura: manda o tempo na página ao sair (sendBeacon sobrevive ao fechamento da aba).
export function beaconView(token: string, seconds: number, action: "view" | "read" = "read") {
  const payload = JSON.stringify({ token, action, seconds });
  if (typeof navigator !== "undefined" && navigator.sendBeacon) {
    navigator.sendBeacon("/api/public/proposal", new Blob([payload], { type: "application/json" }));
    return;
  }
  void fetch("/api/public/proposal", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: payload,
    keepalive: true,
  });
}
