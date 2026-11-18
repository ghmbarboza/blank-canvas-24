import { expect, test } from "@playwright/test";

// Superfície pública: páginas para clientes e rotas de integração. Nada aqui exige login.
test.describe("rotas de servidor", () => {
  test("saúde: runtime enxerga o banco com a service role", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, db: true });
    expect(body.build).toMatch(/^[a-f0-9]{40}$/);
    if (process.env["EXPECTED_BUILD_SHA"])
      expect(body.build).toBe(process.env["EXPECTED_BUILD_SHA"]);
    // sem sessão de admin, nada de nomes de serviço nem de chaves
    expect(body).not.toHaveProperty("services");
    expect(body).not.toHaveProperty("service_role");
  });

  test("agendador recusa chamada sem segredo", async ({ request }) => {
    const res = await request.post("/api/public/cron", { data: {} });
    expect(res.status()).toBe(401);
  });

  test("API pública exige chave", async ({ request }) => {
    expect((await request.get("/api/v1/contacts")).status()).toBe(401);
    expect(
      (await request.get("/api/v1/contacts", { headers: { "x-api-key": "nx_invalida" } })).status(),
    ).toBe(401);
    expect((await request.get("/api/v1/deals")).status()).toBe(401);
  });

  test("rotas internas exigem sessão", async ({ request }) => {
    for (const path of [
      "/api/integrations",
      "/api/privacy",
      "/api/webhooks",
      "/api/meetings",
      "/api/email",
      "/api/telephony",
    ]) {
      const res = await request.post(path, {
        data: { accountId: "00000000-0000-0000-0000-000000000000" },
      });
      // sem sessão nunca pode dar certo: 401 (sessão) ou 400 (pedido inválido antes de chegar nos dados)
      expect([400, 401], path).toContain(res.status());
    }
  });

  test("webhook da Zadarma responde o eco de validação", async ({ request }) => {
    const res = await request.get("/api/public/zadarma?zd_echo=nexus123");
    expect(await res.text()).toBe("nexus123");
  });

  test("webhook do Resend sem conta é recusado, nunca 200 calado", async ({ request }) => {
    const res = await request.post("/api/public/resend", { data: {} });
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  test("descadastro com link inválido não descadastra", async ({ request }) => {
    const res = await request.post("/api/public/email/unsubscribe", { form: { t: "invalido" } });
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  test("widget do site é servido como JavaScript", async ({ request }) => {
    const res = await request.get("/api/public/widget.js");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("javascript");
  });

  test("formulário público valida o formulário", async ({ request }) => {
    const res = await request.post("/api/public/forms/submit", { data: {} });
    expect(res.status()).toBe(400);
  });
});

test.describe("páginas públicas", () => {
  test("login mostra o formulário de entrada @mobile", async ({ page }) => {
    await page.goto("/entrar");
    await expect(page.getByRole("heading", { name: "Entrar na sua conta" })).toBeVisible();
  });

  test("link de agendamento inexistente avisa", async ({ page }) => {
    await page.goto("/agendar/nao-existe-e2e");
    await expect(
      page.getByText(/não (encontrad|existe|está disponível)|indisponível/i).first(),
    ).toBeVisible();
  });

  test("formulário inexistente avisa", async ({ page }) => {
    await page.goto("/f/00000000-0000-0000-0000-000000000000");
    await expect(page.getByText("Este formulário não está disponível.")).toBeVisible();
  });

  test("proposta com token inválido não expõe dados", async ({ page }) => {
    await page.goto("/proposta/token-invalido-e2e");
    await expect(
      page.getByText(/não (encontrad|existe|está disponível)|inválid|expirad/i).first(),
    ).toBeVisible();
  });

  test("sala sem convite pede acesso", async ({ page }) => {
    await page.goto("/sala/00000000-0000-0000-0000-000000000000");
    await expect(page.locator("body")).not.toContainText("Application error");
  });
});
