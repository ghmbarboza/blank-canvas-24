// Campanha de WhatsApp (#67): variáveis do template por contato. Puro.
// {nome} vira o primeiro nome; {nome_completo}, o nome inteiro. Vazio nunca vai: o template
// recusaria a variável em branco, então cai num texto neutro.
export function renderCampaignParams(params: string[], contactName: string | null): string[] {
  const full = (contactName ?? "").trim();
  const first = full.split(/\s+/)[0] ?? "";
  return params.map((p) => {
    const v = p.replaceAll("{nome_completo}", full).replaceAll("{nome}", first).trim();
    return v || "cliente";
  });
}

/** Lote por rodada do job: 30 por minuto fica bem abaixo do limite de qualquer número novo. */
export const CAMPAIGN_BATCH = 30;
export const CAMPAIGN_PACE_MS = 60_000;
