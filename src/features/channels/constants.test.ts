import { describe, expect, it } from "vitest";

import { channelBrand, providerLabel } from "./constants";

describe("channelBrand", () => {
  it("SMS pela Zadarma e e-mail pelo Gmail/Outlook ganham o logo da ferramenta", () => {
    expect(channelBrand({ provider: "zadarma", platform: "sms" })).toBe("zadarma");
    expect(
      channelBrand({ provider: "email", platform: "email", config: { toolkit: "outlook" } }),
    ).toBe("outlook");
    expect(channelBrand({ provider: "email", platform: "email", name: "Gmail (Composio)" })).toBe(
      "gmail",
    );
  });

  it("sem ferramenta conhecida fica o ícone da plataforma", () => {
    expect(channelBrand({ provider: "email", platform: "email", name: "E-mail" })).toBeNull();
    expect(channelBrand({ provider: "zernio", platform: "whatsapp" })).toBeNull();
  });

  it("rótulo do provedor nunca sai cru", () => {
    expect(providerLabel("email", "email")).toBe("E-mail");
  });
});
