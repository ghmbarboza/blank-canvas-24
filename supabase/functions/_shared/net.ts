// Proteção contra SSRF nas edge functions (revisão de segurança de 04/11, S11/S12): URL https de
// host público, conferido também depois de resolver o DNS (quando o runtime deixa).
export function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    h === "localhost" ||
    h.endsWith(".localhost") ||
    h.endsWith(".internal") ||
    h.endsWith(".local")
  )
    return true;
  if (/^(0|10|127)\./.test(h) || /^169\.254\./.test(h) || /^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h) || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(h))
    return true;
  if (h === "::1" || h === "::" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80"))
    return true;
  if (h.startsWith("::ffff:")) return true;
  return false;
}

export async function assertPublicHttps(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("endereço inválido");
  }
  if (url.protocol !== "https:" || url.username || url.password)
    throw new Error("use um endereço https sem usuário e senha");
  if (isPrivateHost(url.hostname)) throw new Error("endereço interno bloqueado");
  const resolve = (
    globalThis as { Deno?: { resolveDns?: (h: string, t: string) => Promise<string[]> } }
  ).Deno?.resolveDns;
  if (resolve && !/^[\d.]+$/.test(url.hostname)) {
    const addrs = [
      ...(await resolve(url.hostname, "A").catch(() => [] as string[])),
      ...(await resolve(url.hostname, "AAAA").catch(() => [] as string[])),
    ];
    if (addrs.some(isPrivateHost)) throw new Error("endereço interno bloqueado");
  }
  return url;
}
