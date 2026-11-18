// deno test supabase/functions/_shared/providers/providers.test.ts
import { assertEquals, assert } from "jsr:@std/assert@1";

import { mapAckStatus, normalizeUpsert } from "./evolution.ts";
import { normalizeMessage, toPlatform } from "./zernio.ts";
import { normalizeInbound } from "./meta.ts";
import { hmacHex, safeEqual } from "../crypto.ts";

Deno.test("evolution: mensagem 1:1 de texto vira entrada com telefone", () => {
  const msg = normalizeUpsert({
    key: { remoteJid: "5511988887777@s.whatsapp.net", fromMe: false, id: "ABC" },
    pushName: "Maria",
    message: { conversation: "Oi, tudo bem?" },
    messageTimestamp: 1760960000,
  });
  assert(msg);
  assertEquals(msg.direction, "in");
  assertEquals(msg.isGroup, false);
  assertEquals(msg.contactPhone, "5511988887777");
  assertEquals(msg.body, "Oi, tudo bem?");
  assertEquals(msg.senderName, "Maria");
  assertEquals(msg.sentAt, new Date(1760960000 * 1000).toISOString());
});

Deno.test("evolution: grupo usa o participant como autor e o @g.us como conversa", () => {
  const msg = normalizeUpsert({
    key: {
      remoteJid: "120363025246125888@g.us",
      fromMe: false,
      id: "G1",
      participant: "5511977776666@s.whatsapp.net",
    },
    pushName: "João",
    message: { extendedTextMessage: { text: "Bom dia, pessoal" } },
  });
  assert(msg);
  assertEquals(msg.isGroup, true);
  assertEquals(msg.threadId, "120363025246125888@g.us");
  assertEquals(msg.senderHandle, "5511977776666");
  assertEquals(msg.contactPhone, null);
});

Deno.test("evolution: remetente @lid usa o telefone real do remoteJidAlt", () => {
  const msg = normalizeUpsert({
    key: {
      remoteJid: "118200000000:12@lid",
      fromMe: false,
      id: "L1",
      remoteJidAlt: "5521966665555@s.whatsapp.net",
    },
    message: { conversation: "oi" },
  });
  assertEquals(msg?.contactPhone, "5521966665555");
});

Deno.test("evolution: imagem com base64 traz mídia e legenda", () => {
  const msg = normalizeUpsert({
    key: { remoteJid: "5511988887777@s.whatsapp.net", fromMe: false, id: "IMG" },
    message: {
      imageMessage: { caption: "comprovante", mimetype: "image/jpeg", base64: "aGVsbG8=" },
    },
  });
  assertEquals(msg?.type, "image");
  assertEquals(msg?.body, "comprovante");
  assertEquals(msg?.media?.base64, "aGVsbG8=");
});

Deno.test("evolution: status broadcast, reação e protocolo são ignorados", () => {
  assertEquals(
    normalizeUpsert({
      key: { remoteJid: "status@broadcast", id: "S" },
      message: { conversation: "x" },
    }),
    null,
  );
  assertEquals(
    normalizeUpsert({
      key: { remoteJid: "5511@s.whatsapp.net", id: "R" },
      message: { reactionMessage: { text: "👍" } },
    }),
    null,
  );
  assertEquals(
    normalizeUpsert({ key: { remoteJid: "5511988887777@s.whatsapp.net", id: "P" }, message: {} }),
    null,
  );
});

Deno.test("evolution: confirmações de entrega mapeiam nos dois formatos", () => {
  assertEquals(mapAckStatus("DELIVERY_ACK"), "delivered");
  assertEquals(mapAckStatus(4), "read");
  assertEquals(mapAckStatus("SERVER_ACK"), "sent");
  assertEquals(mapAckStatus("PENDING"), null);
});

Deno.test("zernio: DM do Instagram com anexo", () => {
  const msg = normalizeMessage({
    event: "message.received",
    message: {
      id: "m1",
      conversationId: "c1",
      platformMessageId: "pm1",
      direction: "incoming",
      text: "Ainda tem?",
      attachments: [{ type: "image", url: "https://cdn/x.jpg" }],
      sender: { id: "178", name: "Jane", username: "jane_doe" },
    },
  });
  assert(msg);
  assertEquals(msg.externalId, "pm1");
  assertEquals(msg.threadId, "c1");
  assertEquals(msg.type, "image");
  assertEquals(msg.senderHandle, "jane_doe");
});

Deno.test("zernio: plataformas com nome diferente são traduzidas", () => {
  assertEquals(toPlatform("twitter"), "x");
  assertEquals(toPlatform("googlebusiness"), "google_business");
  assertEquals(toPlatform("instagram"), "instagram");
});

Deno.test("meta: texto recebido e grupo", () => {
  const value = { contacts: [{ wa_id: "5511988887777", profile: { name: "Maria" } }] };
  const one = normalizeInbound(value, {
    id: "wamid.1",
    from: "5511988887777",
    type: "text",
    text: { body: "Olá" },
    timestamp: "1760960000",
  });
  assertEquals(one?.msg.body, "Olá");
  assertEquals(one?.msg.senderName, "Maria");
  assertEquals(one?.msg.threadId, "5511988887777");
  const grp = normalizeInbound(value, {
    id: "wamid.2",
    from: "5511988887777",
    type: "text",
    text: { body: "x" },
    group_id: "G9",
  });
  assertEquals(grp?.msg.isGroup, true);
  assertEquals(grp?.msg.threadId, "G9");
});

Deno.test("meta: mídia devolve o media id para download", () => {
  const r = normalizeInbound(
    {},
    { id: "w3", from: "55", type: "audio", audio: { id: "MEDIA1", mime_type: "audio/ogg" } },
  );
  assertEquals(r?.mediaId, "MEDIA1");
  assertEquals(r?.msg.type, "audio");
});

Deno.test("crypto: HMAC confere e comparação é estrita", async () => {
  const sig = await hmacHex("SHA-256", "segredo", '{"a":1}');
  assertEquals(sig.length, 64);
  assert(safeEqual(sig, await hmacHex("SHA-256", "segredo", '{"a":1}')));
  assert(!safeEqual(sig, await hmacHex("SHA-256", "outro", '{"a":1}')));
  assert(!safeEqual(sig, sig.slice(0, 63)));
  assert(!safeEqual(null, sig));
});

Deno.test(
  "meta: webhook só com BSUID (sem telefone) vira conversa pelo id de usuário (#19)",
  () => {
    const value = { contacts: [{ user_id: "BR.1a2b3c", profile: { username: "maria.loja" } }] };
    const r = normalizeInbound(value, {
      id: "wamid.3",
      from_user_id: "BR.1a2b3c",
      type: "text",
      text: { body: "oi" },
    });
    assert(r);
    assertEquals(r.msg.threadId, "BR.1a2b3c");
    assertEquals(r.msg.senderHandle, "BR.1a2b3c");
    assertEquals(r.msg.contactPhone, null);
    assertEquals(r.msg.senderName, "maria.loja");
  },
);

Deno.test("meta: com telefone e BSUID, a chave continua o telefone", () => {
  const value = {
    contacts: [{ wa_id: "5511988887777", user_id: "BR.9z", profile: { name: "Ana" } }],
  };
  const r = normalizeInbound(value, {
    id: "wamid.4",
    from: "5511988887777",
    from_user_id: "BR.9z",
    type: "text",
    text: { body: "x" },
  });
  assertEquals(r?.msg.threadId, "5511988887777");
  assertEquals(r?.msg.contactPhone, "5511988887777");
});
