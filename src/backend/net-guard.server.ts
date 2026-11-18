// Proteção contra SSRF para URLs que vêm de fora (webhook, cadastro do admin): só http(s)
// público, conferido também depois de resolver o DNS (revisão de segurança de 04/11, S12).
// R8 (05/11): regra única de endereço interno em net-address.ts e publicFetch, que confere o
// destino na hora do envio e recusa redirecionamento (um 302 para 169.254.169.254 não passa).
import { lookup } from "node:dns/promises";

import { isPrivateHost } from "@/backend/net-address";

export async function assertPublicUrl(
  raw: string | URL,
  opts: { httpsOnly?: boolean } = {},
): Promise<URL> {
  const url = raw instanceof URL ? raw : new URL(raw);
  const okProto = opts.httpsOnly ? url.protocol === "https:" : /^https?:$/.test(url.protocol);
  if (!okProto) throw new Error("endereço com protocolo não permitido");
  if (url.username || url.password) throw new Error("endereço com usuário e senha");
  if (isPrivateHost(url.hostname)) throw new Error("endereço interno bloqueado");
  const addrs = await lookup(url.hostname.replace(/^\[|\]$/g, ""), { all: true }).catch(() => []);
  if (!addrs.length) throw new Error(`não achei o endereço ${url.hostname}`);
  if (addrs.some((a) => isPrivateHost(a.address))) throw new Error("endereço interno bloqueado");
  return url;
}

/**
 * fetch para endereço de fora: confere o destino agora e não segue redirecionamento.
 * `maxRedirects` (para URL de arquivo de provedor, que costuma redirecionar para o CDN): segue até
 * N saltos, conferindo cada destino de novo; sem ele, 3xx vira erro.
 *
 * Limite conhecido (DNS rebinding): o runtime (Cloudflare Workers, via nitro) não deixa fixar o IP
 * da conexão. A conferência é feita na hora do envio, mas o fetch resolve o nome de novo; um DNS
 * de TTL zero pode responder público aqui e interno no fetch. No Workers a rede interna do
 * provedor não é alcançável pelo fetch, o que reduz o risco; o resto depende desta checagem.
 */
export async function publicFetch(
  raw: string | URL,
  init: Omit<RequestInit, "redirect"> = {},
  opts: { httpsOnly?: boolean; maxRedirects?: number } = {},
): Promise<Response> {
  let url = await assertPublicUrl(raw, opts);
  const hops = Math.max(0, Math.min(opts.maxRedirects ?? 0, 5));
  if (hops === 0) return fetch(url, { ...init, redirect: "error" });
  for (let hop = 0; hop <= hops; hop++) {
    const res = await fetch(url, { ...init, redirect: "manual" });
    const loc = res.headers.get("location");
    if (res.status < 300 || res.status >= 400 || !loc) return res;
    url = await assertPublicUrl(new URL(loc, url), opts);
  }
  throw new Error("redirecionamentos demais");
}
