import { expect, test, type Page } from "@playwright/test";

// Assistente de configuração: o dono de uma conta nova vê o assistente abrir sozinho, anda pelos
// passos e o progresso persiste. Usa a conta de teste (E2E_EMAIL / E2E_PASSWORD), nunca a real.
const email = process.env["E2E_EMAIL"];
const password = process.env["E2E_PASSWORD"];

test.skip(!email || !password, "Defina E2E_EMAIL e E2E_PASSWORD da conta de teste");

async function login(page: Page) {
  await page.goto("/entrar");
  await page.getByLabel("E-mail").fill(email!);
  await page.getByLabel("Senha").fill(password!);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/(painel|bem-vindo)/);
  if (page.url().includes("/bem-vindo")) {
    await page.getByLabel("Nome da empresa").fill("Clínica Teste E2E");
    await page.getByRole("button", { name: /Criar minha central/ }).click();
    await page.waitForURL(/\/painel/);
  }
}

test("onboarding único: o indicador do menu abre a Nexa e não sobra assistente em passos", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page);
  const nexa = page.getByRole("dialog", { name: "Configurar com a Nexa" });
  // se faltar obrigatório ela abre sozinha; fecha para testar o indicador
  if (await nexa.isVisible().catch(() => false))
    await nexa.getByRole("button", { name: "Fechar", exact: true }).click();
  const entry = page
    .getByRole("button", { name: /configurar com a Nexa|Falar com a Nexa/ })
    .first();
  await expect(entry).toBeVisible();
  await entry.click();
  await expect(nexa).toBeVisible();
  await expect(page.getByRole("button", { name: "Passo a passo" })).toHaveCount(0);
  // a aba Progresso lê o mesmo roteiro (obrigatórios e opcionais)
  await nexa.getByRole("button", { name: /O que a Nexa já sabe/ }).click();
  const memory = nexa.getByRole("complementary", { name: "O que a Nexa já sabe" });
  await memory.getByRole("tab", { name: /Progresso/ }).click();
  await expect(memory.getByText(/obrigatórios prontos/)).toBeVisible();
  await expect(memory.getByText("Canal de atendimento")).toBeVisible();
  expect(errors).toEqual([]);
});

test("cada chave tem roteiro em Ajustes › Integrações: Resend mostra onde pegar e o webhook", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page);
  await page.goto("/ajustes?aba=integracoes");
  const nexa = page.getByRole("dialog", { name: "Configurar com a Nexa" });
  if (await nexa.isVisible().catch(() => false))
    await nexa.getByRole("button", { name: "Fechar", exact: true }).click();
  await page
    .getByRole("button", { name: /Resend$/ })
    .first()
    .click();
  await expect(page.getByRole("link", { name: /Abrir o Resend/ })).toBeVisible();
  await expect(page.getByText(/Create API Key/)).toBeVisible();
  await expect(page.getByText(/\/api\/public\/resend\?a=[0-9a-f-]{36}/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Salvar e testar" }).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("Nexa em modal: conversa com caixa de texto, sugestões e o que já sei", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page);
  await page.goto("/configurar");
  await expect(page).toHaveURL(/\/painel/);
  const nexa = page.getByRole("dialog", { name: "Configurar com a Nexa" });
  await expect(nexa).toBeVisible();
  const box = nexa.getByLabel("Mensagem para a Nexa");
  await expect(box).toBeVisible();
  await expect(
    nexa.getByRole("button", { name: "Enviar documento para a biblioteca" }),
  ).toBeVisible();
  // a sugestão de começo de frase cai na caixa para a pessoa completar
  const starter = nexa.getByRole("button", { name: "Ler o nosso site" });
  if (await starter.isVisible()) {
    await starter.click();
    await expect(box).toHaveValue("Nosso site é ");
    await box.fill("");
  }
  await nexa.getByRole("button", { name: /O que a Nexa já sabe/ }).click();
  const memory = nexa.getByRole("complementary", { name: "O que a Nexa já sabe" });
  await expect(memory.getByText("Alma do Nexus")).toBeVisible();
  for (const tab of ["O que já sei", "Biblioteca", "Pedidos", "Progresso"])
    await expect(memory.getByRole("tab", { name: new RegExp(tab) })).toBeVisible();
  await memory.getByRole("button", { name: "Fechar o que já sei" }).click();
  await nexa.getByRole("button", { name: "Fechar", exact: true }).click();
  await expect(nexa).toBeHidden();
  // a porta do menu lateral reabre o mesmo modal
  await page
    .getByRole("button", { name: /com a Nexa/ })
    .first()
    .click();
  await expect(nexa).toBeVisible();
  expect(errors).toEqual([]);
});
