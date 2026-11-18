// Leitura do DNS de envio: o que falta para o domínio entregar bem (SPF, DKIM, DMARC).
// Lição EasyCover: três registros SPF dão permerror e derrubam a entrega inteira.

export interface DnsCheck {
  spf: { ok: boolean; records: string[]; problem: string | null };
  dkim: { ok: boolean; problem: string | null };
  dmarc: { ok: boolean; record: string | null; policy: string | null; problem: string | null };
  mx: { ok: boolean };
  ok: boolean;
}

export function analyzeDns(input: {
  spf: string[];
  dkim: string[];
  dmarc: string[];
  mx: string[];
}): DnsCheck {
  const spfRecords = input.spf.filter((r) => /^v=spf1\b/i.test(r));
  let spfProblem: string | null = null;
  if (spfRecords.length === 0)
    spfProblem =
      "Falta o registro SPF no subdomínio de envio do Resend (send.seudominio): TXT v=spf1 include:amazonses.com ~all.";
  else if (spfRecords.length > 1)
    spfProblem = `Há ${spfRecords.length} registros SPF: junte num só, senão nenhum vale (permerror).`;
  else if (!/include:(amazonses\.com|_spf\.resend\.com|spf\.resend\.com)/i.test(spfRecords[0]!))
    spfProblem = "O SPF não autoriza o Resend: acrescente include:amazonses.com.";

  const dkimOk = input.dkim.some((r) => /p=[A-Za-z0-9+/=]{40,}/.test(r));
  const dmarc = input.dmarc.find((r) => /^v=DMARC1/i.test(r)) ?? null;
  const policy = dmarc?.match(/;\s*p=(none|quarantine|reject)/i)?.[1]?.toLowerCase() ?? null;
  let dmarcProblem: string | null = null;
  if (!dmarc)
    dmarcProblem =
      "Falta o DMARC (TXT em _dmarc): comece com v=DMARC1; p=none; rua=mailto:dmarc@seudominio.";
  else if (policy === "none")
    dmarcProblem =
      "DMARC em p=none: aceito, mas suba para quarantine depois de 2 semanas sem falhas.";

  const result: DnsCheck = {
    spf: { ok: spfRecords.length === 1 && !spfProblem, records: spfRecords, problem: spfProblem },
    dkim: {
      ok: dkimOk,
      problem: dkimOk
        ? null
        : "Falta o DKIM do Resend (TXT em resend._domainkey). Copie do painel do Resend.",
    },
    dmarc: { ok: Boolean(dmarc), record: dmarc, policy, problem: dmarcProblem },
    mx: { ok: input.mx.length > 0 },
    ok: false,
  };
  result.ok = result.spf.ok && result.dkim.ok && result.dmarc.ok;
  return result;
}

/** Teto diário de envio de marketing por domínio novo (aquecimento por degraus). */
export const WARMUP_STEPS = [200, 500, 1000, 2000, 4000, 8000];
export function warmupLimit(startedAt: string | null, now = new Date()): number {
  if (!startedAt) return WARMUP_STEPS[0]!;
  const days = Math.floor((now.getTime() - new Date(startedAt).getTime()) / 86_400_000);
  return days >= WARMUP_STEPS.length ? Number.POSITIVE_INFINITY : WARMUP_STEPS[Math.max(0, days)]!;
}

/** Taxas de saúde (spam e bounce) com os limites do Gmail/Yahoo. */
export function healthLevel(rate: number, warn: number, max: number): "ok" | "warn" | "bad" {
  return rate >= max ? "bad" : rate >= warn ? "warn" : "ok";
}

export const SPAM_WARN = 0.001;
export const SPAM_MAX = 0.003;
export const BOUNCE_WARN = 0.02;
export const BOUNCE_MAX = 0.05;
