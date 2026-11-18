import { describe, expect, it } from "vitest";

import { readCallExtra, voicePlaybook } from "./voice-playbook";

describe("roteiro de ligação", () => {
  it("ligação recebida não ganha o roteiro de prospecção", () => {
    const text = voicePlaybook({ direction: "inbound", reason: null, assistant: null }, "Clínica");
    expect(text).toContain("LIGAÇÃO por telefone");
    expect(text).not.toContain("QUE VOCÊ FEZ");
  });

  it("ligação feita por nós apresenta, dá o motivo, pede licença e argumenta uma vez só", () => {
    const text = voicePlaybook(
      { direction: "outbound", reason: "lembrar a manutenção do implante", assistant: "Clara" },
      "Clínica Teste",
    );
    expect(text).toContain("QUE VOCÊ FEZ");
    expect(text).toContain("Nesta ligação seu nome é Clara.");
    expect(text).toContain("MOTIVO DESTA LIGAÇÃO: lembrar a manutenção do implante");
    expect(text).toContain("tem um minutinho?");
    expect(text).toContain("Nunca mais de um argumento");
    expect(text).toContain("pediu para não receber ligações");
    expect(text).toContain("encerrar_ligacao");
  });

  it("sem motivo, liga para apresentar a empresa", () => {
    const text = voicePlaybook({ direction: "outbound", reason: "", assistant: null }, "Clínica X");
    expect(text).toContain("MOTIVO DESTA LIGAÇÃO: apresentar a Clínica X");
  });

  it("lê o que o disparo mandou e ignora o resto", () => {
    expect(
      readCallExtra({
        elevenlabs_extra_body: {
          direction: "outbound",
          motivo: " oferecer avaliação ",
          telefone: "+55 (11) 90000-0000",
          lixo: 1,
        },
      }),
    ).toEqual({
      direction: "outbound",
      motivo: "oferecer avaliação",
      assistente: undefined,
      contact_id: undefined,
      telefone: "+5511900000000",
    });
    expect(readCallExtra({})).toEqual({});
    expect(readCallExtra(null)).toEqual({});
  });
});

describe("roteiro no motor da ElevenLabs", () => {
  it("usa end_call no lugar de encerrar_ligacao", () => {
    const text = voicePlaybook(
      { direction: "outbound", reason: "{{motivo}}", assistant: "{{assistente}}" },
      "Clínica",
      "end_call",
      true,
    );
    expect(text).toContain("end_call");
    expect(text).not.toContain("Antes de usar qualquer ferramenta");
    expect(text).toContain("nunca responda como se fosse ele");
    expect(text).not.toContain("encerrar_ligacao");
    expect(text).toContain("MOTIVO DESTA LIGAÇÃO: {{motivo}}");
    expect(text).toContain("Nesta ligação seu nome é {{assistente}}.");
  });
});

describe("um agente de voz para entrada e saída", () => {
  it("traz os dois roteiros e decide pela variável direcao", () => {
    const text = voicePlaybook(
      { direction: "any", reason: null, assistant: null },
      "Clínica",
      "end_call",
      true,
    );
    expect(text).toContain("{{direcao}}");
    expect(text).toContain('Se for "entrada"');
    expect(text).toContain('Se for "saida"');
    expect(text).toContain("MOTIVO DESTA LIGAÇÃO: {{motivo}}");
    expect(text).toContain("kb_search");
    expect(text).not.toContain("encerrar_ligacao");
  });
});

describe("o que a ligação de 28/10 22h05 errou", () => {
  const text = voicePlaybook(
    { direction: "outbound", reason: "revisão do implante", assistant: "Clara" },
    "Clínica",
    "end_call",
    true,
  );
  it("encerrar vem antes de tudo e na mesma resposta", () => {
    expect(text.indexOf("ENCERRAR TEM PRIORIDADE MÁXIMA")).toBe(0);
    expect(text).toContain("chame end_call NA MESMA resposta");
  });
  it("quebra a primeira objeção com um argumento e só desiste no segundo não", () => {
    expect(text).toContain('PRIMEIRO "não"');
    expect(text).toContain("SEGUNDO");
  });
  it("não pede telefone nem inventa data", () => {
    expect(text).toContain("Nunca peça dado que a empresa já tem");
    expect(text).toContain("nunca peça para a pessoa inventar data");
  });
});
