import { describe, expect, it } from "vitest";

import {
  callNextStep,
  callsLeft,
  formatClock,
  inCallScope,
  transcriptTurns,
  detectSpokenOptOut,
  formatDuration,
  inQuietHours,
  inWindow,
  isZadarmaIp,
  zadarmaOriginCheck,
  parseCreatedExtension,
  isValidStartExtension,
  occupancyPercent,
  limitedByCostReason,
  mapDisposition,
  outboundGuard,
  phoneKey,
  toE164,
} from "./lib";

describe("telefone", () => {
  it("normaliza para E.164 com +55", () => {
    expect(toE164("(48) 99999-0000")).toBe("+5548999990000");
    expect(toE164("+351 916 637 509")).toBe("+351916637509");
    expect(toE164("048 99999-0000")).toBe("+5548999990000");
    expect(toE164("123")).toBeNull();
  });
  it("casa contato pelos últimos 8 dígitos", () => {
    expect(phoneKey("+55 48 99999-0000")).toBe("99990000");
    expect(phoneKey("4899990000")).toBe("99990000");
  });
});

describe("status da Zadarma", () => {
  it("limited by cost separa saldo vazio do teto por minuto", () => {
    expect(limitedByCostReason(0.2)).toContain("saldo esgotado");
    expect(limitedByCostReason(19.96)).toContain("teto de custo por minuto");
    expect(mapDisposition("limited by cost", "outbound", 15).reason).toContain(
      "Carregar saldo não resolve",
    );
  });
  it("não atendida vira perdida na entrada e sem resposta na saída", () => {
    expect(mapDisposition("no answer", "inbound").status).toBe("missed");
    expect(mapDisposition("no answer", "outbound").status).toBe("no_answer");
    expect(mapDisposition("answered", "outbound").status).toBe("completed");
  });
});

describe("horários", () => {
  const tz = "America/Sao_Paulo";
  it("janela da campanha respeita dia e hora local", () => {
    const quarta10h = new Date("2026-10-21T13:00:00Z");
    expect(inWindow(quarta10h, tz, "09:00", "18:00", [1, 2, 3, 4, 5])).toBe(true);
    expect(inWindow(quarta10h, tz, "11:00", "18:00", [1, 2, 3, 4, 5])).toBe(false);
    expect(inWindow(quarta10h, tz, "09:00", "18:00", [0, 6])).toBe(false);
  });
  it("silêncio atravessa a meia-noite", () => {
    expect(inQuietHours(new Date("2026-10-22T02:00:00Z"), tz)).toBe(true);
    expect(inQuietHours(new Date("2026-10-21T15:00:00Z"), tz)).toBe(false);
  });
});

describe("Anatel e opt-out", () => {
  const now = new Date("2026-10-21T15:00:00Z");
  it("pausa depois de duas ligações curtas no dia", () => {
    const short = {
      started_at: "2026-10-21T10:00:00Z",
      answered_at: "2026-10-21T10:00:02Z",
      billseconds: 4,
    };
    expect(outboundGuard([short], now).ok).toBe(true);
    expect(outboundGuard([short, short], now).ok).toBe(false);
  });
  it("limita a 3 tentativas por dia e esquece o dia anterior", () => {
    const miss = { started_at: "2026-10-21T10:00:00Z", answered_at: null, billseconds: 0 };
    expect(outboundGuard([miss, miss, miss], now).ok).toBe(false);
    expect(outboundGuard([{ ...miss, started_at: "2026-10-19T10:00:00Z" }], now).ok).toBe(true);
  });
  it("reconhece pedido falado de não ligar", () => {
    expect(detectSpokenOptOut("Por favor não me ligue mais")).toBeTruthy();
    expect(detectSpokenOptOut("tira meu número da lista")).toBeTruthy();
    expect(detectSpokenOptOut("pode ligar amanhã")).toBeNull();
  });
  it("formata duração e calcula ligações que o saldo paga", () => {
    expect(formatDuration(75)).toBe("1min 15s");
    expect(formatDuration(9)).toBe("9s");
    expect(callsLeft(2.66, 0.2)).toBe(13);
  });
});

describe("origem dos webhooks", () => {
  it("aceita só as redes da Zadarma", () => {
    expect(isZadarmaIp("185.45.153.10")).toBe(true);
    expect(isZadarmaIp("37.139.38.200")).toBe(true);
    expect(isZadarmaIp("195.122.19.40")).toBe(false);
    expect(isZadarmaIp("8.8.8.8")).toBe(false);
    expect(isZadarmaIp(null)).toBe(false);
  });
});

