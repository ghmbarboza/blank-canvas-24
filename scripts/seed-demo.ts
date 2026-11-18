// Dados de demonstração numa conta de TESTE: empresas, contatos com origem, consentimento,
// negócios espalhados pelo Funil, chamados, agenda, tarefas e conversas do chat do site.
// Grava como o dono da conta (RLS de verdade, mesmo caminho da tela), nunca com service role.
//
// Uso:
//   SEED_EMAIL=... SEED_PASSWORD=... SEED_ACCOUNT_ID=<uuid> bun scripts/seed-demo.ts
//   ... bun scripts/seed-demo.ts --reset          apaga só o que este script criou (tag "demo")
//   ... bun scripts/seed-demo.ts --sem-conversas  não abre conversas no chat do site
//
// Tudo leva a tag "demo" (contatos e empresas) ou o prefixo "[demo]" na descrição, para sair
// limpo com --reset. Recusa rodar em conta cujo nome não tenha "teste" ou "demo".
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [
        l.slice(0, i).trim(),
        l
          .slice(i + 1)
          .trim()
          .replace(/^"|"$/g, ""),
      ];
    }),
);
const url = env["VITE_SUPABASE_URL"]!;
const key = env["VITE_SUPABASE_PUBLISHABLE_KEY"]!;
const appUrl = process.env["SEED_APP_URL"] ?? "http://localhost:5173";
const email = process.env["SEED_EMAIL"];
const password = process.env["SEED_PASSWORD"];
const accountId = process.env["SEED_ACCOUNT_ID"];
const reset = process.argv.includes("--reset");
const withChats = !process.argv.includes("--sem-conversas");
const TAG = "demo";
const MARK = "[demo]";

if (!email || !password || !accountId) {
  console.error("Defina SEED_EMAIL, SEED_PASSWORD e SEED_ACCOUNT_ID.");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });
const { data: auth, error: authErr } = await sb.auth.signInWithPassword({ email, password });
if (authErr || !auth.user) throw new Error(`login: ${authErr?.message}`);
const me = auth.user.id;

function must<T>(r: { data: T | null; error: { message: string } | null }, what: string): T {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data as T;
}

const account = must(
  await sb.from("accounts").select("id, name").eq("id", accountId).single(),
  "conta",
);
if (!/teste|demo/i.test(account.name)) {
  throw new Error(`"${account.name}" não parece conta de teste; recusado.`);
}

const day = 86_400_000;
const ago = (d: number, h = 10) =>
  new Date(Date.now() - d * day + (h - 12) * 3_600_000).toISOString();
const ahead = (d: number, h: number) => {
  const t = new Date(Date.now() + d * day);
  t.setHours(h, 0, 0, 0);
  return t.toISOString();
};

async function wipe() {
  const contacts = must(
    await sb.from("contacts").select("id").eq("account_id", accountId!).contains("tags", [TAG]),
    "contatos demo",
  ).map((c) => c.id);
  if (contacts.length) {
    must(await sb.from("deals").delete().in("contact_id", contacts), "apagar negócios");
    must(await sb.from("tickets").delete().in("contact_id", contacts), "apagar chamados");
    must(await sb.from("events").delete().in("contact_id", contacts), "apagar agenda");
    must(await sb.from("contacts").delete().in("id", contacts), "apagar contatos");
  }
  must(
    await sb.from("companies").delete().eq("account_id", accountId!).contains("tags", [TAG]),
    "apagar empresas",
  );
  console.log(`apagado: ${contacts.length} contatos demo e o que pendia deles`);
}

if (reset) {
  await wipe();
  process.exit(0);
}

const { count } = await sb
  .from("contacts")
  .select("id", { count: "exact", head: true })
  .eq("account_id", accountId)
  .contains("tags", [TAG]);
if ((count ?? 0) > 0) {
  console.log(`a conta já tem ${count} contatos demo; rode com --reset antes para recriar.`);
  process.exit(0);
}

