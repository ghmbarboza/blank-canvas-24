import { expect, test, type Page } from "@playwright/test";

// Telas logadas: uma conta de TESTE (E2E_EMAIL / E2E_PASSWORD) ou uma sessão já aberta, salva com
// `context.storageState()` (E2E_STORAGE_STATE). Sem nenhuma das duas, pula.
const email = process.env["E2E_EMAIL"];
const password = process.env["E2E_PASSWORD"];
const storageState = process.env["E2E_STORAGE_STATE"];

test.skip(
  !storageState && (!email || !password),
  "Defina E2E_STORAGE_STATE ou E2E_EMAIL e E2E_PASSWORD de uma conta de teste",
);
if (storageState) test.use({ storageState });

const ROUTES: [string, RegExp][] = [
  ["/painel", /Painel|Bom dia|Boa tarde|Boa noite/],
  // Meu dia é recurso extra: desligado na conta mostra o estado "Recurso desligado"
  ["/meu-dia", /Bom dia|Boa tarde|Boa noite|Recurso desligado/],
  ["/inbox", /Caixa de entrada|conversa/i],
  ["/agenda", /Hoje/], // o h1 da agenda é o período exibido, não o nome da tela
  ["/reunioes", /Reuniões/],
  ["/ligacoes", /Ligações/],
  ["/ligacoes/discador", /Discador/],
  ["/atendimento", /Chamados|Atendimento/],
  ["/crm", /Carteira/],
  ["/contatos", /Clientes/],
  ["/empresas", /Empresas/],
  ["/agendamentos", /agendamento/i],
  ["/campanhas", /Campanhas/],
  ["/automacoes", /Automações/],
  ["/formularios", /Captação/],
  ["/relatorios", /Relatórios/],
  ["/metas", /Metas/],
  ["/treino", /Treino/],
  ["/biblioteca", /Biblioteca/],
  ["/canais", /Canais/],
  ["/ajustes", /Ajustes/],
  ["/fila", /Minha fila/],
  ["/fila/roteamento", /Fila e roteamento/],
  ["/fila/painel", /ao vivo|Painel/i],
  ["/qualidade", /Qualidade/],
  ["/incidentes", /Incidentes/],
  ["/sdr", /Pontuação e rodízio/],
  ["/gestao", /Gestão|pessoas/i],
  ["/equipe-ia", /Equipe de IA/],
  ["/equipe-ia/ferramentas", /Ferramentas conectadas/],
  ["/pergunte", /Pergunte ao Nexus/],
];

async function login(page: Page) {
  if (storageState) {
    await page.goto("/painel");
    await page.waitForURL(/\/painel/);
    return;
  }
  await page.goto("/entrar");
  await page.getByLabel("E-mail").fill(email!);
  await page.getByLabel("Senha").fill(password!);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/painel/);
}

test("todas as telas do menu abrem sem erro", async ({ page }) => {
  test.setTimeout(ROUTES.length * 15_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page);
  for (const [path, title] of ROUTES) {
    await page.goto(path);
    await expect(page.locator("main")).toContainText(title, { timeout: 20_000 });
  }
  expect(errors, errors.join("\n")).toEqual([]);
});

test("todas as seções de Ajustes abrem", async ({ page }) => {
  await login(page);
  await page.goto("/ajustes");
  const nav = page.getByRole("navigation", { name: "Seções de ajustes" });
  const buttons = nav.getByRole("button");
  await expect(buttons.first()).toBeVisible();
  const total = await buttons.count();
  expect(total).toBeGreaterThanOrEqual(17);
  for (let i = 0; i < total; i++) {
    await buttons.nth(i).click();
    await expect(page.locator("main")).not.toContainText(/Algo deu errado|Erro interno/);
  }
});

test("menu do gestor: central em cima, extras desligados, configuração no rodapé", async ({
  page,
}) => {
  await login(page);
  await page.mouse.click(5, 5);
  const nav = page.getByRole("navigation", { name: "Navegação principal" });
  // O contrato é a navegação visível; a classe do design system pode mudar.
  for (const label of ["Início", "Atender", "Vender", "Resultados", "Equipe"])
    await expect(nav.getByText(label, { exact: true })).toBeVisible();
  const labels = await nav
    .getByText(/^(Início|Atender|Vender|Resultados|Equipe)$/)
    .allTextContents();
  expect(labels.map((l) => l.trim().toLowerCase())).toEqual([
    "início",
    "atender",
    "vender",
    "resultados",
    "equipe",
  ]);
  // o que não é central fica fora até ser ligado
  await expect(nav.getByRole("link", { name: "Campanhas de e-mail" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Origem dos leads" })).toBeVisible();
  const config = nav.getByRole("button", { name: "Configuração" });
  await expect(nav.getByRole("link", { name: "Canais" })).toHaveCount(0);
  await config.click();
  await expect(config).toHaveAttribute("aria-expanded", "true");
  await nav.getByRole("link", { name: "Canais" }).click();
  await expect(page).toHaveURL(/\/canais/);
  // numa tela de configuração o grupo já vem aberto, mostrando onde a pessoa está
  await page.goto("/sdr");
  await expect(nav.getByRole("link", { name: "Pontuação e rodízio" })).toBeVisible();
  // devolve o estado padrão para não afetar a próxima rodada
  await page.goto("/painel");
  if ((await config.getAttribute("aria-expanded")) === "true") await config.click();
});

test("recurso extra liga e desliga pelo Ajustes e aparece no menu", async ({ page }) => {
  await login(page);
  await page.mouse.click(5, 5);
  const nav = page.getByRole("navigation", { name: "Navegação principal" });
  await page.goto("/ajustes?aba=recursos");
  const toggle = page.getByRole("switch", { name: "Campanhas de e-mail" });
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute("aria-checked")) === "true") {
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "false");
  }
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await expect(nav.getByRole("link", { name: "Campanhas de e-mail" })).toBeVisible();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect(nav.getByRole("link", { name: "Campanhas de e-mail" })).toHaveCount(0);
});
