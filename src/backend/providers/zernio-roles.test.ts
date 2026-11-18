import { describe, expect, it } from "vitest";

import { zernioRole } from "./zernio-roles";

describe("zernioRole", () => {
  it("compra, portabilidade e chave exigem administrador", () => {
    for (const a of ["numbers.purchase", "port.check", "key.save", "voice.save", "calling.save"])
      expect(zernioRole(a)).toBe("admin");
  });
  it("atender fica com qualquer membro", () => {
    for (const a of ["message.send", "call.whatsapp", "web.dial", "call.end"])
      expect(zernioRole(a)).toBe("member");
  });
  it("transferir ligação em curso exige gestor (S10)", () => {
    expect(zernioRole("call.transfer")).toBe("manager");
  });
  it("ação desconhecida não ganha papel alto, mas a rota recusa a ação depois", () => {
    expect(zernioRole("qualquer")).toBe("member");
  });
});
