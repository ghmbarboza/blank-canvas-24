// O roteiro de configuração: a ÚNICA fonte do onboarding (regra de 28/10). Cada passo tem o
// critério de pronto lido do estado real da conta, nunca do que a IA diz. Obrigatório é só o
// mínimo para a central funcionar (empresa e o WhatsApp); o resto deixa o pós-venda rodando e
// é opcional. "Pular" fica gravado, mas obrigatório pulado continua pendente.
// Puro: prompt, abertura, indicador do layout e testes usam.
import { BRAND } from "@/lib/brand";
import { EDITION, hasChannel, type Edition, type EditionChannel } from "@/lib/edition";

import type { StageAction, StageBlock, StageIcon } from "./stage";
import type { Fact, SetupSnapshot } from "./spec";

/** Nome que o gatilho do primeiro cadastro dá à conta, antes de a pessoa dizer o nome real. */
export const PLACEHOLDER_COMPANY = "Minha empresa";

export const SEGMENT_LABELS: { id: string; label: string; hint: string; icon: StageIcon }[] = [
  {
    id: "clinica",
    label: "Clínica e saúde",
    hint: "Consultas, retornos, convênios",
    icon: "saude",
  },
  { id: "imobiliaria", label: "Imobiliária", hint: "Imóveis, visitas, propostas", icon: "imovel" },
  { id: "varejo", label: "Varejo e loja", hint: "Pedidos, trocas, entregas", icon: "loja" },
  {
    id: "saas",
    label: "Software e serviços B2B",
    hint: "Demonstrações e contratos",
    icon: "empresa",
  },
  {
    id: "automoveis",
    label: "Concessionária e veículos",
    hint: "Estoque e test drive",
    icon: "carro",
  },
  { id: "escola", label: "Escola e cursos", hint: "Matrículas e turmas", icon: "escola" },
  { id: "outro", label: "Outro tipo de negócio", hint: "Começa com o modelo geral", icon: "outro" },
];

export type StepId =
  | "empresa"
  | "canal"
  | "conhecimento"
  | "agente"
  | "regras"
  | "teste"
  | "equipe"
  | "instagram"
  | "email";

export interface RoteiroStep {
  id: StepId;
  title: string;
  /** uma frase para o dono, mostrada no passo a passo */
  summary: string;
  /** mínimo para a central funcionar: a abertura automática conta só estes */
  required: boolean;
  /** "Depois, se quiser": fora da barra de progresso, nunca bloqueia */
  later: boolean;
  /** o que a Cris precisa conseguir neste passo, e com qual ferramenta */
  goal: string;
  /** a pergunta com que ela abre o passo */
  ask: string;
  /** canal de que o passo depende: fora da edição, o passo some (ver src/lib/edition.ts) */
  channel?: EditionChannel;
}

const CANAL_GOAL =
  "conectar o WhatsApp da empresa pelo QR Code: mostre o botão com abrir_passo canal; na tela a pessoa cola o endereço do servidor e a chave, clica em Conectar e lê o QR Code no celular (WhatsApp › Dispositivos conectados › Conectar dispositivo). Quem não tem servidor contrata um provedor de Evolution API (a Cloudfy é um exemplo), que passa o endereço e a chave; não diga preço. Não peça a chave da Evolution na conversa: ela é colada na tela e vai direto para o cofre. Se a tela mostrar erro, explique: endereço precisa começar com https://; chave recusada é a chave global errada; servidor fora do ar é com o provedor; QR Code vencido é só gerar outro.";
/** Só na edição com número oficial da Meta. */
const CANAL_GOAL_OFFICIAL =
  " Caminho secundário, só se a pessoa pedir o número oficial da Meta: conectar_zernio e depois link_whatsapp (precisa de conta na Zernio).";

