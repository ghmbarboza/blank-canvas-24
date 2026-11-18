import { describe, expect, it } from "vitest";

import { isSnsUrl, parseSesEvent, stringToSign, type SnsMessage } from "./sns";

const BASE: SnsMessage = {
  Type: "Notification",
  MessageId: "m1",
  TopicArn: "arn:aws:sns:us-east-1:123:ses",
  Message: "{}",
  Timestamp: "2026-10-21T22:00:00.000Z",
  Signature: "x",
  SignatureVersion: "2",
  SigningCertURL: "https://sns.us-east-1.amazonaws.com/cert.pem",
};

describe("SNS", () => {
  it("monta o texto assinado em ordem alfabética, sem Subject ausente", () => {
    expect(stringToSign(BASE)).toBe(
      "Message\n{}\nMessageId\nm1\nTimestamp\n2026-10-21T22:00:00.000Z\nTopicArn\narn:aws:sns:us-east-1:123:ses\nType\nNotification\n",
    );
    const sub = stringToSign({
      ...BASE,
      Type: "SubscriptionConfirmation",
      SubscribeURL: "https://sns.us-east-1.amazonaws.com/?Action=Confirm",
      Token: "t",
    });
    expect(sub).toContain(
      "SubscribeURL\nhttps://sns.us-east-1.amazonaws.com/?Action=Confirm\nTimestamp",
    );
    expect(sub).toContain("Token\nt\nTopicArn");
  });

  it("só aceita certificado e inscrição de host da SNS", () => {
    expect(
      isSnsUrl("https://sns.sa-east-1.amazonaws.com/SimpleNotificationService-1.pem", "cert"),
    ).toBe(true);
    expect(isSnsUrl("https://sns.sa-east-1.amazonaws.com.evil.com/x.pem", "cert")).toBe(false);
    expect(isSnsUrl("http://sns.us-east-1.amazonaws.com/x.pem", "cert")).toBe(false);
    expect(isSnsUrl("https://evil.com/sns.us-east-1.amazonaws.com/x.pem", "cert")).toBe(false);
    expect(isSnsUrl("https://sns.us-east-1.amazonaws.com/x.txt", "cert")).toBe(false);
  });

  it("lê entrega, devolução permanente e reclamação; ignora devolução temporária", () => {
    const ev = (o: object) => JSON.stringify({ mail: { messageId: "abc" }, ...o });
    expect(parseSesEvent(ev({ eventType: "Delivery" }))).toEqual({
      providerId: "abc",
      kind: "delivered",
      detail: null,
    });
    expect(
      parseSesEvent(
        ev({
          notificationType: "Bounce",
          bounce: {
            bounceType: "Permanent",
            bouncedRecipients: [{ diagnosticCode: "550 no user" }],
          },
        }),
      ),
    ).toEqual({ providerId: "abc", kind: "bounce", detail: "550 no user" });
    expect(
      parseSesEvent(ev({ eventType: "Bounce", bounce: { bounceType: "Transient" } })),
    ).toBeNull();
    expect(parseSesEvent(ev({ eventType: "Complaint" }))?.kind).toBe("complaint");
    expect(parseSesEvent("lixo")).toBeNull();
  });
});
