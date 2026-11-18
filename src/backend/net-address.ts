// Única regra de "endereço que o servidor não pode buscar" (revisão de segurança de 05/11, R8).
// Pura (sem node:*): usada pelo net-guard.server.ts (com DNS) e pela leitura de sites da Nexa.
// Cobre IPv4 privado, loopback, link-local, CGNAT e reservados; IPv6 loopback (::1), não
// especificado (::), ULA (fc00::/7), link-local (fe80::/10), site-local, multicast e os formatos
// que embutem um IPv4 (::ffff:a.b.c.d, ::ffff:7f00:1, ::ffff:0:a.b.c.d, ::a.b.c.d, 64:ff9b::/96,
// 2002::/16), NAT64 local (64:ff9b:1::/48) e documentação (2001:db8::/32).
// Na dúvida (IPv6 que não dá para ler), bloqueia.

const BLOCKED_SUFFIXES = [".localhost", ".internal", ".local", ".home.arpa"];

/** Faixas IPv4 que não são internet pública: [primeiro octeto..., prefixo]. */
const BLOCKED_V4: ReadonlyArray<readonly [number, number]> = [
  [ipv4ToInt([0, 0, 0, 0]), 8], // "esta rede"
  [ipv4ToInt([10, 0, 0, 0]), 8],
  [ipv4ToInt([100, 64, 0, 0]), 10], // CGNAT
  [ipv4ToInt([127, 0, 0, 0]), 8],
  [ipv4ToInt([169, 254, 0, 0]), 16], // link-local / metadados de nuvem
  [ipv4ToInt([172, 16, 0, 0]), 12],
  [ipv4ToInt([192, 0, 0, 0]), 24],
  [ipv4ToInt([192, 0, 2, 0]), 24],
  [ipv4ToInt([192, 88, 99, 0]), 24], // relay 6to4 (anycast, obsoleto)
  [ipv4ToInt([192, 168, 0, 0]), 16],
  [ipv4ToInt([198, 18, 0, 0]), 15],
  [ipv4ToInt([198, 51, 100, 0]), 24],
  [ipv4ToInt([203, 0, 113, 0]), 24],
  [ipv4ToInt([224, 0, 0, 0]), 4], // multicast
  [ipv4ToInt([240, 0, 0, 0]), 4], // reservado + broadcast
];

function ipv4ToInt(o: readonly number[]): number {
  return ((o[0]! << 24) | (o[1]! << 16) | (o[2]! << 8) | o[3]!) >>> 0;
}

/** "a.b.c.d" em 4 octetos decimais; qualquer outra forma devolve null. */
export function parseIPv4(s: string): number[] | null {
  const parts = s.split(".");
  if (parts.length !== 4) return null;
  const out: number[] = [];
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number(p);
    if (n > 255) return null;
    out.push(n);
  }
  return out;
}

function isBlockedV4(o: readonly number[]): boolean {
  const ip = ipv4ToInt(o);
  return BLOCKED_V4.some(([net, bits]) => {
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (ip & mask) >>> 0 === net;
  });
}

/** IPv6 em 8 blocos de 16 bits (aceita "::" e IPv4 no fim); null se não for IPv6 válido. */
export function parseIPv6(s: string): number[] | null {
  let text = s;
  const lastColon = text.lastIndexOf(":");
  const v4Part = text.slice(lastColon + 1);
  if (v4Part.includes(".")) {
    // IPv4 no fim (::ffff:1.2.3.4) vira dois blocos hexa
    const v4 = parseIPv4(v4Part);
    if (!v4) return null;
    const hi = ((v4[0]! << 8) | v4[1]!).toString(16);
    const lo = ((v4[2]! << 8) | v4[3]!).toString(16);
    text = `${text.slice(0, lastColon + 1)}${hi}:${lo}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const read = (part: string): number[] | null => {
    if (part === "") return [];
    const out: number[] = [];
    for (const g of part.split(":")) {
      if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
      out.push(parseInt(g, 16));
    }
    return out;
  };
  const head = read(halves[0]!);
  const rest = halves.length === 2 ? read(halves[1]!) : [];
  if (!head || !rest) return null;
  if (halves.length === 1) return head.length === 8 ? head : null;
  const fill = 8 - head.length - rest.length;
  if (fill < 1) return null;
  return [...head, ...new Array<number>(fill).fill(0), ...rest];
}

function embeddedV4(hi: number, lo: number): number[] {
  return [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff];
}

function isBlockedV6(g: readonly number[]): boolean {
  const zeroUpTo = (n: number) => g.slice(0, n).every((x) => x === 0);
  if (zeroUpTo(8)) return true; // ::
  if (zeroUpTo(7) && g[7] === 1) return true; // ::1
  if ((g[0]! & 0xfe00) === 0xfc00) return true; // fc00::/7 (ULA)
  if ((g[0]! & 0xffc0) === 0xfe80) return true; // fe80::/10 (link-local)
  if ((g[0]! & 0xffc0) === 0xfec0) return true; // fec0::/10 (site-local, obsoleto)
  if ((g[0]! & 0xff00) === 0xff00) return true; // multicast
  // IPv4 embutido: mapeado (::ffff:x), compatível (::x), NAT64 (64:ff9b::x), 6to4 (2002:x::)
  if (zeroUpTo(5) && g[5] === 0xffff) return isBlockedV4(embeddedV4(g[6]!, g[7]!));
  // ::ffff:0:a.b.c.d (SIIT, ::ffff:0:0/96)
  if (zeroUpTo(4) && g[4] === 0xffff && g[5] === 0) return isBlockedV4(embeddedV4(g[6]!, g[7]!));
  if (zeroUpTo(6)) return isBlockedV4(embeddedV4(g[6]!, g[7]!));
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0))
    return isBlockedV4(embeddedV4(g[6]!, g[7]!));
  if (g[0] === 0x2002) return isBlockedV4(embeddedV4(g[1]!, g[2]!));
  if (g[0] === 0x64 && g[1] === 0xff9b && g[2] === 1) return true; // 64:ff9b:1::/48 (NAT64 local)
  if (g[0] === 0x2001 && g[1] === 0xdb8) return true; // 2001:db8::/32 (documentação)
  return false;
}

/** Endereço que o servidor não pode buscar (rede interna, localhost, metadados de nuvem). */
export function isPrivateHost(host: string): boolean {
  const h = host
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/%.*$/, "") // zona do IPv6 (fe80::1%eth0)
    .replace(/\.$/, "");
  if (!h) return true;
  if (h.includes(":")) {
    const v6 = parseIPv6(h);
    return v6 ? isBlockedV6(v6) : true;
  }
  const v4 = parseIPv4(h);
  if (v4) return isBlockedV4(v4);
  // número solto, hexa ou octal ("2130706433", "0x7f.1"): o fetch pode ler como IP, então bloqueia
  if (/^(0x[0-9a-f]*|\d+)(\.(0x[0-9a-f]*|\d+)){0,3}$/i.test(h)) return true;
  return h === "localhost" || BLOCKED_SUFFIXES.some((s) => h.endsWith(s));
}
