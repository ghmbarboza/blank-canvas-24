import { describe, expect, it } from "vitest";

import { isValidRegion, sesSendBody } from "./ses.server";

describe("SES", () => {
  it("aceita só região no formato da AWS", () => {
    expect(isValidRegion("sa-east-1")).toBe(true);
    expect(isValidRegion("us-gov-west-1")).toBe(true);
    expect(isValidRegion("evil.com/x")).toBe(false);
    expect(isValidRegion("")).toBe(false);
  });

  it("monta o corpo Simple com cabeçalhos e tags válidas", () => {
    const b = sesSendBody({
      from: "Loja <a@b.com>",
      to: ["c@d.com"],
      subject: "Oi",
      html: "<p>x</p>",
      text: "x",
      replyTo: "r@b.com",
      headers: { "List-Unsubscribe": "<https://x>", "bad header": "y" },
      tags: [
        { name: "nexus_message", value: "0d8f-11" },
        { name: "com espaço", value: "x" },
      ],
    }) as {
      Content: { Simple: { Headers: { Name: string }[]; Body: { Text?: unknown } } };
      EmailTags: unknown[];
      ReplyToAddresses: string[];
    };
    expect(b.Content.Simple.Headers).toEqual([{ Name: "List-Unsubscribe", Value: "<https://x>" }]);
    expect(b.Content.Simple.Body.Text).toEqual({ Data: "x", Charset: "UTF-8" });
    expect(b.EmailTags).toEqual([{ Name: "nexus_message", Value: "0d8f-11" }]);
    expect(b.ReplyToAddresses).toEqual(["r@b.com"]);
  });

  it("com anexo manda a mensagem crua em base64", () => {
    const b = sesSendBody({
      from: "a@b.com",
      to: ["c@d.com"],
      subject: "Convite",
      html: "<p>x</p>",
      attachments: [{ filename: "convite.ics", content: Buffer.from("ics").toString("base64") }],
    }) as { Content: { Raw?: { Data: string }; Simple?: unknown } };
    expect(b.Content.Simple).toBeUndefined();
    const raw = Buffer.from(b.Content.Raw!.Data, "base64").toString("utf8");
    expect(raw).toContain('filename="convite.ics"');
    expect(raw).toContain("Subject: Convite");
  });
});