// ------------------------------------------------------------------ empresas
const companies = must(
  await sb
    .from("companies")
    .insert([
      {
        account_id: accountId,
        name: "Odonto Vida Campinas",
        industry: "Saúde",
        size: "11-50",
        tags: [TAG],
        website: "https://example.com/odontovida",
      },
      {
        account_id: accountId,
        name: "Grupo Bem Estar",
        industry: "Saúde",
        size: "51-200",
        tags: [TAG],
        website: "https://example.com/bemestar",
      },
      {
        account_id: accountId,
        name: "Academia Movimento",
        industry: "Fitness",
        size: "1-10",
        tags: [TAG],
      },
    ])
    .select("id, name"),
  "empresas",
);
const companyId = (name: string) => companies.find((c) => c.name === name)?.id ?? null;

// ------------------------------------------------------------------ contatos
const ig = (campaign: string, content: string) => ({
  source: "instagram",
  medium: "paid_social",
  campaign,
  content,
  channel: "whatsapp",
});
const google = (term: string) => ({
  source: "google",
  medium: "cpc",
  campaign: "pesquisa-implante",
  term,
  channel: "site",
});
const site = { source: "site", medium: "organic", channel: "site" };
const referral = { source: "indicacao", medium: "referral", channel: "whatsapp" };

type Seed = {
  name: string;
  phone: string;
  email: string;
  city: string;
  temperature: "hot" | "warm" | "cold";
  lifecycle: "lead" | "opportunity" | "customer";
  touch: Record<string, string>;
  days: number;
  company?: string;
  job?: string;
  score: number;
  consent: boolean;
};
const people: Seed[] = [
  {
    name: "Mariana Costa",
    phone: "5511987654321",
    email: "mariana.costa@example.com",
    city: "São Paulo",
    temperature: "hot",
    lifecycle: "opportunity",
    touch: ig("clareamento-outubro", "video-antes-depois"),
    days: 2,
    score: 86,
    consent: true,
  },
  {
    name: "Rafael Nogueira",
    phone: "5511976543210",
    email: "rafael.nogueira@example.com",
    city: "São Paulo",
    temperature: "hot",
    lifecycle: "opportunity",
    touch: google("implante dentário preço"),
    days: 4,
    score: 81,
    consent: true,
  },
  {
    name: "Beatriz Almeida",
    phone: "5519998877665",
    email: "beatriz@example.com",
    city: "Campinas",
    temperature: "warm",
    lifecycle: "lead",
    touch: ig("clareamento-outubro", "carrossel-precos"),
    days: 1,
    score: 64,
    consent: true,
  },
  {
    name: "Carlos Henrique Prado",
    phone: "5519991234567",
    email: "carlos.prado@example.com",
    city: "Campinas",
    temperature: "warm",
    lifecycle: "opportunity",
    touch: referral,
    days: 9,
    company: "Odonto Vida Campinas",
    job: "Sócio",
    score: 72,
    consent: true,
  },
  {
    name: "Juliana Ribeiro",
    phone: "5521987001122",
    email: "juliana.ribeiro@example.com",
    city: "Rio de Janeiro",
    temperature: "cold",
    lifecycle: "lead",
    touch: site,
    days: 17,
    score: 31,
    consent: false,
  },
  {
    name: "Fernando Lima",
    phone: "5511955443322",
    email: "fernando.lima@example.com",
    city: "Guarulhos",
    temperature: "warm",
    lifecycle: "lead",
    touch: google("ortodontia invisível"),
    days: 6,
    score: 58,
    consent: true,
  },
  {
    name: "Patrícia Souza",
    phone: "5511944332211",
    email: "patricia.souza@example.com",
    city: "São Paulo",
    temperature: "hot",
    lifecycle: "customer",
    touch: ig("lentes-setembro", "reels-depoimento"),
    days: 26,
    score: 92,
    consent: true,
  },
  {
    name: "Lucas Martins",
    phone: "5531988776655",
    email: "lucas.martins@example.com",
    city: "Belo Horizonte",
    temperature: "cold",
    lifecycle: "lead",
    touch: ig("lentes-setembro", "story-oferta"),
    days: 21,
    score: 22,
    consent: false,
  },
  {
    name: "Aline Ferreira",
    phone: "5511933221100",
    email: "aline.ferreira@example.com",
    city: "Osasco",
    temperature: "warm",
    lifecycle: "opportunity",
    touch: site,
    days: 12,
    company: "Grupo Bem Estar",
    job: "Gerente de RH",
    score: 69,
    consent: true,
  },
  {
    name: "Gustavo Rocha",
    phone: "5519977665544",
    email: "gustavo.rocha@example.com",
    city: "Valinhos",
    temperature: "hot",
    lifecycle: "customer",
    touch: referral,
    days: 29,
    company: "Academia Movimento",
    job: "Proprietário",
    score: 88,
    consent: true,
  },
  {
    name: "Camila Duarte",
    phone: "5511922110099",
    email: "camila.duarte@example.com",
    city: "São Paulo",
    temperature: "warm",
    lifecycle: "lead",
    touch: google("clareamento a laser"),
    days: 3,
    score: 55,
    consent: true,
  },
  {
    name: "Eduardo Pires",
    phone: "5541988990011",
    email: "eduardo.pires@example.com",
    city: "Curitiba",
    temperature: "cold",
    lifecycle: "lead",
    touch: ig("clareamento-outubro", "video-antes-depois"),
    days: 14,
    score: 28,
    consent: true,
  },
];

