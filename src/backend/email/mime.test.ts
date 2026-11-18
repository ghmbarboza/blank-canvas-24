import { describe, expect, it } from "vitest";

import { buildMime, encodeAddress, encodeHeader } from "./mime";

describe("cabeçalhos", () => {
  it("ASCII passa e acento vira encoded-word", () => {
    expect(encodeHeader("Hello")).toBe("Hello");
    expect(encodeHeader("Reunião")).toBe(
      `=?UTF-8?B?${Buffer.from("Reunião").toString("base64")}?=`,
    );
  });
  it("não deixa injetar cabeçalho por quebra de linha", () => {
    expect(encodeHeader("a\r\nBcc: x@y.com")).toBe("a Bcc: x@y.com");
  });
  it("endereço com nome", () => {
    expect(encodeAddress("Loja <a@b.com>")).toBe("Loja <a@b.com>");
    expect(encodeAddress("a@b.com")).toBe("a@b.com");
    expect(encodeAddress('"João" <j@b.com>')).toMatch(/^=\?UTF-8\?B\?.+\?= <j@b\.com>$/);
  });
});

describe("buildMime", () => {
  it("monta alternativo texto + HTML sem anexo", () => {
    const raw = buildMime({
      from: "Loja <a@b.com>",
      to: ["c@d.com"],
      subject: "Oi",
      html: "<p>Olá</p>",
      text: "Olá",
      replyTo: "r@b.com",
      headers: { "List-Unsubscribe": "<https://x>", "Bad Header": "x" },
      boundary: "T",
    });
    expect(raw).toContain("Subject: Oi\r\n");
    expect(raw).toContain("Reply-To: r@b.com\r\n");
    expect(raw).toContain("List-Unsubscribe: <https://x>\r\n");
    expect(raw).not.toContain("Bad Header");
    expect(raw).toContain('multipart/alternative; boundary="alt_T"');
    expect(raw).not.toContain("multipart/mixed");
    expect(raw).toContain(Buffer.from("<p>Olá</p>").toString("base64"));
  });

  it("com anexo vira multipart/mixed e mantém o base64 do anexo", () => {
    const content = Buffer.from("BEGIN:VCALENDAR").toString("base64");
    const raw = buildMime({
      from: "a@b.com",
      to: ["c@d.com"],
      subject: "Convite",
      html: "<p>x</p>",
      attachments: [{ filename: "convite.ics", content, content_type: "text/calendar" }],
      boundary: "T",
    });
    expect(raw).toContain('multipart/mixed; boundary="mixed_T"');
    expect(raw).toContain('Content-Disposition: attachment; filename="convite.ics"');
    expect(raw).toContain('Content-Type: text/calendar; name="convite.ics"');
    expect(raw).toContain(content);
    expect(raw.trimEnd().endsWith("--mixed_T--")).toBe(true);
  });
});
