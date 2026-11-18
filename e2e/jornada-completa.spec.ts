import { existsSync, readFileSync, writeFileSync } from "node:fs";
import {
  expect,
  test,
  type APIRequestContext,
  type Browser,
  type Locator,
  type Page,
} from "@playwright/test";

/**
 * Jornada completa de uma central NOVA, sem nenhuma chave de terceiros (smoke de produto).
 *
 * Cenário: "Clínica Sorriso Demo" — a dona cria a conta, configura com a Nexa (IA embutida da
 * plataforma, sem chave), liga os recursos, abre o chat do site, atende um visitante, vende,
 * agenda, capta por formulário, abre chamado, automatiza, cria agente de IA, convida uma
 * atendente e confere os resultados. Cada etapa confere o efeito visível E o que a pessoa
 * do outro lado recebe (visitante do chat, formulário público, convidada).
 *
 * Roda só com E2E_JORNADA=1: cria uma conta nova no banco alvo. Num banco que já tem conta, o
 * cadastro aberto exige platform_settings.multi_account = true durante a execução (cada remix
 * é de um cliente só; roteiro da jornada fica fora do repo, no material interno do time).
 * As credenciais da conta demo são geradas aqui e gravadas só em e2e/.demo.local.json (ignorado).
 */
test.skip(!process.env["E2E_JORNADA"], "Defina E2E_JORNADA=1 (cria uma conta demo nova)");
// Ordem garantida por 1 worker; cada etapa roda mesmo se a anterior falhar (o relatório mostra
// a jornada inteira). A identidade vem de E2E_RUN para sobreviver ao reinício do worker.
test.describe.configure({ retries: 0 });
test.beforeEach(() => test.setTimeout(120_000));

const RUN = process.env["E2E_RUN"] ?? Date.now().toString(36);
const ARQUIVO = `e2e/.demo-${RUN}.local.json`;
const EMPRESA = `Clínica Sorriso Demo ${RUN}`;
const DONA = { nome: "Ana Demo", email: `ana.demo+${RUN}@nexus-demo.com.br`, senha: senha("dona") };
const ATENDENTE = {
  nome: "Bruno Atendente",
  email: `bruno.demo+${RUN}@nexus-demo.com.br`,
  senha: senha("atendente"),
};
const VISITANTE = `Mariana Visitante ${RUN}`;

type Estado = { canalChat?: string; formId?: string; slugAgenda?: string; linkConvite?: string };
const estado: Estado = existsSync(ARQUIVO)
  ? ((JSON.parse(readFileSync(ARQUIVO, "utf8")) as { estado?: Estado }).estado ?? {})
  : {};

/** Senha de TESTE derivada do RUN (a conta demo só existe para esta execução). */
function senha(papel: string): string {
  return `Demo-${papel}-${RUN}-Nx!`;
}

function salvar() {
  writeFileSync(
    ARQUIVO,
    JSON.stringify({ empresa: EMPRESA, dona: DONA, atendente: ATENDENTE, estado }, null, 2),
  );
}

let page: Page;
const errosDePagina: string[] = [];

test.beforeAll(async ({ browser }) => {
  page = await (await browser.newContext()).newPage();
  page.on("pageerror", (e) => errosDePagina.push(`${page.url()} :: ${e.message}`));
});

test.afterEach(() => salvar());
test.afterAll(async () => {
  await page?.close();
});

/** Depois de um reinício do worker a aba é nova: entra de novo com a dona. */
async function garantirSessao() {
  if (page.url().startsWith("http") && !page.url().includes("/entrar")) return;
  await page.goto("/painel");
  const entrar = page.getByRole("heading", { name: "Entrar na sua conta." });
  await expect(
    entrar.or(page.getByRole("navigation", { name: "Navegação principal" })),
  ).toBeVisible({
    timeout: 30_000,
  });
  if (!(await entrar.isVisible())) return;
  await page.getByLabel("E-mail", { exact: true }).fill(DONA.email);
  await page.getByLabel("Senha", { exact: true }).fill(DONA.senha);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL(/\/painel/, { timeout: 30_000 });
}

// ───────────────────────── utilidades ─────────────────────────

async function fecharNexa() {
  const nexa = page.getByRole("dialog", { name: "Configurar com a Nexa" });
  if (await nexa.isVisible().catch(() => false))
    await nexa.getByRole("button", { name: "Fechar", exact: true }).click();
  await expect(nexa).toBeHidden();
}