const contactRows = must(
  await sb
    .from("contacts")
    .insert(
      people.map((p) => ({
        account_id: accountId,
        name: p.name,
        phone: p.phone,
        email: p.email,
        city: p.city,
        temperature: p.temperature,
        lifecycle: p.lifecycle,
        score: p.score,
        tags: [TAG],
        source: p.touch["source"],
        first_touch: { ...p.touch, at: ago(p.days) },
        last_touch: { ...p.touch, at: ago(Math.max(0, p.days - 1)) },
        last_interaction_at: ago(Math.max(0, p.days - 1), 15),
        created_at: ago(p.days),
        owner_user_id: me,
        ...(p.company ? { company: p.company, company_id: companyId(p.company) } : {}),
        ...(p.job ? { job_title: p.job } : {}),
      })),
    )
    .select("id, name"),
  "contatos",
);
const cid = (name: string) => contactRows.find((c) => c.name === name)!.id;

// Consentimento explícito só de quem marcou o aceite; o resto fica sem registro (como na vida real).
const consentRows = people
  .filter((p) => p.consent)
  .flatMap((p) =>
    (["whatsapp", "email"] as const).map((channel) => ({
      account_id: accountId,
      contact_id: cid(p.name),
      channel,
      status: "granted",
      basis: "consent",
      source: "form",
      proof: { text: `${MARK} Autorizo o contato pelos canais informados.`, at: ago(p.days) },
    })),
  );
const consentRes = await sb.from("consents").insert(consentRows);
if (consentRes.error)
  console.warn(`consentimentos: ${consentRes.error.message} (seguindo sem eles)`);

// ------------------------------------------------------------------ negócios
const pipeline = must(
  await sb
    .from("pipelines")
    .select("id, name")
    .eq("account_id", accountId)
    .order("is_default", { ascending: false })
    .order("position")
    .limit(1)
    .single(),
  "funil",
);
const stages = must(
  await sb
    .from("pipeline_stages")
    .select("id, name, kind, position")
    .eq("pipeline_id", pipeline.id)
    .order("position"),
  "etapas",
);
const open = stages.filter((s) => s.kind === "open");
const won = stages.find((s) => s.kind === "won");
const lost = stages.find((s) => s.kind === "lost");
const at = (i: number) => open[Math.min(i, open.length - 1)]!;