// Edição de pós-venda: seis passos, nesta ordem, cada um com uma tela direta (abrir_passo).
// Lista completa: o que depende de um canal fora da edição é filtrado em roteiroFor.
const ALL_STEPS: RoteiroStep[] = [
  {
    id: "empresa",
    title: "Sua empresa",
    summary: "Nome, ramo, o que vende e o jeito de falar com o cliente.",
    required: true,
    later: false,
    goal: "saber o nome da empresa, o ramo, o que ela vende e o tom de voz, e salvar com salvar_empresa (nome, ramo, o_que_vende, tom). A pessoa também pode preencher pela tela: ofereça abrir_passo empresa.",
    ask: "como se chama a empresa e qual é o ramo de vocês?",
  },
  {
    id: "canal",
    title: "Conectar o WhatsApp",
    summary:
      "Leia um QR Code com o celular da empresa (não o seu pessoal) e o número entra na central.",
    required: true,
    later: false,
    goal: CANAL_GOAL,
    ask: "vamos conectar o WhatsApp da empresa? Você já tem o endereço e a chave do servidor da Evolution?",
  },
  {
    id: "conhecimento",
    title: "Base de conhecimento",
    summary: "Suba arquivos ou cole textos com o que o atendente precisa saber.",
    required: false,
    later: false,
    goal: "ensinar o atendente: prazos, garantia, troca, entrega, como usar o produto, dúvidas comuns de quem já comprou. A pessoa sobe PDF, Word ou texto pela tela (abrir_passo conhecimento) ou conta aqui: guarde com guardar_conhecimento (título e conteúdo) e, se ela passar o site, use ler_site com guardar_na_biblioteca=true. O passo fica pronto quando houver pelo menos um documento lido.",
    ask: "o que o cliente mais pergunta depois que compra? Pode subir um arquivo ou me contar aqui.",
  },
  {
    id: "agente",
    title: "Seu atendente de IA",
    summary: "Crie o atendente de pós-venda e teste as respostas dele aqui na tela.",
    required: false,
    later: false,
    goal: "criar e ligar o atendente de pós-venda. Pela tela é um clique (abrir_passo agente): cria a partir do modelo de pós-venda, já no WhatsApp, e tem uma caixa de teste que responde com a base da empresa. Pela conversa: criar_agente (descreva um atendente de pós-venda) e, com o sim da pessoa, avaliar_agente, que roda as perguntas de teste e liga sozinho se passar com 90% ou mais. Nunca diga que está ligado antes de estar.",
    ask: "posso criar o atendente de pós-venda de vocês?",
  },
  {
    id: "regras",
    title: "Regras de pós-venda",
    summary: "Escolha o que a central faz sozinha: boas-vindas, pesquisa, recompra.",
    required: false,
    later: false,
    goal: 'ligar pelo menos uma regra de pós-venda (boas-vindas depois da compra, conferir em 7 dias, pesquisa de satisfação, nota baixa vira chamado, nota alta pede indicação, lembrete de recompra, cliente parado). As regras são ligadas na tela Pós-venda: mostre o botão com abrir_tela /pos-venda e o rótulo "Escolher as regras".',
    ask: "quais mensagens de pós-venda vocês querem que saiam sozinhas?",
  },
  {
    id: "teste",
    title: "Teste no seu número",
    summary: "Mande um Oi de outro número e veja a conversa chegar na Caixa de entrada.",
    required: false,
    later: false,
    goal: 'ver funcionando: a pessoa manda uma mensagem do próprio celular (de outro número) para o WhatsApp que conectou, abre a Caixa de entrada (abrir_tela /inbox, rótulo "Abrir a Caixa de entrada"), vê a mensagem chegar e a resposta sair (do atendente de IA ou dela mesma). O passo só fica pronto quando o banco mostra mensagem recebida e resposta enviada: diga o que já aconteceu e o que falta.',
    ask: "vamos ver funcionando? Mande uma mensagem do seu celular para o número que conectamos e me avise.",
  },
  {
    id: "equipe",
    title: "Convidar a equipe",
    summary: "Gere o link de convite e mande para quem atende com você.",
    required: false,
    later: true,
    goal: "convidar quem atende junto: convidar_pessoa gera o link de convite com o papel (admin, gestor, atendente ou vendedor). A pessoa copia o link e manda pelo WhatsApp; não precisa configurar e-mail. O e-mail do convidado só identifica quem vai entrar.",
    ask: "quem mais vai atender com você? Me passa o e-mail da pessoa e o papel que eu gero o link de convite para você mandar.",
  },
  {
    id: "instagram",
    title: "Conectar o Instagram",
    summary: "As mensagens diretas do Instagram chegam na mesma Caixa de entrada.",
    required: false,
    later: true,
    channel: "instagram",
    goal: 'trazer as mensagens diretas do Instagram da empresa para a Caixa de entrada. A conexão passa pela Zernio (serviço à parte, com conta da própria empresa). O jeito mais simples é pela tela: abrir_tela /canais com o rótulo "Conectar o Instagram"; no cartão Instagram a pessoa cola a chave da Zernio e autoriza a conta. Pela conversa: conectar_zernio com a chave que ela colar e depois link_zernio com a opção instagram. A conta do Instagram precisa ser profissional.',
    ask: "quer receber as mensagens do Instagram da empresa aqui também?",
  },
  {
    id: "email",
    title: "E-mail da empresa",
    summary: "Convites e avisos saem com o e-mail de vocês.",
    required: false,
    later: true,
    channel: "email",
    goal: 'ligar o e-mail pela Resend, para convites e avisos saírem com o domínio da empresa. Mostre o formulário (mostrar_formulario: "Chave da Resend" tipo segredo, "E-mail remetente" tipo email, "Nome do remetente" opcional) e salve com conectar_integracao provedor resend, que testa sozinho.',
    ask: "quer que os e-mails da central saiam com o e-mail da empresa? Eu ligo pela Resend.",
  },
];