/** Abre a rota e garante que a tela carregou (sem a tela de erro e sem 404). */
async function abrir(path: string, titulo?: string | RegExp) {
  await garantirSessao();
  await page.goto(path);
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await fecharNexa();
  await expect(page.getByRole("heading", { name: "Esta tela não carregou" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Página não encontrada" })).toHaveCount(0);
  if (titulo) await expect(page.getByRole("heading", { name: titulo }).first()).toBeVisible();
}

async function toast(texto: string | RegExp) {
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: texto }).first()).toBeVisible({
    timeout: 20_000,
  });
}

function dialogo(nome: string | RegExp): Locator {
  return page.getByRole("dialog", { name: nome });
}

async function visitante(request: APIRequestContext, nome: string, texto: string) {
  const start = await request.post("/api/public/webchat", {
    data: {
      action: "start",
      channelId: estado.canalChat,
      name: nome,
      email: `${RUN}@visitante.com.br`,
    },
  });
  expect(start.ok(), await start.text()).toBe(true);
  const { token } = (await start.json()) as { token: string };
  const sent = await request.post("/api/public/webchat", {
    data: { action: "send", token, text: texto },
  });
  expect(sent.ok(), await sent.text()).toBe(true);
  return token;
}

async function mensagensDoVisitante(request: APIRequestContext, token: string) {
  const r = await request.post("/api/public/webchat", { data: { action: "poll", token } });
  expect(r.ok()).toBe(true);
  return ((await r.json()) as { messages: { from: string; body: string }[] }).messages;
}

// ───────────────────────── 1. entrada ─────────────────────────

test("01 · cadastro da dona: cria a conta e a central, cai no Painel", async () => {
  await page.goto("/entrar");
  await expect(page.getByRole("heading", { name: "Entrar na sua conta." })).toBeVisible();
  await page.getByRole("button", { name: "Criar agora" }).click();
  await expect(page.getByRole("heading", { name: "Criar sua conta." })).toBeVisible();
  await page.getByLabel("Seu nome").fill(DONA.nome);
  await page.getByLabel("E-mail", { exact: true }).fill(DONA.email);
  await page.getByLabel("Senha", { exact: true }).fill(DONA.senha);
  await page.getByRole("button", { name: "Criar conta", exact: true }).click();

  // confirmação de e-mail desligada: a sessão volta na hora. Num banco com conta, cai em
  // /bem-vindo para nomear a central; num banco vazio, vira dona direto.
  const bemVindo = page.getByRole("heading", { name: "Vamos montar sua central" });
  const painel = page.getByRole("heading", { name: /(Bom dia|Boa tarde|Boa noite), Ana/ });
  await expect(bemVindo.or(painel)).toBeVisible({ timeout: 30_000 });
  if (await bemVindo.isVisible()) {
    await page.getByLabel("Nome da empresa").fill(EMPRESA);
    await page.getByRole("button", { name: /Criar minha central/ }).click();
    await toast("Central criada");
  }
  await expect(painel).toBeVisible({ timeout: 30_000 });
  salvar();
});

test("02 · 1º acesso: a Nexa abre sozinha e responde pela IA embutida (sem chave)", async () => {
  test.setTimeout(180_000);
  await garantirSessao();
  const nexa = page.getByRole("dialog", { name: "Configurar com a Nexa" });
  await expect(nexa).toBeVisible({ timeout: 30_000 });
  await expect(nexa.getByText(/Eu sou a Nexa/).first()).toBeVisible({ timeout: 30_000 });
  await expect(nexa.getByText(/qual é o ramo/i).first()).toBeVisible();

  // passo 1: ramo pelo botão e nome pela conversa
  await nexa
    .getByRole("radio", { name: /Clínica e saúde/ })
    .first()
    .click();
  await expect(nexa.getByText("Escolhi: Clínica e saúde").first()).toBeVisible();
  const caixa = nexa.getByLabel("Mensagem para a Nexa");
  await expect(caixa).toBeEnabled({ timeout: 90_000 });
  await expect(nexa.getByText("Não consegui responder agora.")).toHaveCount(0);

  await caixa.fill(`A empresa se chama ${EMPRESA}. Somos uma clínica odontológica.`);
  await nexa.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(caixa).toBeEnabled({ timeout: 90_000 });
  await expect(nexa.getByText("Não consegui responder agora.")).toHaveCount(0);

  // o roteiro avança pelo banco: o passo "Empresa e ramo" sai da lista de pendências
  await nexa.getByRole("button", { name: /O que a Nexa já sabe/ }).click();
  const memoria = nexa.getByRole("complementary", { name: "O que a Nexa já sabe" });
  await memoria.getByRole("tab", { name: /Progresso/ }).click();
  await expect(memoria.getByText(/obrigatórios prontos/)).toBeVisible();
  await expect(memoria.getByText(/1 de 2 obrigatórios prontos|1\/2/)).toBeVisible({
    timeout: 30_000,
  });
  await memoria.getByRole("button", { name: "Fechar o que já sei" }).click();
  await fecharNexa();
});

