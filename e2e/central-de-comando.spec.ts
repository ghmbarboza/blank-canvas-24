import { expect, test, type Page } from "@playwright/test";

// Central de comando (#62, #64, #65) na conta de TESTE. Precisa de E2E_EMAIL, E2E_PASSWORD e
// E2E_WEBCHAT_CHANNEL; a fila "Financeiro (teste E2E)" existe na conta de teste.
// O teste de fora do horário só roda com E2E_AWAY=1 (a conta precisa estar "sempre fechada").
const email = process.env["E2E_EMAIL"];
const password = process.env["E2E_PASSWORD"];
const channel = process.env["E2E_WEBCHAT_CHANNEL"];

test.skip(!email || !password || !channel, "Defina E2E_EMAIL, E2E_PASSWORD e E2E_WEBCHAT_CHANNEL");

async function login(page: Page) {
  await page.goto("/entrar");
  await page.getByLabel("E-mail").fill(email!);
  await page.getByLabel("Senha").fill(password!);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/painel/);
  const nexa = page.getByRole("dialog", { name: "Configurar com a Nexa" });
  if (await nexa.isVisible().catch(() => false))
    await nexa.getByRole("button", { name: "Fechar", exact: true }).click();
}

async function visitorWrites(
  request: import("@playwright/test").APIRequestContext,
  name: string,
  text: string,
) {
  const start = await request.post("/api/public/webchat", {
    data: { action: "start", channelId: channel, name },
  });
  expect(start.ok(), await start.text()).toBe(true);
  const { token } = (await start.json()) as { token: string };
  const sent = await request.post("/api/public/webchat", { data: { action: "send", token, text } });
  expect(sent.ok(), await sent.text()).toBe(true);
  return token;
}

test("etiqueta, visão salva e transferência para fila pela Caixa", async ({ page, request }) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const visitor = `Central E2E ${Date.now().toString(36)}`;
  await visitorWrites(request, visitor, "Preciso da segunda via do boleto.");

  await login(page);
  await page.goto("/inbox");
  await page
    .getByRole("link", { name: new RegExp(visitor) })
    .first()
    .click({ timeout: 30_000 });

  // etiqueta
  const tagTag = `boleto-${Date.now().toString(36)}`;
  await page.getByLabel("Nova etiqueta").first().fill(tagTag);
  await page.getByLabel("Nova etiqueta").first().press("Enter");
  await expect(page.getByRole("list", { name: "Etiquetas da conversa" }).first()).toContainText(
    tagTag,
  );

  // filtro pela etiqueta e visão salva
  await page.getByRole("button", { name: `Só a etiqueta ${tagTag}` }).click();
  await expect(page.getByRole("link", { name: new RegExp(visitor) }).first()).toBeVisible();
  await page.getByRole("button", { name: "Visões salvas" }).click();
  await page.getByRole("menuitem", { name: /Salvar os filtros de agora/ }).click();
  await page.getByLabel("Nome").fill(`Visão ${tagTag}`);
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await page.getByRole("button", { name: `Só a etiqueta ${tagTag}` }).click(); // tira o filtro
  await page.getByRole("button", { name: "Visões salvas" }).click();
  await page.getByRole("menuitem", { name: new RegExp(`Visão ${tagTag}`) }).click();
  await expect(page.getByRole("button", { name: `Só a etiqueta ${tagTag}` })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  // limpa a visão de teste
  await page.getByRole("button", { name: "Visões salvas" }).click();
  await page.getByRole("button", { name: `Apagar a visão Visão ${tagTag}` }).click();
  await page.keyboard.press("Escape");

  // transferência
  // coluna estreita: a ação fica no menu "Mais ações"
  const direct = page.getByRole("button", { name: "Transferir para uma fila" });
  if (await direct.isVisible().catch(() => false)) await direct.click();
  else {
    await page.getByRole("button", { name: "Mais ações" }).click();
    await page.getByRole("menuitem", { name: "Transferir para uma fila" }).click();
  }
  const dialog = page.getByRole("dialog", { name: "Transferir para uma fila" });
  await dialog.getByLabel("Fila").click();
  await page.getByRole("option", { name: "Financeiro (teste E2E)" }).click();
  await dialog.getByLabel("Motivo (opcional)").fill("Cliente quer a 2ª via do boleto");
  await dialog.getByRole("button", { name: "Transferir" }).click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });
  await expect(
    page
      .getByText(/transferiu para a fila Financeiro \(teste E2E\)\. Motivo: Cliente quer a 2ª via/)
      .first(),
  ).toBeVisible({ timeout: 20_000 });
  expect(errors).toEqual([]);
});

test("fora do horário o cliente recebe a resposta automática uma vez", async ({ request }) => {
  test.skip(
    process.env["E2E_AWAY"] !== "1",
    "Ligue E2E_AWAY=1 com a conta de teste sempre fechada",
  );
  test.setTimeout(180_000);
  const token = await visitorWrites(request, `Fora E2E ${Date.now().toString(36)}`, "Alguém aí?");
  await expect
    .poll(
      async () => {
        const r = await request.post("/api/public/webchat", { data: { action: "poll", token } });
        const { messages } = (await r.json()) as { messages: { text?: string; body?: string }[] };
        return messages.filter((m) => (m.text ?? m.body ?? "").includes("fora do horário")).length;
      },
      { timeout: 150_000, intervals: [10_000] },
    )
    .toBe(1);
});

// SMS pela Zadarma: aviso de SMS recebido que não vem da Zadarma (IP e assinatura) não entra.
test("SMS da Zadarma: aviso de fora da Zadarma é recusado", async ({ request }) => {
  const accountId = process.env["E2E_ACCOUNT_ID"];
  test.skip(!accountId, "Defina E2E_ACCOUNT_ID");
  const result = JSON.stringify({
    caller_id: "+5548900000001",
    caller_did: "+554830000000",
    text: "Oi, chegou pelo SMS",
  });
  const r = await request.post(`/api/public/zadarma?a=${accountId}`, {
    data: new URLSearchParams({ event: "SMS", result }).toString(),
    headers: { "content-type": "application/x-www-form-urlencoded", signature: "forjada" },
  });
  expect([401, 403]).toContain(r.status());
});

// CSAT ao resolver (#68): só com E2E_CSAT=1 e a conta de teste com a pesquisa ligada.
test("ao resolver a conversa, o cliente recebe a pesquisa de satisfação", async ({
  page,
  request,
}) => {
  test.skip(
    process.env["E2E_CSAT"] !== "1",
    "Ligue E2E_CSAT=1 com csat_on_close na conta de teste",
  );
  test.setTimeout(240_000);
  const visitor = `CSAT E2E ${Date.now().toString(36)}`;
  const token = await visitorWrites(request, visitor, "Pode fechar, obrigado!");
  await login(page);
  await page.goto("/inbox");
  await page
    .getByRole("link", { name: new RegExp(visitor) })
    .first()
    .click({ timeout: 30_000 });
  await page.getByRole("button", { name: /^Resolver$/ }).click();
  await expect
    .poll(
      async () => {
        const r = await request.post("/api/public/webchat", { data: { action: "poll", token } });
        const { messages } = (await r.json()) as { messages: { text?: string; body?: string }[] };
        return messages.some((m) => (m.text ?? m.body ?? "").includes("/csat/"));
      },
      { timeout: 180_000, intervals: [10_000] },
    )
    .toBe(true);
});
