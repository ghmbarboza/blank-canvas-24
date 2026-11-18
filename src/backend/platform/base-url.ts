// Endereço do app num remix (revisão de segurança de 04/11, S1). O endereço gravado no Vault é
// trocado sozinho pela origem do dono/admin quando está vazio (garantir_plataforma faz) ou quando
// o endereço gravado é de OUTRO projeto (ex.: remix nascido com o endereço do app original):
// o /api/health de lá diz de qual projeto Supabase ele é.
// R2 (05/11): trocar um endereço já gravado é só do DONO, e o destino tem de provar que é deste projeto.
import { isPrivateHost } from "../net-address";

/**
 * Identificador do projeto a partir da URL do banco. Dois formatos: https://<ref>.supabase.co
 * (antigo) e https://c--<uuid>-prod.lovable.cloud (Lovable Cloud novo, com hífens). Sem aceitar o
 * segundo, o app nunca prova que o endereço é dele, não grava o endereço e o agendador não roda.
 */
export function projectRef(supabaseUrl: string | undefined | null): string | null {
  if (!supabaseUrl) return null;
  try {
    const host = new URL(supabaseUrl).hostname.toLowerCase();
    const ref = host.split(".")[0] ?? "";
    return /^[a-z0-9][a-z0-9-]{8,78}[a-z0-9]$/.test(ref) ? ref : null;
  } catch {
    return null;
  }
}

/**
 * Troca o endereço gravado pela origem atual? Só quando há divergência, a origem foi aceita
 * (https, fora da prévia) e o endereço gravado comprovadamente não é deste projeto.
 * `storedProject` null = o endereço gravado não respondeu como um Vínculo (fora do ar ou outro app).
 */
export function shouldReclaimBase(p: {
  originMismatch: boolean;
  originAccepted: boolean;
  ownProject: string | null;
  storedProject: string | null;
}): boolean {
  if (!p.originMismatch || !p.originAccepted || !p.ownProject) return false;
  return p.storedProject !== p.ownProject;
}

/** Pergunta ao endereço gravado de qual projeto ele é (null se não responder como Vínculo). */
export async function probeProject(baseUrl: string, timeoutMs = 4_000): Promise<string | null> {
  if (!/^https:\/\/[a-z0-9.-]+(:[0-9]+)?$/i.test(baseUrl)) return null;
  try {
    const res = await fetch(`${baseUrl}/api/health`, {
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "manual",
      headers: { accept: "application/json" },
    });
    const body = (await res.json().catch(() => null)) as { project?: unknown } | null;
    return typeof body?.project === "string" ? body.project : null;
  } catch {
    return null;
  }
}

/**
 * Antes de o dono trocar o endereço (R2, 05/11): o destino precisa responder no /api/health que
 * é deste projeto Supabase. Sem seguir redirecionamento e nunca para rede interna.
 * Observação: o ref do projeto é público (vai no bundle do navegador); isto barra engano e origem
 * forjada para um servidor qualquer, mas o controle de verdade é "só o dono troca".
 */
export async function originServesProject(
  origin: string,
  ownProject: string | null,
  timeoutMs = 5_000,
): Promise<boolean> {
  if (!ownProject || !/^https:\/\/[a-z0-9.-]+(:[0-9]+)?$/i.test(origin)) return false;
  if (isPrivateHost(new URL(origin).hostname)) return false;
  try {
    const res = await fetch(`${origin}/api/health`, {
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "error",
      headers: { accept: "application/json" },
    });
    if (!res.ok) return false;
    const body = (await res.json().catch(() => null)) as { project?: unknown } | null;
    return body?.project === ownProject;
  } catch {
    return false;
  }
}
