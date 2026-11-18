import { expect, test, type Page } from "@playwright/test";

// A 1ª vitória de ponta a ponta (parecer estratégico de 02/11): um visitante escreve pelo chat do
// site, a mensagem chega na Caixa de entrada, a pessoa responde e cria o negócio na conversa.
// Usa a conta de TESTE (E2E_EMAIL / E2E_PASSWORD) e o chat do site dela (E2E_WEBCHAT_CHANNEL).
const email = process.env["E2E_EMAIL"];
const password = process.env["E2E_PASSWORD"];
const channel = process.env["E2E_WEBCHAT_CHANNEL"];

test.skip(
  !email || !password || !channel,
  "Defina E2E_EMAIL, E2E_PASSWORD e E2E_WEBCHAT_CHANNEL da conta de teste",
);

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

test("visitante escreve no chat do site → resposta pela Caixa → negócio criado", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const visitor = `Vitória E2E ${Date.now().toString(36)}`;

  // 1. o visitante abre o chat e escreve (a mesma API que o widget do site usa)
  const start = await request.post("/api/public/webchat", {
    data: { action: "start", channelId: channel, name: visitor },
  });
  expect(start.ok(), await start.text()).toBe(true);
  const { token } = (await start.json()) as { token: string };
  const sent = await request.post("/api/public/webchat", {
    data: { action: "send", token, text: "Oi! Quero saber o preço da consulta." },
  });
  expect(sent.ok(), await sent.text()).toBe(true);

  // 2. a conversa aparece na Caixa de entrada e a pessoa responde
  await login(page);
  await page.goto("/inbox");
  const item = page.getByRole("link", { name: new RegExp(visitor) }).first();
  await expect(item).toBeVisible({ timeout: 30_000 });
  await item.click();
  await expect(page.getByText("Oi! Quero saber o preço da consulta.").first()).toBeVisible();
  // com agente de IA ligado, a pessoa assume a conversa antes de responder
  const takeOver = page.getByRole("button", { name: /^Assumir/ }).first();
  if (await takeOver.isVisible().catch(() => false)) await takeOver.click();
  await page
    .getByLabel("Resposta", { exact: true })
    .fill("Olá! A consulta custa R$ 250. Posso agendar?");
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(page.getByText("Olá! A consulta custa R$ 250").first()).toBeVisible({
    timeout: 20_000,
  });

  // o visitante recebe a resposta no chat
  await expect
    .poll(
      async () => {
        const r = await request.post("/api/public/webchat", { data: { action: "poll", token } });
        const { messages } = (await r.json()) as { messages: { text?: string; body?: string }[] };
        return messages.some((m) => (m.text ?? m.body ?? "").includes("R$ 250"));
      },
      { timeout: 30_000 },
    )
    .toBe(true);

  // 3. negócio criado a partir da conversa
  await page
    .getByRole("button", { name: /Criar negócio/ })
    .first()
    .click();
  const dialog = page.getByRole("dialog", { name: "Criar negócio" });
  await dialog.getByLabel("Valor (R$)").fill("250,00");
  await dialog.getByRole("button", { name: "Criar negócio" }).click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });

  await page.goto("/crm");
  await expect(page.getByText(visitor).first()).toBeVisible({ timeout: 20_000 });
  expect(errors).toEqual([]);
});
