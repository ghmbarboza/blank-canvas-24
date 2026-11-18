import { describe, expect, it } from "vitest";

import { brazilCatalog } from "@/backend/providers/__fixtures__/zernio";

import { parseZernioReturn } from "./zernio/return";
import {
  assessNumberHealth,
  buildForwardTo,
  businessHoursWindows,
  isOfficialWhatsApp,
  isOutsideWindow,
  offersFromCountry,
  parseForwardTo,
  portReasonText,
  participantId,
  templateVariables,
} from "./zernio-rules";

describe("destino da ligação (forwardTo)", () => {
  it("agente da ElevenLabs por SIP com o próprio número em E.164", () => {
    const r = buildForwardTo({ kind: "ai", phone: "(11) 3003-0000" });
    expect(r).toEqual({
      ok: true,
      value: "sip:+551130030000@sip.rtc.elevenlabs.io:5061;transport=tls",
    });
  });
  it("atendente por tel: e central da Zadarma por sip:", () => {
    expect(buildForwardTo({ kind: "phone", phone: "48 99999-0000" })).toEqual({
      ok: true,
      value: "tel:+5548999990000",
    });
    expect(buildForwardTo({ kind: "zadarma", sipUri: "sip:100@pbx.zadarma.com" })).toEqual({
      ok: true,
      value: "sip:100@pbx.zadarma.com",
    });
    expect(buildForwardTo({ kind: "none" })).toEqual({ ok: true, value: "" });
  });
  it("recusa telefone e SIP inválidos", () => {
    expect(buildForwardTo({ kind: "phone", phone: "123" }).ok).toBe(false);
    expect(buildForwardTo({ kind: "zadarma", sipUri: "http://x" }).ok).toBe(false);
    expect(buildForwardTo({ kind: "zadarma", sipUri: "sip:a b@x" }).ok).toBe(false);
  });
  it("lê de volta o que está salvo", () => {
    expect(parseForwardTo("sip:+551130030000@sip.rtc.elevenlabs.io:5061;transport=tls")).toEqual({
      kind: "ai",
      phone: "+551130030000",
    });
    expect(parseForwardTo("tel:+5548999990000")).toEqual({
      kind: "phone",
      phone: "+5548999990000",
    });
    expect(parseForwardTo("sip:100@pbx.zadarma.com")).toEqual({
      kind: "zadarma",
      sipUri: "sip:100@pbx.zadarma.com",
    });
    expect(parseForwardTo(null)).toEqual({ kind: "none" });
  });
});

describe("horário de atendimento", () => {
  it("vira janelas por dia, sem repetir e em ordem", () => {
    expect(
      businessHoursWindows({
        enabled: true,
        days: [5, 1, 1, 9],
        open: "08:00",
        close: "18:00",
        timezone: "America/Sao_Paulo",
      }),
    ).toEqual([
      { day: 1, open: "08:00", close: "18:00" },
      { day: 5, open: "08:00", close: "18:00" },
    ]);
    expect(
      businessHoursWindows({
        enabled: false,
        days: [1],
        open: "08:00",
        close: "18:00",
        timezone: "x",
      }),
    ).toEqual([]);
  });
  it("recusa horário fora de HH:MM", () => {
    expect(() =>
      businessHoursWindows({ enabled: true, days: [1], open: "8h", close: "18:00", timezone: "x" }),
    ).toThrow();
  });
});

describe("WhatsApp oficial e janela de 24 h", () => {
  it("Meta direta e Zernio WhatsApp exigem modelo fora da janela; Instagram não", () => {
    expect(isOfficialWhatsApp({ provider: "whatsapp_cloud", platform: "whatsapp" })).toBe(true);
    expect(isOfficialWhatsApp({ provider: "zernio", platform: "whatsapp" })).toBe(true);
    expect(isOfficialWhatsApp({ provider: "zernio", platform: "instagram" })).toBe(false);
    expect(isOfficialWhatsApp({ provider: "evolution", platform: "whatsapp" })).toBe(false);
  });
  it("janela fecha 24 h depois da última mensagem do cliente", () => {
    const now = Date.parse("2026-10-27T12:00:00Z");
    expect(isOutsideWindow("2026-10-26T12:30:00Z", now)).toBe(false);
    expect(isOutsideWindow("2026-10-26T11:00:00Z", now)).toBe(true);
    expect(isOutsideWindow(null, now)).toBe(true);
  });
  it("conta as variáveis do modelo e monta o participantId", () => {
    expect(templateVariables("Olá {{1}}, seu pedido {{2}} saiu. {{1}}")).toBe(2);
    expect(templateVariables("Sem variáveis")).toBe(0);
    expect(participantId("(48) 99999-0000")).toBe("5548999990000");
    expect(participantId("abc")).toBeNull();
  });
});