test("03 · Painel vazio mostra exemplo fictício e caminho para conectar", async () => {
  await abrir("/painel");
  await expect(
    page.getByRole("heading", { name: /(Bom dia|Boa tarde|Boa noite), Ana/ }),
  ).toBeVisible();
  await expect(page.getByText("Você está vendo um exemplo com dados fictícios.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Conectar canais" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Faltam? \d configuraç/ }).first()).toBeVisible();
});

test("04 · Ajustes › Recursos extras: liga todos os módulos e eles aparecem no menu", async () => {
  await abrir("/ajustes?aba=recursos");
  for (const nome of [
    "Empresas",
    "Automações",
    "Campanhas de e-mail",
    "Metas e comissão",
    "Treino",
    "Biblioteca",
    "Pergunte ao Nexus",
    "Gestão",
    "Incidentes",
    "Meu dia",
  ]) {
    const sw = page.getByRole("switch", { name: nome, exact: true });
    if ((await sw.getAttribute("aria-checked")) !== "true") {
      await sw.click();
      await toast(`${nome} aparece no menu`);
    }
    await expect(sw).toHaveAttribute("aria-checked", "true");
  }
  const menu = page.getByRole("navigation").first();
  await expect(menu.getByRole("link", { name: /Automações/ })).toBeVisible();
  await expect(menu.getByRole("link", { name: /Meu dia/ })).toBeVisible();
});

test("05 · Captação › Chat do site: cria o canal sem chave e o roteiro marca o canal", async () => {
  await abrir("/formularios", "Captação");
  await page.getByRole("tab", { name: "Chat do site" }).click();
  await page.getByLabel("Saudação").fill("Oi! Sou da Clínica Sorriso. Como posso ajudar?");
  await page.getByRole("button", { name: "Criar chat do site" }).click();
  await toast("Chat criado: cole o código no seu site");
  const codigo = await page.locator("pre").filter({ hasText: "data-chat" }).first().innerText();
  estado.canalChat = /data-chat="([0-9a-f-]{36})"/.exec(codigo)?.[1];
  expect(estado.canalChat, "id do canal no código de instalação").toBeTruthy();

  // o widget público lê a configuração do canal
  const cfg = await page.request.get(`/api/public/webchat?channel=${estado.canalChat}`);
  expect(cfg.ok()).toBe(true);
  expect(((await cfg.json()) as { greeting: string }).greeting).toContain("Clínica Sorriso");
});

// ───────────────────────── 2. atender ─────────────────────────