describe("checagem de origem do webhook", () => {
  it("recusa quando o IP não vem", () => {
    expect(zadarmaOriginCheck(null)).toEqual({ ok: false, reason: "missing_ip" });
    expect(zadarmaOriginCheck("")).toEqual({ ok: false, reason: "missing_ip" });
    expect(zadarmaOriginCheck("sem-ip")).toEqual({ ok: false, reason: "missing_ip" });
  });
  it("recusa IP fora das faixas e aceita dentro", () => {
    expect(zadarmaOriginCheck("8.8.8.8")).toEqual({ ok: false, reason: "forbidden_ip" });
    expect(zadarmaOriginCheck("::1")).toEqual({ ok: false, reason: "forbidden_ip" });
    expect(zadarmaOriginCheck("185.45.152.7")).toEqual({ ok: true });
    expect(zadarmaOriginCheck(" 185.45.155.9 ")).toEqual({ ok: true });
  });
});

describe("ramal criado pela API", () => {
  it("monta o login SIP com o id da PABX", () => {
    expect(parseCreatedExtension({ numbers: [{ number: 103 }] }, 12345)).toEqual({
      extension: "103",
      sipLogin: "12345-103",
    });
  });
  it("sem id da PABX fica sem login SIP", () => {
    expect(parseCreatedExtension({ numbers: [{ number: "104" }] }, undefined)).toEqual({
      extension: "104",
      sipLogin: null,
    });
  });
  it("resposta sem ramal válido devolve null", () => {
    expect(parseCreatedExtension({ numbers: [] }, 1)).toBeNull();
    expect(parseCreatedExtension({}, 1)).toBeNull();
    expect(parseCreatedExtension({ numbers: [{ number: "abc" }] }, 1)).toBeNull();
    expect(parseCreatedExtension(null, 1)).toBeNull();
  });
  it("ramal inicial aceita só 100 a 999", () => {
    expect(isValidStartExtension("100")).toBe(true);
    expect(isValidStartExtension("999")).toBe(true);
    expect(isValidStartExtension("099")).toBe(false);
    expect(isValidStartExtension("1000")).toBe(false);
    expect(isValidStartExtension(100)).toBe(false);
  });
});

describe("ocupação dos atendentes", () => {
  it("divide tempo em ligação pela janela do expediente", () => {
    expect(occupancyPercent(1800, 3600)).toBe(50);
    expect(occupancyPercent(3600, 3600, 4)).toBe(25);
  });
  it("sem janela devolve null e nunca passa de 100%", () => {
    expect(occupancyPercent(100, 0)).toBeNull();
    expect(occupancyPercent(100, 3600, 0)).toBeNull();
    expect(occupancyPercent(9000, 3600)).toBe(100);
    expect(occupancyPercent(-5, 3600)).toBe(0);
  });
});

describe("transcrição em turnos", () => {
  it("lê o formato da IA de voz", () => {
    expect(
      transcriptTurns(
        [
          { speaker: "agent", text: "Olá, aqui é a Nexus.", at: 2 },
          { speaker: "user", text: "Quero remarcar.", at: 8 },
        ],
        null,
      ),
    ).toEqual([
      { who: "agent", text: "Olá, aqui é a Nexus.", at: 2 },
      { who: "customer", text: "Quero remarcar.", at: 8 },
    ]);
  });
  it("lê o formato do Deepgram (0 = atendente)", () => {
    expect(transcriptTurns([{ speaker: 1, transcript: "Oi", start: 1.5 }], null)).toEqual([
      { who: "customer", text: "Oi", at: 1.5 },
    ]);
  });
  it("cai para o texto quando não há segmentos", () => {
    expect(transcriptTurns([], "Atendente: Bom dia\nCliente: Oi\ncontinua")).toEqual([
      { who: "agent", text: "Bom dia", at: null },
      { who: "customer", text: "Oi continua", at: null },
    ]);
    expect(transcriptTurns(null, null)).toEqual([]);
  });
});

describe("pílulas de Ligações", () => {
  const base = { status: "completed", answered_at: "x", voice_agent_id: null, user_id: "u1" };
  it("separa perdidas, IA e minhas", () => {
    expect(inCallScope({ ...base, answered_at: null, status: "missed" }, "missed", null)).toBe(
      true,
    );
    expect(inCallScope({ ...base, status: "ringing", answered_at: null }, "missed", null)).toBe(
      false,
    );
    expect(inCallScope({ ...base, voice_agent_id: "a" }, "ai", null)).toBe(true);
    expect(inCallScope({ ...base, voice_agent_id: "a", answered_at: null }, "ai", null)).toBe(
      false,
    );
    expect(inCallScope(base, "mine", "u1")).toBe(true);
    expect(inCallScope(base, "mine", null)).toBe(false);
  });
  it("formata relógio e lê o próximo passo", () => {
    expect(formatClock(75)).toBe("01:15");
    expect(callNextStep({ next_step: " Ligar amanhã " })).toBe("Ligar amanhã");
    expect(callNextStep(null)).toBeNull();
  });
});
