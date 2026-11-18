import { describe, expect, it } from "vitest";

import { MASK, redact } from "./redact";

describe("redact", () => {
  it("troca as chaves dos provedores por ••••", () => {
    const r = redact(
      "minha zernio é sk_FakeZernio1234567890abcd e o resend re_Fake1234567890abcdefGHIJ",
    );
    expect(r.text).toBe(`minha zernio é ${MASK} e o resend ${MASK}`);
    expect(r.secrets).toHaveLength(2);
  });

  it("pega OpenAI, Anthropic, Asaas, AWS, JWT e token longo genérico", () => {
    const keys = [
      "sk-proj-abcDEF1234567890abcDEF1234567890",
      "sk-ant-api03-ABCdef1234567890ABCdef1234567890",
      "$aact_prod_000MzkwODA2MWY2OGM3MWRlMDU2NWM3MzJlZTEwZGYzMzk0",
      "AKIAIOSFODNN7EXAMPLE",
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U",
      "9b8f7e6d5c4b3a291807f6e5d4c3b2a19f8e7d6c",
    ];
    for (const k of keys) expect(redact(`chave: ${k}`).text, k).toBe(`chave: ${MASK}`);
  });

  it("não mexe em texto comum, e-mail, telefone nem link", () => {
    const t =
      "Somos a Clínica Sorriso, contato@sorriso.com.br, (19) 99798-8959, https://sorriso.com.br/servicos";
    expect(redact(t)).toEqual({ text: t, secrets: [] });
  });
});

import { fromPerson } from "./tools.server";

describe("fromPerson (defesa contra instrução escondida em site ou documento)", () => {
  it("aceita valor que a pessoa escreveu e recusa valor que só apareceu em outra fonte", () => {
    const said = "convide a ana@sorriso.com.br como atendente";
    expect(() => fromPerson(said, "ana@sorriso.com.br", "O e-mail")).not.toThrow();
    expect(() => fromPerson(said, "hacker@golpe.com", "O e-mail")).toThrow(/escrito por você/);
    expect(() => fromPerson(said, "", "A chave")).toThrow();
  });
});

describe("resposta de formulário de chave sem formato conhecido", () => {
  it("mascara o valor depois do rótulo de chave ou segredo", () => {
    const r = redact(
      "Key da Zadarma: EXEMPLOabcdef0123456\nSecret da Zadarma: EXEMPLOfedcba6543210",
    );
    expect(r.text).toBe(`Key da Zadarma: ${MASK}\nSecret da Zadarma: ${MASK}`);
    expect(r.secrets).toHaveLength(2);
  });
  it("não mexe em campo comum nem no que já está mascarado", () => {
    const t =
      "E-mail remetente: clinica@mail.viverdeia.app\nChave da Resend: •••• (guardado no cofre)";
    expect(redact(t).text).toBe(t);
    expect(redact("A chave: ok").text).toBe("A chave: ok");
  });
});

describe("chave da Evolution e da Zernio coladas na conversa", () => {
  it("mascara a chave do servidor do WhatsApp dita no meio da frase e mantém o endereço", () => {
    const r = redact(
      "o endereço é https://evo.minhaloja.com.br e a chave é B6D711FCDE4D4FD5936544120E713976",
    );
    expect(r.text).toBe(`o endereço é https://evo.minhaloja.com.br e a chave é ${MASK}`);
  });
  it("mascara chave curta (sem formato conhecido) pelo rótulo", () => {
    expect(redact("a chave da evolution é minhaChave2024").text).toBe(
      `a chave da evolution é ${MASK}`,
    );
    expect(redact("Chave do servidor: Loja#Segura99").text).toBe(`Chave do servidor: ${MASK}`);
    expect(redact("apikey=abc12345xyz").text).toBe(`apikey=${MASK}`);
  });
  it("mascara a chave da Zernio em qualquer lugar da frase", () => {
    expect(redact("segue sk_FakeZernio1234567890abcd para o instagram").text).toBe(
      `segue ${MASK} para o instagram`,
    );
    expect(redact("Chave da Zernio: sk_FakeZernio1234567890abcd").text).toBe(
      `Chave da Zernio: ${MASK}`,
    );
  });
  it("não confunde frase comum com chave", () => {
    for (const t of [
      "a chave é importante para o negócio",
      "qual é a chave do servidor?",
      "o endereço do servidor é https://evo.minhaloja.com.br, já mando a chave",
      "minha senha é fraca",
    ])
      expect(redact(t).text, t).toBe(t);
  });
});

import { hideSecrets, modelText } from "./nexa-tools";

describe("segredo usado numa ferramenta some da resposta e do histórico", () => {
  it("tira o valor exato que a ferramenta recebeu, mesmo sem formato de chave", () => {
    const said = "o servidor é https://evo.loja.com.br, chave lojabonita";
    expect(hideSecrets(said, ["lojabonita"])).toBe(
      "o servidor é https://evo.loja.com.br, chave ••••",
    );
    expect(hideSecrets("guardei a chave lojabonita no cofre", ["lojabonita"])).not.toContain(
      "lojabonita",
    );
  });
  it("o que a IA lê de volta de uma ferramenta é só texto, sem bloco nem ação", () => {
    const text = modelText({
      ok: true,
      resultado: "QR Code na tela",
      bloco: { kind: "whatsapp", title: "QR", channelId: "c1" },
      acao: { kind: "done", label: "QR Code gerado", tool: "conectar_whatsapp" },
    });
    expect(text).toBe("QR Code na tela");
    expect(modelText({ ok: false, erro: "servidor fora do ar" })).toBe("ERRO: servidor fora do ar");
  });
});