/** O roteiro da edição: sem os passos de canal ausente e com o texto do WhatsApp certo. */
export function roteiroFor(edition: Edition = EDITION): RoteiroStep[] {
  const official = hasChannel("whatsapp_official", edition);
  return ALL_STEPS.filter((st) => !st.channel || hasChannel(st.channel, edition)).map((st) =>
    st.id === "canal" && official ? { ...st, goal: `${st.goal}${CANAL_GOAL_OFFICIAL}` } : st,
  );
}

export const ROTEIRO: RoteiroStep[] = roteiroFor();

/** Passos da barra de progresso (os de "Depois, se quiser" ficam fora). */
export const MAIN_STEPS = ROTEIRO.filter((st) => !st.later).map((st) => st.id);

const connected = (s: SetupSnapshot, id: string) =>
  s.integrations.some((i) => i.id === id && i.status === "connected");

export function isDone(id: StepId, s: SetupSnapshot, _facts: Fact[] = []): boolean {
  if (id === "empresa")
    return Boolean(s.segment) && s.company.trim() !== "" && s.company !== PLACEHOLDER_COMPANY;
  if (id === "canal") return s.channels.some((c) => c.platform === "whatsapp");
  if (id === "conhecimento") return s.documents > 0;
  if (id === "agente")
    // criado já conta: ligar depende da conferência, que roda em segundo plano e não prende a fila
    return s.agents.some((a) => a.role !== "supervisor");
  if (id === "regras") return s.rulesOn > 0;
  if (id === "teste") return s.firstWin.received && s.firstWin.replied;
  if (id === "email") return connected(s, "resend") || connected(s, "ses");
  if (id === "instagram") return s.channels.some((c) => c.platform === "instagram");
  return s.team > 1;
}

export interface RoteiroStepState extends RoteiroStep {
  done: boolean;
  /** a pessoa pediu para pular (fato pulou_<id>) */
  skipped: boolean;
  /** pronto, ou opcional que a pessoa pulou: não precisa mais insistir */
  resolved: boolean;
}

export interface RoteiroState {
  steps: RoteiroStepState[];
  current: RoteiroStepState | null;
  /** passos principais (os seis) que ainda faltam */
  remaining: number;
  /** obrigatórios que faltam: a abertura automática usa */
  requiredPending: number;
  mainTotal: number;
  mainDone: number;
}

export function roteiroState(
  s: SetupSnapshot,
  facts: Fact[],
  edition: Edition = EDITION,
): RoteiroState {
  const steps = roteiroFor(edition).map((st) => {
    const done = isDone(st.id, s, facts);
    const skipped = facts.some((f) => f.key === `pulou_${st.id}`);
    // pular obrigatório não resolve: fica gravado, e o passo continua pendente
    return { ...st, done, skipped, resolved: done || (skipped && !st.required) };
  });
  const main = steps.filter((st) => !st.later);
  // obrigatório pendente vem primeiro, mesmo que a pessoa tenha pulado; "depois" nunca vira o atual
  const current =
    main.find((st) => st.required && !st.done) ?? main.find((st) => !st.resolved) ?? null;
  return {
    steps,
    current,
    remaining: main.filter((st) => !st.resolved).length,
    requiredPending: steps.filter((st) => st.required && !st.done).length,
    mainTotal: main.length,
    mainDone: main.filter((st) => st.done).length,
  };
}

/** O roteiro como entra no prompt: o que está feito, o passo atual e o objetivo dele. */
export function roteiroText(r: RoteiroState): string {
  const lines = r.steps.map((st, i) => {
    const tag = st.done
      ? "[feito]"
      : st.id === r.current?.id
        ? "[AGORA]"
        : st.skipped
          ? "[pulado]"
          : "[falta]";
    const kind = st.required ? "obrigatório" : st.later ? "depois, se a pessoa quiser" : "opcional";
    return `${i + 1}. ${tag} ${st.title} (${kind}; id ${st.id})`;
  });
  const now = r.current
    ? `Passo atual: ${r.current.title}. Objetivo: ${r.current.goal}`
    : "Roteiro completo: o pós-venda está de pé. Agora você ajuda a ajustar o atendente, o conhecimento e as regras.";
  return `${lines.join("\n")}
${now}
Cada passo tem uma tela direta: abrir_passo com o id do passo mostra o botão que abre o formulário dele. Use sempre que a pessoa preferir preencher em vez de conversar.
Obrigatório é o mínimo para a central funcionar: a pessoa pode pular, mas ele continua pendente (diga isso com gentileza e volte a ele depois). Opcional pulado não volta a ser oferecido. Os passos "depois" só entram se a pessoa pedir.
Rótulos de ramo que a pessoa pode escolher (rótulo = valor de salvar_empresa): ${SEGMENT_LABELS.map((x) => `${x.label} = ${x.id}`).join("; ")}.`;
}

