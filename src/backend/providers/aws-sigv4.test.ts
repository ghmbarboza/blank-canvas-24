import { describe, expect, it } from "vitest";

import { amzDate, rfc3986, signRequest, signingKey } from "./aws-sigv4";

// Credenciais de exemplo publicadas pela AWS na documentação e na suíte oficial de testes do SigV4.
const CREDS = {
  accessKeyId: "AKIDEXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
};
const DATE = new Date("2015-08-30T12:36:00Z");

describe("SigV4: vetores oficiais da AWS", () => {
  it("chave de assinatura (exemplo da documentação: 20120215/us-east-1/iam)", () => {
    expect(signingKey(CREDS.secretAccessKey, "20120215", "us-east-1", "iam").toString("hex")).toBe(
      "f4780e2d9f65fa895f9c67b32ce1baf0b0d8a43505a000a1a9e090d414db404d",
    );
  });

  it("get-vanilla da suíte aws-sig-v4-test-suite", () => {
    const s = signRequest({
      method: "GET",
      url: "https://example.amazonaws.com/",
      region: "us-east-1",
      service: "service",
      credentials: CREDS,
      date: DATE,
    });
    expect(s.canonicalRequest).toBe(
      [
        "GET",
        "/",
        "",
        "host:example.amazonaws.com",
        "x-amz-date:20150830T123600Z",
        "",
        "host;x-amz-date",
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      ].join("\n"),
    );
    expect(s.headers["authorization"]).toBe(
      "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31",
    );
  });

  it("exemplo IAM ListUsers da documentação (query string e content-type)", () => {
    const s = signRequest({
      method: "GET",
      url: "https://iam.amazonaws.com/?Action=ListUsers&Version=2010-05-08",
      region: "us-east-1",
      service: "iam",
      headers: { "Content-Type": "application/x-www-form-urlencoded; charset=utf-8" },
      credentials: CREDS,
      date: DATE,
    });
    expect(s.stringToSign.split("\n")[3]).toBe(
      "f536975d06c0309214f805bb90ccff089219ecd68b2577efef23edd43b7e1a59",
    );
    expect(s.signature).toBe("5d672d79c15b13162d9279b0855cfba6789a8edb4c82c400e06b5924a6f2b5d7");
  });
});

describe("SigV4: detalhes", () => {
  it("data no formato da AWS", () => {
    expect(amzDate(DATE)).toBe("20150830T123600Z");
  });
  it("RFC 3986 escapa o que o encodeURIComponent deixa passar", () => {
    expect(rfc3986("a b!'()*~")).toBe("a%20b%21%27%28%29%2A~");
  });
  it("token de sessão entra assinado", () => {
    const s = signRequest({
      method: "POST",
      url: "https://email.sa-east-1.amazonaws.com/v2/email/outbound-emails",
      region: "sa-east-1",
      service: "ses",
      body: "{}",
      credentials: { ...CREDS, sessionToken: "tok" },
      date: DATE,
    });
    expect(s.headers["x-amz-security-token"]).toBe("tok");
    expect(s.headers["authorization"]).toContain(
      "SignedHeaders=host;x-amz-date;x-amz-security-token",
    );
  });
});
