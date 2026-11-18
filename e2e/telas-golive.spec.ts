// Capturas das telas do go-live (rodar à mão): E2E_TELAS=1 npx playwright test e2e/telas-golive.spec.ts
// Usa a conta demo mais recente da jornada (e2e/.demo-*.local.json, fora do git).
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const OUT = process.env["E2E_TELAS_OUT"] ?? "test-results/telas-golive";
test.skip(!process.env["E2E_TELAS"], "só à mão");

function ultimaDemo() {
  const dir = path.join(process.cwd(), "e2e");
  const f = fs
    .readdirSync(dir)
    .filter((n) => /^\.demo-.*\.local\.json$/.test(n))
    .map((n) => path.join(dir, n))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
  return JSON.parse(fs.readFileSync(f!, "utf8")) as { dona: { email: string; senha: string } };
}

test("telas novas do go-live", async ({ page }) => {
  test.setTimeout(180_000);
  const { dona } = ultimaDemo();
  await page.goto("/entrar");
  await page.getByLabel("E-mail", { exact: true }).fill(dona.email);
  await page.getByLabel("Senha", { exact: true }).fill(dona.senha);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL(/\/(painel|inicio|bem-vindo)/, { timeout: 30_000 });
  const telas: [string, string, RegExp][] = [
    ["/canais", "canais", /Agentes de IA respondem|Conectar/],
    ["/automacoes", "automacoes", /Instagram e Facebook/],
    ["/equipe-ia", "equipe-ia", /Quem atende cada canal/],
    ["/campanhas/whatsapp", "campanhas-whatsapp", /WhatsApp/],
  ];
  for (const [url, nome, prova] of telas) {
    await page.goto(url);
    await expect(page.getByText(prova).first()).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/${nome}.png`, fullPage: true });
  }
  // editor de campanha de e-mail com o "Escrever com IA"
  await page.goto("/campanhas");
  const nova = page.getByRole("button", { name: /Nova campanha|Criar campanha/ }).first();
  if (await nova.isVisible().catch(() => false)) {
    await nova.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/campanha-email.png`, fullPage: true });
  }
});

// Central "Tudo pela Zernio" nos três estados (sem chave, chave sem contas, com contas), com a
// resposta do servidor simulada: a conta demo não tem chave da Zernio.
test("central da Zernio nos três estados", async ({ page }) => {
  test.setTimeout(120_000);
  const { dona } = ultimaDemo();
  const estados = {
    "sem-chave": { ready: false, profile: false, accounts: [] },
    "sem-contas": { ready: true, profile: true, accounts: [] },
    "com-contas": {
      ready: true,
      profile: true,
      accounts: [
        { id: "1", platform: "whatsapp", name: "+55 11 98888-0000", active: true },
        { id: "2", platform: "instagram", name: "@clinicasorriso", active: true },
        { id: "3", platform: "facebook", name: "Clínica Sorriso", active: false },
        { id: "4", platform: "metaads", name: "Conta de anúncios Sorriso", active: true },
        { id: "5", platform: "googleads", name: "Google Ads 123-456-7890", active: true },
      ],
    },
  };
  let atual: keyof typeof estados = "sem-chave";
  await page.route("**/api/zernio", async (route) => {
    const body = route.request().postDataJSON() as { action?: string };
    if (body.action === "hub") return route.fulfill({ json: estados[atual] });
    return route.continue();
  });
  await page.goto("/entrar");
  await page.getByLabel("E-mail", { exact: true }).fill(dona.email);
  await page.getByLabel("Senha", { exact: true }).fill(dona.senha);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL(/\/(painel|inicio|bem-vindo)/, { timeout: 30_000 });
  for (const nome of Object.keys(estados) as (keyof typeof estados)[]) {
    atual = nome;
    await page.goto("/canais");
    const hub = page.locator("section[aria-labelledby='zernio-hub-title']");
    await expect(hub).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(1200);
    await hub.evaluate((el) => el.scrollIntoView({ block: "start" }));
    await page.screenshot({ path: `${OUT}/zernio-${nome}-topo.png` });
    await hub.screenshot({ path: `${OUT}/zernio-${nome}.png` });
  }
});
