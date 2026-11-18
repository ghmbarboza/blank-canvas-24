import { describe, expect, it } from "vitest";

import {
  RECORD_SIZE,
  b64urlDecode,
  b64urlEncode,
  buildPushRequest,
  concat,
  contentHeader,
  encryptPayload,
  generateVapidKeys,
  isGone,
  vapidJwt,
  type VapidKeys,
} from "./webpush";

const enc = new TextEncoder();
const ab = (b: Uint8Array) => b.slice().buffer as ArrayBuffer;

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number) {
  const k = await crypto.subtle.importKey("raw", ab(ikm), "HKDF", false, ["deriveBits"]);
  return new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "HKDF", hash: "SHA-256", salt: ab(salt), info: ab(info) },
      k,
      len * 8,
    ),
  );
}

// O lado do navegador (RFC 8291): só para conferir que o servidor criptografa certo.
async function browserDecrypt(body: Uint8Array, ua: CryptoKeyPair, auth: Uint8Array) {
  const salt = body.slice(0, 16);
  const idlen = body[20]!;
  const serverPublic = body.slice(21, 21 + idlen);
  const cipher = body.slice(21 + idlen);
  const uaPublic = new Uint8Array(await crypto.subtle.exportKey("raw", ua.publicKey));
  const sk = await crypto.subtle.importKey(
    "raw",
    ab(serverPublic),
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: sk }, ua.privateKey, 256),
  );
  const ikm = await hkdf(
    auth,
    shared,
    concat(enc.encode("WebPush: info\0"), uaPublic, serverPublic),
    32,
  );
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", ab(cek), "AES-GCM", false, ["decrypt"]);
  const plain = new Uint8Array(
    await crypto.subtle.decrypt({ name: "AES-GCM", iv: ab(nonce) }, key, ab(cipher)),
  );
  expect(plain[plain.length - 1]).toBe(2); // delimitador do último registro
  return new TextDecoder().decode(plain.slice(0, -1));
}

async function browserSubscription() {
  const ua = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ])) as CryptoKeyPair;
  const auth = crypto.getRandomValues(new Uint8Array(16));
  const p256dh = b64urlEncode(new Uint8Array(await crypto.subtle.exportKey("raw", ua.publicKey)));
  return { ua, auth, p256dh, authB64: b64urlEncode(auth) };
}

async function vapidPair(): Promise<{ keys: VapidKeys; publicKey: CryptoKey }> {
  const kp = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const jwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey));
  return {
    keys: { publicKey: b64urlEncode(raw), privateKey: jwk.d!, subject: "mailto:teste@exemplo.com" },
    publicKey: kp.publicKey,
  };
}

describe("base64url", () => {
  it("ida e volta sem padding", () => {
    const bytes = new Uint8Array([0, 255, 62, 63, 250, 1]);
    const s = b64urlEncode(bytes);
    expect(s).not.toMatch(/[+/=]/);
    expect([...b64urlDecode(s)]).toEqual([...bytes]);
  });
});

describe("contentHeader", () => {
  it("salt, tamanho do registro em big-endian e chave do servidor", () => {
    const h = contentHeader(new Uint8Array(16).fill(7), RECORD_SIZE, new Uint8Array(65).fill(4));
    expect(h.length).toBe(86);
    expect([...h.slice(16, 20)]).toEqual([0, 0, 16, 0]);
    expect(h[20]).toBe(65);
  });
});

describe("encryptPayload", () => {
  it("o navegador decifra o que o servidor cifrou", async () => {
    const b = await browserSubscription();
    const body = await encryptPayload(enc.encode('{"title":"Olá"}'), {
      p256dh: b.p256dh,
      auth: b.authB64,
    });
    expect(await browserDecrypt(body, b.ua, b.auth)).toBe('{"title":"Olá"}');
  });

  it("recusa payload maior que um registro", async () => {
    const b = await browserSubscription();
    await expect(
      encryptPayload(new Uint8Array(5000), { p256dh: b.p256dh, auth: b.authB64 }),
    ).rejects.toThrow(/grande/);
  });
});

describe("vapidJwt", () => {
  it("assina ES256 para a origem do endpoint", async () => {
    const { keys, publicKey } = await vapidPair();
    const jwt = await vapidJwt("https://fcm.googleapis.com/fcm/send/abc", keys, 1_000_000_000_000);
    const [h, c, s] = jwt.split(".");
    expect(JSON.parse(new TextDecoder().decode(b64urlDecode(h!)))).toEqual({
      typ: "JWT",
      alg: "ES256",
    });
    const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(c!)));
    expect(claims).toEqual({
      aud: "https://fcm.googleapis.com",
      exp: 1_000_000_000 + 12 * 3600,
      sub: "mailto:teste@exemplo.com",
    });
    const ok = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      publicKey,
      ab(b64urlDecode(s!)),
      ab(enc.encode(`${h}.${c}`)),
    );
    expect(ok).toBe(true);
  });
});

describe("buildPushRequest", () => {
  it("monta cabeçalhos do Web Push e corpo decifrável", async () => {
    const { keys } = await vapidPair();
    const b = await browserSubscription();
    const req = await buildPushRequest(
      {
        endpoint: "https://updates.push.services.mozilla.com/wpush/v2/x",
        p256dh: b.p256dh,
        auth: b.authB64,
      },
      { title: "Lead quente", url: "/contatos/1" },
      keys,
    );
    expect(req.headers["content-encoding"]).toBe("aes128gcm");
    expect(req.headers["authorization"]).toMatch(/^vapid t=.+\..+\..+, k=/);
    expect(JSON.parse(await browserDecrypt(req.body, b.ua, b.auth))).toEqual({
      title: "Lead quente",
      url: "/contatos/1",
    });
  });

  it("recusa endpoint sem https", async () => {
    const { keys } = await vapidPair();
    await expect(
      buildPushRequest({ endpoint: "http://x", p256dh: "a", auth: "b" }, {}, keys),
    ).rejects.toThrow(/endpoint/);
  });

  it("404 e 410 indicam inscrição morta", () => {
    expect(isGone(410)).toBe(true);
    expect(isGone(404)).toBe(true);
    expect(isGone(429)).toBe(false);
  });
});

describe("generateVapidKeys", () => {
  it("gera par que assina um JWT VAPID válido", async () => {
    const k = await generateVapidKeys();
    expect(b64urlDecode(k.publicKey).length).toBe(65);
    expect(b64urlDecode(k.privateKey).length).toBe(32);
    const jwt = await vapidJwt("https://fcm.googleapis.com/x", { ...k, subject: "mailto:a@b.c" });
    expect(jwt.split(".")).toHaveLength(3);
  });
});