const dealSeeds: Array<{
  title: string;
  contact: string;
  value: number;
  stage: { id: string; kind: string };
  close?: number;
  daysAgo: number;
  lostReason?: string;
}> = [
  {
    title: "Clareamento + manutenção",
    contact: "Mariana Costa",
    value: 1890.5,
    stage: at(2),
    close: 6,
    daysAgo: 2,
  },
  {
    title: "Implante unitário",
    contact: "Rafael Nogueira",
    value: 4800,
    stage: at(1),
    close: 12,
    daysAgo: 4,
  },
  {
    title: "Avaliação ortodôntica",
    contact: "Fernando Lima",
    value: 350,
    stage: at(0),
    close: 9,
    daysAgo: 6,
  },
  {
    title: "Convênio empresarial · 40 vidas",
    contact: "Aline Ferreira",
    value: 18_400,
    stage: at(3),
    close: 20,
    daysAgo: 12,
  },
  {
    title: "Parceria clínica · Odonto Vida",
    contact: "Carlos Henrique Prado",
    value: 9_600,
    stage: at(2),
    daysAgo: 9,
  },
  {
    title: "Clareamento a laser",
    contact: "Camila Duarte",
    value: 1_290.9,
    stage: at(0),
    close: 15,
    daysAgo: 3,
  },
  ...(won
    ? [
        {
          title: "Lentes de contato dental · 8 elementos",
          contact: "Patrícia Souza",
          value: 12_800,
          stage: won,
          daysAgo: 24,
        },
        {
          title: "Plano corporativo · Academia Movimento",
          contact: "Gustavo Rocha",
          value: 6_250,
          stage: won,
          daysAgo: 27,
        },
      ]
    : []),
  ...(lost
    ? [
        {
          title: "Lentes · orçamento",
          contact: "Lucas Martins",
          value: 7_200,
          stage: lost,
          daysAgo: 19,
          lostReason: "Preço acima do esperado",
        },
      ]
    : []),
];
const deals = must(
  await sb
    .from("deals")
    .insert(
      dealSeeds.map((d, i) => ({
        account_id: accountId,
        pipeline_id: pipeline.id,
        stage_id: d.stage.id,
        title: d.title,
        contact_id: cid(d.contact),
        value: d.value,
        currency: "BRL",
        owner_user_id: me,
        position: i,
        created_at: ago(d.daysAgo),
        status: d.stage.kind === "won" ? "won" : d.stage.kind === "lost" ? "lost" : "open",
        ...(d.stage.kind !== "open" ? { closed_at: ago(Math.max(1, d.daysAgo - 3)) } : {}),
        ...(d.close ? { expected_close_date: ahead(d.close, 12).slice(0, 10) } : {}),
        ...(d.lostReason ? { lost_reason: d.lostReason } : {}),
      })),
    )
    .select("id, title, contact_id"),
  "negócios",
);

// ------------------------------------------------------------------ chamados (pela porta da tela)
const ticketSeeds = [
  {
    subject: "Dor depois do clareamento",
    contact: "Patrícia Souza",
    priority: "high",
    category: "Pós-atendimento",
  },
  {
    subject: "Segunda via do boleto de outubro",
    contact: "Gustavo Rocha",
    priority: "normal",
    category: "Financeiro",
  },
  {
    subject: "Remarcar avaliação de quinta",
    contact: "Beatriz Almeida",
    priority: "low",
    category: "Agenda",
  },
];
for (const t of ticketSeeds) {
  const r = await sb.rpc("create_ticket", {
    _account: accountId,
    _subject: t.subject,
    _description: `${MARK} Chamado de demonstração.`,
    _contact: cid(t.contact),
    _priority: t.priority,
    _source: "manual",
    _category: t.category,
    _owner: me,
  });
  if (r.error) console.warn(`chamado "${t.subject}": ${r.error.message}`);
}

