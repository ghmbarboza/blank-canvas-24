// Web Push sem dependência: VAPID (RFC 8292, JWT ES256) + criptografia aes128gcm (RFC 8291), tudo em
// WebCrypto, que roda igual no Cloudflare Workers e no Node. Puro (sem banco): testado em webpush.test.ts.

export interface PushSubscriptionKeys {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface VapidKeys {
  /** Ponto público P-256 não comprimido (65 bytes) em base64url. */
  publicKey: string;
  /** Escalar privado "d" (32 bytes) em base64url. */
  privateKey: string;
  /** mailto: ou https: de contato do remetente. */
  subject: string;
}

const enc = new TextEncoder();
// Cópia em ArrayBuffer "puro": o WebCrypto tipado do TS 5.7+ não aceita Uint8Array<ArrayBufferLike>.
const buf = (b: Uint8Array): ArrayBuffer => b.slice().buffer as ArrayBuffer;

export function b64urlEncode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64urlDecode(s: string): Uint8Array {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number) {
  const key = await crypto.subtle.importKey("raw", buf(ikm), "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: buf(salt), info: buf(info) },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

/** Cabeçalho do corpo aes128gcm: salt(16) | rs(4, big-endian) | idlen(1) | keyid(chave pública do servidor). */
export function contentHeader(salt: Uint8Array, recordSize: number, serverPublic: Uint8Array) {
  const h = new Uint8Array(21 + serverPublic.length);
  h.set(salt, 0);
  new DataView(h.buffer).setUint32(16, recordSize);
  h[20] = serverPublic.length;
  h.set(serverPublic, 21);
  return h;
}

export const RECORD_SIZE = 4096;

/** Criptografa o payload para a inscrição (um registro só; payload até ~3 KB). */
export async function encryptPayload(
  payload: Uint8Array,
  sub: Pick<PushSubscriptionKeys, "p256dh" | "auth">,
  opts: { salt?: Uint8Array; serverKeys?: CryptoKeyPair } = {},
): Promise<Uint8Array> {
  if (payload.length > RECORD_SIZE - 17 - 86)
    throw new Error("payload grande demais para Web Push");
  const uaPublic = b64urlDecode(sub.p256dh);
  const authSecret = b64urlDecode(sub.auth);
  const salt = opts.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const server =
    opts.serverKeys ??
    ((await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
      "deriveBits",
    ])) as CryptoKeyPair);
  const serverPublic = new Uint8Array(await crypto.subtle.exportKey("raw", server.publicKey));
  const uaKey = await crypto.subtle.importKey(
    "raw",
    buf(uaPublic),
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, server.privateKey, 256),
  );
  const keyInfo = concat(enc.encode("WebPush: info\0"), uaPublic, serverPublic);
  const ikm = await hkdf(authSecret, shared, keyInfo, 32);
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const aes = await crypto.subtle.importKey("raw", buf(cek), "AES-GCM", false, ["encrypt"]);
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: buf(nonce) },
      aes,
      buf(concat(payload, new Uint8Array([2]))),
    ),
  );
  return concat(contentHeader(salt, RECORD_SIZE, serverPublic), cipher);
}

async function importVapidPrivate(keys: VapidKeys): Promise<CryptoKey> {
  const pub = b64urlDecode(keys.publicKey);
  if (pub.length !== 65 || pub[0] !== 4) throw new Error("chave VAPID pública inválida");
  return crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      d: keys.privateKey,
      x: b64urlEncode(pub.slice(1, 33)),
      y: b64urlEncode(pub.slice(33, 65)),
      ext: true,
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

/** JWT ES256 do VAPID para a origem do endpoint (validade de 12 h). */
export async function vapidJwt(
  endpoint: string,
  keys: VapidKeys,
  now = Date.now(),
): Promise<string> {
  const aud = new URL(endpoint).origin;
  const header = b64urlEncode(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64urlEncode(
    enc.encode(JSON.stringify({ aud, exp: Math.floor(now / 1000) + 12 * 3600, sub: keys.subject })),
  );
  const unsigned = `${header}.${claims}`;
  const key = await importVapidPrivate(keys);
  const sig = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, buf(enc.encode(unsigned))),
  );
  return `${unsigned}.${b64urlEncode(sig)}`;
}

export interface PushRequest {
  url: string;
  headers: Record<string, string>;
  body: Uint8Array;
}

/** Monta a requisição HTTP do Web Push (quem chama faz o fetch). */
export async function buildPushRequest(
  sub: PushSubscriptionKeys,
  payload: unknown,
  keys: VapidKeys,
  ttlSeconds = 24 * 3600,
): Promise<PushRequest> {
  if (!/^https:\/\//.test(sub.endpoint)) throw new Error("endpoint de push inválido");
  const body = await encryptPayload(enc.encode(JSON.stringify(payload)), sub);
  const jwt = await vapidJwt(sub.endpoint, keys);
  return {
    url: sub.endpoint,
    headers: {
      "content-encoding": "aes128gcm",
      "content-type": "application/octet-stream",
      ttl: String(ttlSeconds),
      urgency: "normal",
      authorization: `vapid t=${jwt}, k=${keys.publicKey}`,
    },
    body,
  };
}

/** 404/410: a inscrição morreu no navegador e deve ser apagada. */
export function isGone(status: number): boolean {
  return status === 404 || status === 410;
}

/** Gera um par VAPID novo (P-256) no formato que VapidKeys espera. */
export async function generateVapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const pub = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  if (!jwk.d) throw new Error("chave privada sem escalar d");
  return { publicKey: b64urlEncode(pub), privateKey: jwk.d };
}