test("06 · Caixa: visitante escreve, a dona responde, nota interna não vaza, negócio e resolução", async ({
  request,
}) => {
  test.setTimeout(150_000);
  const token = await visitante(
    request,
    VISITANTE,
    "Olá! Quanto custa uma limpeza? Atendem sábado?",
  );

  await abrir("/inbox", "Caixa de entrada");
  const item = page.getByRole("link", { name: new RegExp(VISITANTE) }).first();
  await expect(item).toBeVisible({ timeout: 30_000 });
  await item.click();
  await expect(
    page.getByText("Olá! Quanto custa uma limpeza? Atendem sábado?").first(),
  ).toBeVisible();

  // resposta chega ao visitante
  await page
    .getByRole("textbox", { name: "Resposta" })
    .fill("Oi, Mariana! A limpeza custa R$ 180 e atendemos sábado até 13h.");
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(page.getByText("A limpeza custa R$ 180").first()).toBeVisible({ timeout: 20_000 });
  await expect
    .poll(
      async () =>
        (await mensagensDoVisitante(request, token)).some(
          (m) => m.from === "agent" && m.body.includes("R$ 180"),
        ),
      {
        timeout: 30_000,
      },
    )
    .toBe(true);

  // nota interna fica só na equipe
  await page.getByRole("radio", { name: "Nota interna" }).click();
  await page
    .getByRole("textbox", { name: "Nota interna" })
    .fill("Paciente sensível a preço, oferecer pacote.");
  await page.getByRole("button", { name: "Salvar nota" }).click();
  await expect(page.getByText("Paciente sensível a preço").first()).toBeVisible({
    timeout: 20_000,
  });
  const doVisitante = await mensagensDoVisitante(request, token);
  expect(doVisitante.some((m) => m.body.includes("sensível a preço"))).toBe(false);
  await page.getByRole("radio", { name: "Resposta" }).click();

  // o visitante responde de novo e a conversa recebe em tempo real
  await request.post("/api/public/webchat", {
    data: { action: "send", token, text: "Perfeito, quero agendar." },
  });
  await expect(page.getByText("Perfeito, quero agendar.").first()).toBeVisible({ timeout: 30_000 });

  // negócio a partir da conversa
  await page
    .getByRole("button", { name: /Colocar na carteira/ })
    .first()
    .click();
  const d = dialogo("Colocar na carteira");
  await d.getByLabel("Valor do contrato (R$)").fill("180,00");
  await d.getByRole("button", { name: "Colocar na carteira" }).click();
  await toast("Cliente colocado na carteira");

  // resolver
  const resolver = page.getByRole("button", { name: "Resolver", exact: true });
  if (await resolver.isVisible().catch(() => false)) await resolver.click();
  else {
    await page.getByRole("button", { name: "Mais ações" }).first().click();
    await page.getByRole("menuitem", { name: /Resolver/ }).click();
  }
  await toast("Conversa resolvida");
});

test("07 · Chamados: abre chamado com prioridade e o prazo de SLA aparece", async () => {
  await abrir("/atendimento", "Chamados");
  await page
    .getByRole("button", { name: /Novo chamado|Abrir o primeiro chamado/ })
    .first()
    .click();
  const d = dialogo("Novo chamado");
  await d.getByLabel("Assunto").fill("Não consigo emitir a segunda via do boleto");
  await d.getByLabel("Detalhes").fill("Paciente pediu pelo chat; boleto de outubro.");
  await d.getByRole("combobox", { name: "Prioridade" }).click();
  await page.getByRole("option", { name: "Alta" }).click();
  await d.getByLabel("Categoria").fill("Financeiro");
  await d.getByRole("button", { name: "Abrir chamado" }).click();
  await toast("Chamado aberto");
  await expect(page.getByText("Não consigo emitir a segunda via do boleto").first()).toBeVisible();
  await expect(page.getByText(/1ª resposta em|solução em/).first()).toBeVisible();
});

// ───────────────────────── 3. vender ─────────────────────────

