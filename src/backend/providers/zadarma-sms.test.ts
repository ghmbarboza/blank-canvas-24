import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { verifyZadarmaNotify } from "./zadarma.server";
import {
  normalizeZadarmaSms,
  parseZadarmaSmsResult,
  smsDailyCap,
  smsSender,
  SMS_DEDUPE_WINDOW_MS,
} from "./zadarma-sms";

const creds = { key: "k", secret: "segredo-de-teste" };
// Como o PHP da Zadarma assina: base64_encode(hash_hmac('sha1', dados, secret)) = base64 do hex
const phpSign = (data: string) =>
  Buffer.from(createHmac("sha1", creds.secret).update(data).digest("hex")).toString("base64");

describe("SMS recebido pela Zadarma", () => {
  const result = JSON.stringify({
    caller_id: "+5548999990001",
    caller_did: "554830000000",
    text: "Oi, quero saber o preço",
  });

  it("lê remetente, destino e texto", () => {
    expect(parseZadarmaSmsResult(result)).toEqual({
      from: "+5548999990001",
      to: "+554830000000",
      text: "Oi, quero saber o preço",
    });
  });

  it("recusa aviso sem remetente, sem texto ou com JSON quebrado", () => {
    expect(parseZadarmaSmsResult(JSON.stringify({ text: "oi" }))).toBeNull();
    expect(parseZadarmaSmsResult(JSON.stringify({ caller_id: "+5548999990001" }))).toBeNull();
    expect(parseZadarmaSmsResult("{nao é json")).toBeNull();
    expect(parseZadarmaSmsResult(null)).toBeNull();
  });

  it("o mesmo aviso reenviado em seguida não entra duas vezes; o mesmo texto depois entra", () => {
    const sms = parseZadarmaSmsResult(result)!;
    const t0 = 1_800_000_000_000;
    const a = normalizeZadarmaSms(result, sms, t0);
    const b = normalizeZadarmaSms(result, sms, t0 + 1_000);
    const later = normalizeZadarmaSms(result, sms, t0 + SMS_DEDUPE_WINDOW_MS * 2);
    expect(a.externalId).toBe(b.externalId);
    expect(later.externalId).not.toBe(a.externalId);
    expect(a).toMatchObject({ direction: "in", threadId: "+5548999990001", type: "text" });
  });

  it("assinatura do SMS confere com o result, no formato do PHP da Zadarma", () => {
    const form = { event: "SMS", result };
    expect(verifyZadarmaNotify(creds, "SMS", form, phpSign(result))).toBe(true);
    expect(verifyZadarmaNotify(creds, "SMS", form, phpSign(result + "x"))).toBe(false);
    expect(verifyZadarmaNotify(creds, "SMS", form, null)).toBe(false);
  });

  it("assinatura das ligações também segue o formato do PHP", () => {
    const form = {
      caller_id: "+5548999990001",
      called_did: "554830000000",
      call_start: "2026-11-04 10:00:00",
    };
    const sig = phpSign(form.caller_id + form.called_did + form.call_start);
    expect(verifyZadarmaNotify(creds, "NOTIFY_START", form, sig)).toBe(true);
    expect(verifyZadarmaNotify(creds, "EVENTO_DESCONHECIDO", form, sig)).toBe(false);
  });

  it("teto diário de SMS: padrão 300, nunca zero nem sem limite", () => {
    expect(smsDailyCap(undefined)).toBe(300);
    expect(smsDailyCap("0")).toBe(300);
    expect(smsDailyCap("abc")).toBe(300);
    expect(smsDailyCap("50")).toBe(50);
    expect(smsDailyCap("999999")).toBe(5000);
  });

  it("remetente do canal precisa ser número completo", () => {
    expect(smsSender("+5548999990000")).toBe("+5548999990000");
    expect(smsSender("(48) 99999-0000")).toBe("+5548999990000");
    expect(smsSender("123")).toBeNull();
  });
});