describe("catálogo de números (resposta real do BR)", () => {
  it("fixo US$ 5 com WhatsApp e sem SMS; móvel US$ 8 sob pedido com SMS", () => {
    const [fixo, movel] = offersFromCountry(brazilCatalog);
    expect(fixo).toMatchObject({
      numberType: "local",
      label: "Fixo local",
      monthlyUsd: 5,
      needsKyc: true,
      whatsapp: true,
      sms: false,
      instant: true,
      available: true,
    });
    expect(movel).toMatchObject({
      numberType: "mobile",
      label: "Celular",
      monthlyUsd: 8,
      sms: true,
      instant: false,
      available: true,
    });
    expect(movel?.note).toContain("sob pedido");
  });
  it("catálogo vazio não quebra", () => {
    expect(offersFromCountry(null)).toEqual([]);
  });
});

describe("saúde do número de saída", () => {
  const base = {
    number: "+551130030000",
    calls_last_hour: 5,
    calls_total: 40,
    answered: 20,
    short_calls: 2,
    avg_duration_seconds: 95,
  };
  it("saudável", () => {
    expect(assessNumberHealth(base)).toEqual({ level: "ok", answerRate: 0.5, reasons: [] });
  });
  it("no limite de 60 por hora é risco", () => {
    const v = assessNumberHealth({ ...base, calls_last_hour: 60 });
    expect(v.level).toBe("risk");
    expect(v.reasons[0]).toContain("60 ligações");
  });
  it("pouca gente atende é risco; abaixo de 30% é atenção", () => {
    expect(assessNumberHealth({ ...base, answered: 4 }).level).toBe("risk");
    expect(assessNumberHealth({ ...base, answered: 10 }).level).toBe("attention");
  });
  it("amostra pequena não acusa taxa de atendimento", () => {
    expect(assessNumberHealth({ ...base, calls_total: 5, answered: 0 }).level).toBe("ok");
  });
  it("muita ligação curta é risco", () => {
    expect(assessNumberHealth({ ...base, short_calls: 12 }).level).toBe("risk");
    expect(assessNumberHealth({ ...base, avg_duration_seconds: 12 }).level).toBe("attention");
  });
});

describe("volta do cadastro hospedado", () => {
  it("WhatsApp conectado com coexistência", () => {
    expect(
      parseZernioReturn({
        zernio: "whatsapp",
        coex: "1",
        accountId: "66b2e19d8c3f5a7e9d0b1c2d",
        connected: "whatsapp",
      }),
    ).toEqual({
      kind: "whatsapp",
      zernioAccountId: "66b2e19d8c3f5a7e9d0b1c2d",
      coexistence: true,
      error: null,
    });
  });
  it("erro da Zernio vira frase em português", () => {
    const r = parseZernioReturn({ zernio: "whatsapp", error: "connection_cancelled" });
    expect(r?.kind === "whatsapp" && r.error).toContain("fechado");
  });
  it("KYC enviado e parâmetro estranho", () => {
    expect(parseZernioReturn({ zernio: "kyc", kyc: "submitted" })).toEqual({
      kind: "kyc",
      submitted: true,
    });
    expect(parseZernioReturn({ zernio: "outro" })).toBeNull();
    expect(parseZernioReturn({ zernio: "whatsapp", accountId: "<script>" })).toMatchObject({
      zernioAccountId: null,
    });
  });
});

describe("portReasonText", () => {
  it("traduz o código real no_coverage e sugere o caminho sem portar", () => {
    const t = portReasonText("no_coverage");
    expect(t).not.toContain("no_coverage");
    expect(t).toContain("conecte o próprio aparelho");
  });
  it("código desconhecido nunca aparece cru", () => {
    expect(portReasonText("carrier_blocked_x")).toBe(
      "a Zernio não aceitou a portabilidade deste número agora",
    );
  });
  it("frase humana passa como veio, sem ponto final", () => {
    expect(portReasonText("A operadora atual não libera a portabilidade.")).toBe(
      "A operadora atual não libera a portabilidade",
    );
  });
  it("vazio vira a frase padrão", () => {
    expect(portReasonText(null)).toContain("não libera");
  });
});