test("08 · Contatos: cria à mão (abre a ficha), consentimento LGPD e importação CSV", async () => {
  await abrir("/contatos", "Clientes");
  await page
    .getByRole("button", { name: /^Novo contato$|^Novo$/ })
    .first()
    .click();
  const d = dialogo("Novo contato");
  await d.getByLabel("Nome").fill("Carlos Demo");
  await d.getByLabel("Telefone").fill("11987654321");
  await d.getByLabel("E-mail").fill(`carlos+${RUN}@paciente-demo.com.br`);
  await d.getByLabel("Cidade").fill("São Paulo");
  await d.getByRole("button", { name: "Criar contato" }).click();
  await toast("Contato criado");

  // ao criar, o app abre a ficha completa do contato
  await expect(page.getByRole("heading", { name: "Carlos Demo", level: 1 })).toBeVisible();
  for (const aba of ["Linha do tempo", "Conversas", "Carteira", "Notas"])
    await expect(page.getByRole("tab", { name: aba, exact: true })).toBeVisible();
  const email = page.getByRole("switch", { name: "E-mail marketing" });
  await email.scrollIntoViewIfNeeded();
  // sem registro, o e-mail marketing parte de "interesse legítimo" (ligado); o clique registra a
  // escolha da pessoa. Liga até ficar "Autorizado (manual)".
  const status = page.getByRole("region", { name: "Privacidade" });
  await email.click();
  await expect(status.getByText(/(Autorizado|Revogado) \(manual\)/).first()).toBeVisible({
    timeout: 15_000,
  });
  if (await status.getByText("Revogado (manual)").first().isVisible()) await email.click();
  await expect(status.getByText("Autorizado (manual)").first()).toBeVisible({ timeout: 15_000 });

  // importação de planilha
  await abrir("/contatos", "Clientes");
  await page
    .getByRole("button", { name: /Importar (planilha|CSV)/ })
    .first()
    .click();
  const imp = dialogo("Importar contatos");
  const csv = [
    "nome,telefone,email,empresa,cargo,cidade,tags",
    `Joana Demo,11911112222,joana+${RUN}@paciente-demo.com.br,,,Campinas,ortodontia`,
    `Pedro Demo,11933334444,pedro+${RUN}@paciente-demo.com.br,,,Santos,implante|retorno`,
    `Lia Demo,11955556666,lia+${RUN}@paciente-demo.com.br,,,São Paulo,clareamento`,
  ].join("\n");
  await imp.locator("input[type=file]").setInputFiles({
    name: "pacientes.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await expect(imp.getByText("3 linhas prontas")).toBeVisible();
  await imp.getByRole("button", { name: /^Importar 3/ }).click();
  // espera o resultado real: toast de importados (conta nova) ou o relatório "já existiam"
  await expect(
    page
      .locator("[data-sonner-toast]")
      .filter({ hasText: /3 contatos importados/ })
      .or(imp.getByText(/já existiam/)),
  ).toBeVisible({ timeout: 30_000 });
  await imp.getByRole("button", { name: "Fechar" }).first().click();
  await abrir("/contatos");
  for (const nome of ["Joana Demo", "Pedro Demo", "Lia Demo"])
    await expect(page.getByText(nome).first()).toBeVisible();
});

test("09 · Funil: novo negócio, avança de etapa sem perder o valor e ganha o do chat", async () => {
  const titulo = `Clareamento · Carlos Demo ${Date.now().toString(36)}`;
  await abrir("/crm");
  await page
    .getByRole("button", { name: /^Novo( negócio)?$/ })
    .first()
    .click();
  const d = dialogo("Novo negócio");
  await d.getByLabel("Título").fill(titulo);
  await d.getByLabel("Valor (R$)").fill("1.200,00");
  await d
    .getByRole("button", { name: /Criar negócio|Criar/ })
    .last()
    .click();
  await toast("Negócio criado");

  // abre, muda para Proposta e o valor continua R$ 1.200 (regressão: "1.200" virava R$ 1)
  await moverNegocio(titulo, "Proposta");
  const proposta = page.getByRole("region", { name: /^Proposta/ });
  await expect(
    proposta.getByRole("button", { name: new RegExp(`^${titulo}, R\\$ 1\\.200\\.`) }),
  ).toBeVisible();

  // ganha o negócio que nasceu da conversa do visitante
  await moverNegocio(VISITANTE, "Ganho");
  const ganho = page.getByRole("region", { name: /^Ganho/ });
  const expandir = ganho.getByRole("button", { name: "Expandir Ganho" });
  if (await expandir.isVisible().catch(() => false)) await expandir.click();
  await expect(
    ganho.getByRole("button", { name: new RegExp(`^${VISITANTE}, R\\$ 180\\.`) }),
  ).toBeVisible();
});

async function moverNegocio(titulo: string, etapa: string) {
  const painel = dialogo(titulo);
  if (!(await painel.isVisible().catch(() => false))) {
    // colunas recolhidas (Ganho/Perdido) escondem os cartões
    const expandir = page.getByRole("button", { name: /^Expandir / });
    for (let i = 0; i < 6 && (await expandir.count()) > 0; i++) await expandir.first().click();
    await page
      .getByRole("button", { name: new RegExp(`^${titulo},`) })
      .first()
      .click();
  }
  await painel.getByRole("combobox", { name: "Etapa" }).click();
  await page.getByRole("option", { name: etapa, exact: true }).click();
  await painel.getByRole("button", { name: "Salvar alterações" }).click();
  await toast("Negócio salvo");
  await page.keyboard.press("Escape");
  await expect(painel).toBeHidden();
}

test("10 · Agenda e link público de agendamento: paciente agenda sozinho", async () => {
  await abrir("/agenda");
  await page.getByRole("button", { name: "Novo evento" }).first().click();
  const ev = dialogo("Novo evento");
  await ev.getByLabel("Título").fill("Avaliação · Carlos Demo");
  await ev.getByRole("button", { name: "Criar evento" }).click();
  await toast("Evento criado");

  await abrir("/agendamentos", "Agendamentos");
  await page
    .getByRole("button", { name: /Novo link/ })
    .first()
    .click();
  const bp = dialogo("Novo link de agendamento");
  await bp.locator("#bp-title").fill(`Avaliação ${RUN} ${Date.now().toString(36)}`);
  estado.slugAgenda = await bp.locator("#bp-slug").inputValue();
  await bp.getByRole("button", { name: "Salvar link" }).click();
  await toast("Link criado");

  // a página pública oferece horários e confirma
  const pub = await page.context().newPage();
  await pub.goto(`/agendar/${estado.slugAgenda}`);
  await expect(pub.getByRole("heading", { name: "Escolha um dia e horário" })).toBeVisible();
  const horario = pub.getByRole("button", { name: /^\d{2}:\d{2}$/ }).first();
  if (!(await horario.isVisible().catch(() => false)))
    await pub.getByRole("button", { name: "Próximos dias" }).click();
  await pub
    .getByRole("button", { name: /^\d{2}:\d{2}$/ })
    .first()
    .click();
  await pub.getByLabel("Seu nome").fill("Joana Demo");
  await pub.getByLabel("E-mail", { exact: true }).fill(`joana+${RUN}@paciente-demo.com.br`);
  await pub.getByRole("checkbox").first().check();
  await pub.getByRole("button", { name: "Confirmar agendamento" }).click();
  await expect(pub.getByRole("heading", { name: "Reunião confirmada" })).toBeVisible({
    timeout: 20_000,
  });
  await pub.close();
});

test("11 · Formulário de captação: publica, lead preenche e vira resposta + contato", async () => {
  test.setTimeout(90_000);
  await abrir("/formularios", "Captação");
  await page.getByRole("button", { name: "Novo formulário", exact: true }).first().click();
  await page.waitForURL(/\/formularios\/[0-9a-f-]{36}/);
  estado.formId = /formularios\/([0-9a-f-]{36})/.exec(page.url())?.[1];
  await page.getByLabel("Título").fill("Agende sua avaliação gratuita");
  await page.getByRole("button", { name: "Salvar" }).first().click();
  await toast("Formulário salvo");

  const pub = await page.context().newPage();
  await pub.goto(`/f/${estado.formId}`);
  await expect(pub.getByText("Agende sua avaliação gratuita").first()).toBeVisible();
  await pub.waitForTimeout(3_000); // envio rápido demais é marcado como suspeito
  // obrigatórios vêm com " *" no rótulo
  await pub.getByLabel(/^Nome/).fill("Rafael Lead Demo");
  await pub.getByLabel(/^E-mail/).fill(`rafael+${RUN}@paciente-demo.com.br`);
  await pub.getByLabel(/^WhatsApp/).fill("11977778888");
  await pub.getByRole("checkbox").first().check();
  await pub.getByRole("button", { name: "Enviar" }).click();
  await expect(pub.getByText("Recebemos seus dados. Em breve entramos em contato.")).toBeVisible({
    timeout: 20_000,
  });
  await pub.close();

  await abrir("/formularios");
  await page.getByRole("tab", { name: "Respostas" }).click();
  await expect(page.getByText("Rafael Lead Demo").first()).toBeVisible({ timeout: 20_000 });
  await abrir("/contatos");
  await expect(page.getByText("Rafael Lead Demo").first()).toBeVisible();
});

test("12 · Empresas: cadastra a empresa sem consultar a Receita", async () => {
  await abrir("/empresas");
  await page
    .getByRole("button", { name: /Nova empresa/ })
    .first()
    .click();
  const d = dialogo("Nova empresa");
  await d.getByLabel("Nome (como o mercado conhece)").fill(`Sorriso Odontologia ${RUN}`);
  await d.getByLabel("Domínio do site").fill("sorriso-demo.com.br");
  await d.getByRole("button", { name: "Cadastrar empresa" }).click();
  await toast("Empresa cadastrada");
});

test("13 · Automações: usa um modelo, salva e ativa", async () => {
  await abrir("/automacoes", "Automações");
  // o cartão do modelo na galeria "Comece por um modelo" (não o fluxo já criado)
  await page
    .getByRole("region")
    .filter({ has: page.getByRole("heading", { name: "Comece por um modelo" }) })
    .getByRole("button", { name: /Boas-vindas do lead/ })
    .click();
  await page.getByRole("button", { name: "Usar este modelo" }).click();
  await page.waitForURL(/\/automacoes\/[0-9a-f-]{36}/);
  // modelo recém-criado já está salvo (Salvar desabilitado sem mudança)
  const salvarAut = page.getByRole("button", { name: "Salvar", exact: true });
  if (await salvarAut.isEnabled()) {
    await salvarAut.click();
    await toast("Salvo");
  }
  const ativar = page.getByRole("button", { name: "Ativar", exact: true });
  await expect(ativar, (await ativar.getAttribute("title")) ?? "").toBeEnabled();
  await ativar.click();
  await toast("Automação ativa");
});

test("14 · Campanhas de e-mail: sem provedor, a tela explica o que falta (não quebra)", async () => {
  await abrir("/campanhas", "Campanhas");
  await expect(page.getByText(/Para enviar, conecte o Resend/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Conectar Resend" })).toBeVisible();
});

// ───────────────────────── 4. IA da plataforma ─────────────────────────

test("15 · Equipe de IA e Pergunte ao Nexus: funcionam com a IA embutida", async () => {
  test.setTimeout(150_000);
  await abrir("/equipe-ia", "Equipe de IA");
  await page
    .getByRole("button", { name: /Novo agente|Criar o primeiro agente/ })
    .first()
    .click();
  await dialogo("Novo agente")
    .getByRole("button", { name: /Recepção/ })
    .first()
    .click();
  await toast(/Agente criado em rascunho/);

  await abrir("/pergunte", "Pergunte ao Nexus");
  await page.locator("#ask-q").fill("Quantos negócios foram criados nos últimos 30 dias?");
  // espera a resposta de verdade da IA (antes bastava qualquer número na tela)
  const resposta = page.waitForResponse(
    (r) => r.url().includes("/api/agents") && r.request().method() === "POST",
    { timeout: 90_000 },
  );
  await page.getByRole("button", { name: "Perguntar" }).click();
  const r = await resposta;
  expect(r.status()).toBe(200);
  const corpo = (await r.json()) as { answer?: string };
  expect(corpo.answer ?? "").toMatch(/neg[oó]cio/i);
  await expect(
    page.getByText(/Nenhum provedor de IA|Nenhuma IA configurada|Não consegui/),
  ).toHaveCount(0);
});

test("15b · Um agente por canal: WhatsApp, Instagram e Ligação, cada um com o seu", async () => {
  test.setTimeout(150_000);
  await abrir("/equipe-ia", "Equipe de IA");
  const criar = async (canal: string, modelo: RegExp, nome: string) => {
    await page.getByRole("button", { name: "Novo agente" }).first().click();
    const d = dialogo("Novo agente");
    await d.getByRole("radio", { name: canal, exact: true }).click();
    await d.getByRole("button", { name: modelo }).first().click();
    await toast(`Agente do ${canal} criado em rascunho`);
    // abre a ficha do agente novo: o nome já diz o canal
    await expect(page.getByRole("dialog").getByText(nome).first()).toBeVisible();
    await page.keyboard.press("Escape");
  };
  await criar("WhatsApp", /^SAC/, "SAC · WhatsApp");
  await criar("Instagram", /^SDR/, "SDR · Instagram");
  await criar("Ligação", /^Recepção/, "Recepção · Ligação");

  // o quadro mostra quem atende cada canal (em rascunho até passar na avaliação)
  const quadro = page.getByRole("region", { name: "Quem atende cada canal" });
  const linha = (canal: string) => quadro.getByRole("listitem").filter({ hasText: canal });
  await expect(linha("WhatsApp")).toContainText("SAC · WhatsApp");
  await expect(linha("Instagram")).toContainText("SDR · Instagram");
  await expect(linha("Ligação")).toContainText("Recepção · Ligação");
  // canal sem agente próprio fica com a Recepção geral criada na etapa 15
  await expect(linha("Chat do site")).toContainText(/Recepção(?! ·)/);
});

// ───────────────────────── 5. equipe ─────────────────────────

test("16 · Convite: a dona convida, a atendente cria conta pelo link e entra com menu de atendente", async ({
  browser,
}) => {
  test.setTimeout(150_000);
  await abrir("/ajustes?aba=equipe");
  await page.getByRole("button", { name: "Convidar pessoa" }).click();
  const d = dialogo("Convidar pessoa");
  await d.getByLabel("E-mail").fill(ATENDENTE.email);
  await d.getByRole("radio", { name: /Atendente/ }).click();
  await d.getByRole("button", { name: "Criar convite" }).click();
  await toast("Convite criado");
  const link = (await dialogo("Envie este link").locator("code").innerText()).trim();
  estado.linkConvite = link;
  await page.getByRole("button", { name: "Concluir" }).click();
  await atendenteAceita(browser, link);
});

async function atendenteAceita(browser: Browser, link: string) {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  const erros: string[] = [];
  p.on("pageerror", (e) => erros.push(e.message));
  await p.goto(link);
  await expect(p.getByRole("heading", { name: new RegExp(`Entrar em ${EMPRESA}`) })).toBeVisible();
  await p.getByRole("link", { name: /Entrar ou criar conta/ }).click();
  await p.getByRole("button", { name: "Criar agora" }).click();
  await p.getByLabel("Seu nome").fill(ATENDENTE.nome);
  await p.getByLabel("E-mail", { exact: true }).fill(ATENDENTE.email);
  await p.getByLabel("Senha", { exact: true }).fill(ATENDENTE.senha);
  await p.getByRole("button", { name: "Criar conta", exact: true }).click();
  await p.waitForURL(/\/convite\//, { timeout: 30_000 });
  await p.getByRole("button", { name: "Aceitar convite" }).click();
  await p.waitForURL(/\/painel/, { timeout: 30_000 });
  // atendente: menu do dia a dia, sem Automações nem Configuração
  const menu = p.getByRole("navigation").first();
  await expect(menu.getByRole("link", { name: /Caixa de entrada/ })).toBeVisible();
  await expect(menu.getByRole("link", { name: /Automações/ })).toHaveCount(0);
  // e vê a conversa do visitante
  await p.goto("/inbox?status=resolved");
  await p
    .getByRole("radio", { name: /Resolvidas/ })
    .click()
    .catch(() => undefined);
  await expect(p.getByRole("link", { name: new RegExp(VISITANTE) }).first()).toBeVisible({
    timeout: 20_000,
  });
  expect(erros).toEqual([]);
  await ctx.close();
}

// ───────────────────────── 6. resultados e varredura ─────────────────────────

test("17 · Incidente público e página de status", async () => {
  await abrir("/incidentes", "Incidentes");
  await page.getByRole("button", { name: "Novo incidente" }).first().click();
  const d = dialogo("Novo incidente");
  await d.getByLabel("O que está acontecendo").fill("Agenda online instável");
  await d.getByRole("button", { name: "Criar incidente" }).click();
  await toast("Incidente criado");
});

test("18 · Varredura: toda tela do menu abre sem erro e o Painel mostra os dados reais", async () => {
  test.setTimeout(240_000);
  const rotas: [string, string | RegExp | undefined][] = [
    ["/painel", undefined],
    ["/meu-dia", undefined],
    ["/fila", "Minha fila"],
    ["/fila/painel", undefined],
    ["/fila/roteamento", undefined],
    ["/inbox", "Caixa de entrada"],
    ["/atendimento", "Chamados"],
    ["/crm", undefined],
    ["/contatos", "Clientes"],
    ["/agenda", undefined],
    ["/agendamentos", "Agendamentos"],
    ["/empresas", undefined],
    ["/automacoes", "Automações"],
    ["/campanhas", "Campanhas"],
    ["/origem", "Origem dos leads"],
    ["/relatorios", "Relatórios"],
    ["/metas", undefined],
    ["/qualidade", "Qualidade"],
    ["/gestao", "Gestão"],
    ["/incidentes", "Incidentes"],
    ["/equipe-ia", "Equipe de IA"],
    ["/pergunte", "Pergunte ao Nexus"],
    ["/biblioteca", "Biblioteca"],
    ["/treino", "Treino"],
    ["/sdr", "Pontuação e rodízio"],
    ["/canais", "Canais de atendimento"],
    ["/formularios", "Captação"],
    ["/central-de-ajuda", "Ajuda"],
  ];
  const abas = [
    "empresa",
    "aparencia",
    "recursos",
    "notificacoes",
    "catalogo",
    "campos",
    "equipe",
    "playbooks",
    "integracoes",
    "email",
    "agenda",
    "telefonia",
    "desenvolvedores",
    "inteligencia",
    "agente",
    "atendimento",
    "privacidade",
    "auditoria",
  ];
  for (const [rota, titulo] of rotas) await test.step(rota, () => abrir(rota, titulo));
  for (const aba of abas)
    await test.step(`/ajustes?aba=${aba}`, () => abrir(`/ajustes?aba=${aba}`));

  // Painel com dados reais da clínica
  await abrir("/painel");
  const alternar = page.getByRole("button", { name: "Ver meus dados" });
  if (await alternar.isVisible().catch(() => false)) await alternar.click();
  await expect(page.getByText("Você está vendo um exemplo com dados fictícios.")).toHaveCount(0);

  expect(errosDePagina, "erros de JavaScript na jornada").toEqual([]);
});