/** Destino do botão que abre a tela de um passo (a conversa troca pelo passo a passo). */
export const stepTarget = (id: StepId) => `passo:${id}`;

export function stepAction(id: StepId): StageAction {
  const st = ALL_STEPS.find((x) => x.id === id);
  return {
    kind: "open",
    label: `Fazer pela tela: ${st?.title ?? id}`,
    to: stepTarget(id),
    tool: "abrir_passo",
  };
}

// blocos prontos do primeiro clique de cada passo (sem esperar a IA)
function stepBlock(id: StepId): StageBlock | null {
  if (id === "empresa")
    return {
      kind: "choices",
      title: "Ramo da empresa",
      multiple: false,
      options: SEGMENT_LABELS.map((x) => ({ label: x.label, description: x.hint, icon: x.icon })),
    };
  if (id === "canal")
    return {
      kind: "steps",
      title: "WhatsApp por QR Code",
      hint: "Sem servidor ainda? Um provedor de Evolution API, como a Cloudfy, passa o endereço e a chave.",
      steps: [
        { label: "Colar o endereço e a chave do servidor", state: "agora" },
        { label: "Ler o QR Code com o celular da empresa", state: "depois" },
        { label: "Ver o número conectado", state: "depois" },
      ],
    };
  if (id === "teste")
    return {
      kind: "steps",
      title: "Teste no seu número",
      steps: [
        { label: "Mandar uma mensagem do seu celular", state: "agora" },
        { label: "Ver chegar na Caixa de entrada", state: "depois" },
        { label: "Ver a resposta sair", state: "depois" },
      ],
    };
  return null;
}

export interface OpenerMessage {
  text: string;
  blocks: StageBlock[];
  /** botões que a própria abertura já oferece (abrir a tela do passo) */
  actions?: StageAction[];
}

const HI = (person: string) => `Oi${person ? `, ${person}` : ""}! Eu sou a ${BRAND.assistant}.`;

/**
 * A abertura da conversa: abre direto no passo que falta, sem esperar a IA. Vem em DUAS mensagens
 * (uma pergunta por passo, leitura sem rolagem): a primeira cumprimenta e diz o tamanho do
 * trabalho; a segunda faz só a pergunta do passo, com as opções dele e o botão da tela do passo.
 */
export function opener(p: {
  state: RoteiroState;
  company: string;
  person: string;
  /** "Refazer configuração inicial": revê do começo sem apagar o que já está salvo */
  restart?: boolean;
}): { messages: OpenerMessage[] } {
  const hi = HI(p.person);
  const named = p.company && p.company !== PLACEHOLDER_COMPANY;
  if (p.restart) {
    const block = stepBlock("empresa");
    return {
      messages: [
        {
          text: `${hi} Vamos rever a configuração do começo. Tudo o que já está salvo continua valendo: refaça só o que quiser mudar, e os passos que você tinha pulado voltam para a lista.`,
          blocks: [],
        },
        {
          text: named
            ? `**Para começar: a empresa continua sendo ${p.company}? Qual é o ramo de vocês?**`
            : "**Para começar: como se chama a empresa e qual é o ramo de vocês?**",
          blocks: block ? [block] : [],
          actions: [stepAction("empresa")],
        },
      ],
    };
  }
  const step = p.state.current;
  if (!step)
    return {
      messages: [
        {
          text: `${hi} O pós-venda${named ? ` da **${p.company}**` : ""} já está de pé. **O que você quer ajustar hoje: o atendente, o que ele sabe ou as regras de pós-venda?**`,
          blocks: [],
        },
      ],
    };
  const first = p.state.steps.every((st) => !st.done);
  const intro = first
    ? `Vamos deixar o pós-venda no WhatsApp funcionando em ${p.state.mainTotal} passos. Você pode fazer cada um pela tela, com um botão, ou conversando comigo: eu tiro qualquer dúvida no caminho.`
    : `Vamos continuar a configuração${named ? ` da **${p.company}**` : ""}: ${
        p.state.requiredPending
          ? `${p.state.requiredPending === 1 ? "falta 1 passo obrigatório" : `faltam ${p.state.requiredPending} passos obrigatórios`}`
          : `${p.state.mainDone} de ${p.state.mainTotal} passos prontos`
      }.`;
  const ask =
    step.id === "empresa" && named
      ? `Vi que a empresa é ${p.company}. Qual é o ramo de vocês?`
      : step.ask.charAt(0).toUpperCase() + step.ask.slice(1);
  const block = stepBlock(step.id);
  return {
    messages: [
      { text: `${hi} ${intro}`, blocks: [] },
      { text: `**${ask}**`, blocks: block ? [block] : [], actions: [stepAction(step.id)] },
    ],
  };
}