// ------------------------------------------------------------------ agenda e tarefas
must(
  await sb.from("events").insert([
    {
      account_id: accountId,
      title: "Avaliação · Rafael Nogueira",
      contact_id: cid("Rafael Nogueira"),
      starts_at: ahead(1, 10),
      ends_at: ahead(1, 11),
      status: "confirmed",
      owner_user_id: me,
      description: `${MARK} Implante unitário.`,
    },
    {
      account_id: accountId,
      title: "Retorno do clareamento · Mariana",
      contact_id: cid("Mariana Costa"),
      starts_at: ahead(2, 15),
      ends_at: ahead(2, 16),
      status: "scheduled",
      owner_user_id: me,
      description: MARK,
    },
    {
      account_id: accountId,
      title: "Reunião convênio · Grupo Bem Estar",
      contact_id: cid("Aline Ferreira"),
      starts_at: ahead(3, 9),
      ends_at: ahead(3, 10),
      status: "scheduled",
      owner_user_id: me,
      location: "Online",
      description: MARK,
    },
    {
      account_id: accountId,
      title: "Avaliação ortodôntica · Fernando",
      contact_id: cid("Fernando Lima"),
      starts_at: ahead(5, 14),
      ends_at: ahead(5, 15),
      status: "scheduled",
      owner_user_id: me,
      description: MARK,
    },
  ]),
  "agenda",
);
const dealOf = (contact: string) => deals.find((d) => d.contact_id === cid(contact))?.id ?? null;
const acts = await sb.from("activities").insert([
  {
    account_id: accountId,
    user_id: me,
    type: "task",
    title: "Mandar orçamento do implante",
    contact_id: cid("Rafael Nogueira"),
    deal_id: dealOf("Rafael Nogueira"),
    due_at: ahead(0, 17),
  },
  {
    account_id: accountId,
    user_id: me,
    type: "task",
    title: "Ligar para confirmar o convênio",
    contact_id: cid("Aline Ferreira"),
    deal_id: dealOf("Aline Ferreira"),
    due_at: ahead(1, 11),
  },
  {
    account_id: accountId,
    user_id: me,
    type: "note",
    title: "Prefere atendimento no fim da tarde",
    body: MARK,
    contact_id: cid("Mariana Costa"),
  },
  {
    account_id: accountId,
    user_id: me,
    type: "call",
    title: "Ligação: pediu parcelamento em 10x",
    contact_id: cid("Carlos Henrique Prado"),
    deal_id: dealOf("Carlos Henrique Prado"),
    done_at: ago(2, 16),
  },
]);
if (acts.error) console.warn(`atividades: ${acts.error.message}`);

// ------------------------------------------------------------------ conversas (chat do site)
// Conversa e mensagem só nascem por canal; o chat do site é a porta pública. O limite é 5 por hora
// por IP, então são 3 visitantes. Se a IA estiver ligada no canal, ela responde de verdade.
let chats = 0;
if (withChats) {
  const channel = (
    await sb
      .from("channels")
      .select("id")
      .eq("account_id", accountId)
      .eq("platform", "webchat")
      .limit(1)
      .maybeSingle()
  ).data;
  if (!channel) console.warn("sem canal de chat do site; conversas puladas");
  else {
    const visitors = [
      {
        name: "Beatriz Almeida",
        email: "beatriz@example.com",
        text: "Oi! Vi o anúncio do clareamento. Quanto fica e tem horário sábado?",
      },
      {
        name: "Camila Duarte",
        email: "camila.duarte@example.com",
        text: "Boa tarde, vocês fazem clareamento a laser? Parcelam?",
      },
      {
        name: "Eduardo Pires",
        email: "eduardo.pires@example.com",
        text: "Queria saber se atendem convênio Amil.",
      },
    ];
    for (const v of visitors) {
      const call = (body: object) =>
        fetch(`${appUrl}/api/public/webchat`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }).then(async (r) => ({
          ok: r.ok,
          body: (await r.json().catch(() => ({}))) as Record<string, unknown>,
        }));
      const start = await call({
        action: "start",
        channelId: channel.id,
        name: v.name,
        email: v.email,
        visitorId: `demo-${crypto.randomUUID()}`,
      });
      const token = start.body["token"];
      if (!start.ok || typeof token !== "string") {
        console.warn(`chat ${v.name}: ${JSON.stringify(start.body)}`);
        continue;
      }
      const sent = await call({ action: "send", token, text: v.text });
      if (sent.ok) chats += 1;
      else console.warn(`chat ${v.name}: ${JSON.stringify(sent.body)}`);
    }
  }
}

console.log(
  `pronto em "${account.name}": ${companies.length} empresas, ${contactRows.length} contatos, ` +
    `${consentRes.error ? 0 : consentRows.length} consentimentos, ${deals.length} negócios, ` +
    `${ticketSeeds.length} chamados, 4 eventos, 4 atividades, ${chats} conversas`,
);
