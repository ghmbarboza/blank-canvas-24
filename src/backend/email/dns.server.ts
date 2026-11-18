// Consulta DNS por DNS-over-HTTPS (Cloudflare) para checar SPF, DKIM e DMARC do domínio de envio.
import { analyzeDns, type DnsCheck } from "@/features/email/dns";

async function lookup(name: string, type: "TXT" | "MX"): Promise<string[]> {
  const res = await fetch(
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`,
    {
      headers: { accept: "application/dns-json" },
      signal: AbortSignal.timeout(8_000),
    },
  );
  if (!res.ok) return [];
  const j = (await res.json()) as { Answer?: { data: string; type: number }[] };
  return (j.Answer ?? [])
    .filter((a) => (type === "TXT" ? a.type === 16 : a.type === 15))
    .map((a) =>
      type === "TXT"
        ? (a.data.match(/"((?:[^"\\]|\\.)*)"/g) ?? [a.data])
            .map((s) => s.replace(/^"|"$/g, ""))
            .join("")
        : a.data,
    );
}

export async function checkDomain(
  domain: string,
): Promise<DnsCheck & { domain: string; checked: Record<string, string[]> }> {
  const d = domain.trim().toLowerCase();
  const [spfSend, spfRoot, dkim, dmarc, mx] = await Promise.all([
    lookup(`send.${d}`, "TXT"),
    lookup(d, "TXT"),
    lookup(`resend._domainkey.${d}`, "TXT"),
    lookup(`_dmarc.${d}`, "TXT"),
    lookup(`send.${d}`, "MX"),
  ]);
  const spf = spfSend.some((r) => /^v=spf1/i.test(r)) ? spfSend : spfRoot;
  return { domain: d, ...analyzeDns({ spf, dkim, dmarc, mx }), checked: { spf, dkim, dmarc, mx } };
}
