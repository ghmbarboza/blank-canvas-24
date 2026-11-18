import { describe, expect, it } from "vitest";

import { contactUpsert, saleNote, validFlowUrl } from "./flowcrm";

const c = {
  name: "Maria Souza",
  email: "maria@empresa.com",
  phone: "5511999998888",
  company: "Empresa X",
  origin: "whatsapp",
};

describe("Flow CRM: contrato do webhook-inbound", () => {
  it("contato novo vira contact.upsert com origem nas tags", () => {
    const b = contactUpsert(c);
    expect(b.action).toBe("contact.upsert");
    expect(b.data).toMatchObject({ email: "maria@empresa.com", telefone: "5511999998888" });
    expect(b.data.tags).toEqual(["vinculo", "whatsapp"]);
  });

  it("venda vira anotação com valor em reais e motivo da perda", () => {
    const won = saleNote(c, { title: "Plano anual", value: 4500, status: "won" });
    expect(won.action).toBe("note.create");
    expect(won.data.title).toContain("Venda ganha no Vínculo: Plano anual");
    expect(won.data.title).toContain("4.500,00");
    const lost = saleNote(c, { title: "Plano", value: null, status: "lost", reason: "Preço" });
    expect(lost.data.title).toBe("Venda perdida no Vínculo: Plano");
    expect(lost.data.body).toBe("Motivo: Preço");
  });

  it("só aceita https público", () => {
    expect(validFlowUrl("https://x.supabase.co/functions/v1/webhook-inbound").hostname).toBe(
      "x.supabase.co",
    );
    for (const bad of [
      "http://x.supabase.co/a",
      "https://localhost/a",
      "https://127.0.0.1/a",
      "https://10.0.0.5/a",
      "https://192.168.1.2/a",
      "https://user:pw@x.co/a",
      "nada",
    ])
      expect(() => validFlowUrl(bad), bad).toThrow();
  });
});
