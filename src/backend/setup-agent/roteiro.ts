// O roteiro de configuração: a ÚNICA fonte do onboarding (regra de 28/10). Cada passo tem o
// critério de pronto lido do estado real da conta, nunca do que a IA diz. Obrigatório é só o
// mínimo para a central funcionar (empresa e um canal de atendimento); o resto melhora a IA e
// é opcional. "Pular" fica gravado, mas obrigatório pulado continua pendente.
// Puro: prompt, abertura, indicador do layout e testes usam.
import { EXTRA_MODULES } from "@/components/layout/modules";

import type { StageBlock, StageIcon } from "./stage";
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
  | "recursos"
  | "canal"
  | "primeira_conversa"
  | "conhecimento"
  | "voz"
  | "inteligencia"
  | "agente"
  | "equipe"
  | "email"
  | "telefonia"
  | "voz_ia";

export interface RoteiroStep {
  id: StepId;
  title: string;
  /** mínimo para a central funcionar: o indicador do layout conta só estes */
  required: boolean;
  /** o que a Nexa precisa conseguir neste passo, e com qual ferramenta */
  goal: string;
  /** a pergunta com que ela abre o passo */
  ask: string;
}

export const ROTEIRO: RoteiroStep[] = [
  {
    id: "empresa",
    title: "Empresa e ramo",
    required: true,
    goal: "saber o nome da empresa e o ramo e salvar com salvar_empresa (o ramo aplica funil, campos e respostas prontos).",
    ask: "como se chama a empresa e qual é o ramo de vocês?",
  },
  {
    id: "recursos",
    title: "O que você vai usar",
    required: false,
    goal: "perguntar o que a empresa quer usar além do núcleo (caixa de entrada, contatos, funil, agente de IA e um canal sempre vêm). Mostre as opções e grave a escolha com escolher_recursos (lista vazia = só o essencial). O que não for escolhido some do menu e pode ser ligado depois em Ajustes › Recursos extras. Ligações e Reuniões aparecem sozinhas quando a telefonia ou o LiveKit forem conectados.",
    ask: "além do atendimento e do funil, o que mais vocês querem usar? Marque o que fizer sentido; o resto fica fora do menu e dá para ligar depois.",
  },
  {
    id: "canal",
    title: "Canal de atendimento",
    required: true,
    goal: "ligar pelo menos um canal por onde os clientes falam com a empresa. Ofereça as saídas: WhatsApp oficial pela Zernio (conectar_zernio, depois conferir_zernio para ver o que já está conectado lá e link_zernio para cada rede ou conta de anúncio que a pessoa escolher; link_whatsapp para o WhatsApp; precisa de conta na Zernio; recomendado: sem risco de bloqueio, vários atendentes no mesmo número)). O WhatsApp entra só pela Zernio: não ofereça outro caminho de WhatsApp. APIs não oficiais de WhatsApp não são suportadas: diga isso se perguntarem. Se o número já está em outra ferramenta, explique que um número oficial fica em uma ferramenta por vez e mostre o guia (abrir_tela /central-de-ajuda), o chat do site (criar_chat_do_site: fica pronto na hora, sem conta externa, a pessoa só cola o código no site) ou o e-mail. Quem não tem Zernio NUNCA fica travado: ofereça o chat do site e diga que dá para ligar o WhatsApp depois.",
    ask: "por onde os seus clientes falam com vocês hoje: WhatsApp, o site ou e-mail?",
  },
  {
    id: "primeira_conversa",
    title: "Primeira conversa",
    required: false,
    goal: 'a primeira vitória, de ponta a ponta, com o canal que acabou de ligar: (1) a pessoa manda uma mensagem de teste do próprio celular para o número (ou abre o chat do site em outra aba e escreve); (2) abre a Caixa de entrada (abrir_tela /inbox com o rótulo "Abrir a Caixa de entrada"), vê a mensagem chegar e responde; (3) na mesma conversa, clica em "Criar negócio" e o lead entra no funil (abrir_tela /crm para ver). O passo só fica pronto quando o banco mostra mensagem recebida, resposta enviada e negócio aberto: diga o que já aconteceu e o que falta, sem dar por feito antes.',
    ask: "vamos ver funcionando? Mande uma mensagem de teste do seu celular para o canal que acabamos de ligar e me avise quando mandar.",
  },
  {
    id: "conhecimento",
    title: "O que vocês fazem",
    required: false,
    goal: "aprender serviços, preços, horário, cidade e público. Peça o site ou o Instagram (ler_site) ou documentos, e guarde os fatos com guardar_informacao. Cada serviço com preço vai para o catálogo com cadastrar_produto.",
    ask: "vocês têm site ou Instagram para eu ler e aprender os serviços?",
  },
  {
    id: "voz",
    title: "Jeito de atender",
    required: false,
    goal: "definir o tom de voz e as regras do atendimento (guardar_informacao nas categorias voz e regras). Ofereça opções de tom com mostrar_opcoes.",
    ask: "como vocês gostam de falar com o cliente?",
  },
  {
    id: "inteligencia",
    title: "Inteligência",
    required: false,
    goal: "a IA inclusa já funciona sem chave. Só se a pessoa quiser a conta própria: escolher_ia (openai/anthropic) e a chave por conectar_integracao.",
    ask: "a IA que já vem inclusa serve, ou vocês querem usar uma chave própria da OpenAI ou da Anthropic?",
  },
  {
    id: "agente",
    title: "Agente de IA",
    required: false,
    goal: 'criar o primeiro atendente de IA com criar_agente (resuma o que ele vai fazer e peça o sim antes). Ele só liga depois de passar na avaliação com 90% ou mais: com o sim da pessoa, chame avaliar_agente, que roda a avaliação e liga sozinho se passar. Se não passar, explique o que errou e ajude a ajustar as regras e o conhecimento; nunca diga que está ligado antes de estar. Depois de ligado, convide a pessoa a conversar com ele como se fosse um cliente: abrir_tela /equipe-ia com o rótulo "Testar meu agente" (o simulador ao lado da lista não manda nada para cliente de verdade).',
    ask: "posso montar o primeiro atendente de IA com o que aprendi?",
  },
  {
    id: "equipe",
    title: "Equipe",
    required: false,
    goal: "convidar quem atende e vende junto: convidar_pessoa gera o link de convite com o papel (admin, gestor, atendente ou vendedor) para a pessoa mandar; quem recebe cria a conta e a senha.",
    ask: "quem mais vai atender com você? Me passa o e-mail e o papel que eu gero o convite.",
  },
  {
    id: "email",
    title: "E-mail da central",
    required: false,
    goal: 'ligar o e-mail pela Resend: convite da equipe, lembrete de reunião, resposta ao cliente e campanha saem por ela, com o domínio da empresa. Mostre o formulário (mostrar_formulario: "Chave da Resend" tipo segredo, "E-mail remetente" tipo email, "Nome do remetente" opcional) e salve com conectar_integracao provedor resend, que testa sozinho. Onde pegar a chave, em uma frase: no painel da Resend, API Keys › Create API key; ela só aparece uma vez. Avise que o domínio do remetente precisa estar verificado na Resend para não cair no spam.',
    ask: "quer que os e-mails da central (convites, lembretes e campanhas) saiam com o e-mail da empresa? Eu ligo pela Resend.",
  },
  {
    id: "telefonia",
    title: "Telefonia",
    required: false,
    goal: 'ligar a telefonia pela Zadarma, a única do Nexus: números, ramais, ligações gravadas e SMS. Mostre o formulário (mostrar_formulario: "Chave da API" e "Segredo da API", os dois tipo segredo) e salve com conectar_integracao provedor zadarma, que testa e mostra o saldo. Onde pegar: no painel da Zadarma, Integrações e API › aba Chaves e API. A Zadarma esconde as chaves: se a pessoa não guardou, "Change keys" manda as novas por e-mail. Não ofereça outra telefonia.',
    ask: "vocês vão ligar ou mandar SMS pela central? Se sim, eu conecto a Zadarma.",
  },
  {
    id: "voz_ia",
    title: "Agente de voz",
    required: false,
    goal: 'ligar a voz do agente pela ElevenLabs, para atender e ligar por telefone. Mostre o formulário (mostrar_formulario: "Chave da ElevenLabs" tipo segredo) e salve com conectar_integracao provedor elevenlabs. Onde pegar: no painel da ElevenLabs, Desenvolvedores › Chaves de API › Criar chave. Com a telefonia e a voz conectadas, o menu Ligações aparece sozinho.',
    ask: "quer um agente que atende e liga por telefone, com voz? Eu conecto a ElevenLabs.",
  },
];

const connected = (s: SetupSnapshot, id: string) =>
  s.integrations.some((i) => i.id === id && i.status === "connected");

const KNOWLEDGE = new Set(["produtos", "clientes", "atendimento", "vendas"]);

function isDone(id: StepId, s: SetupSnapshot, facts: Fact[]): boolean {
  if (id === "empresa")
    return Boolean(s.segment) && s.company.trim() !== "" && s.company !== PLACEHOLDER_COMPANY;
  if (id === "recursos")
    return facts.some((f) => f.key === "recursos_escolhidos") || s.modules.length > 0;
  if (id === "canal") return s.channels.length > 0;
  if (id === "primeira_conversa")
    return s.firstWin.received && s.firstWin.replied && s.firstWin.deal;
  if (id === "conhecimento")
    return s.documents > 0 || facts.filter((f) => KNOWLEDGE.has(f.category)).length >= 2;
  if (id === "voz") return facts.some((f) => f.category === "voz");
  if (id === "inteligencia")
    return (
      Boolean(s.aiMode) ||
      s.integrations.some(
        (i) => (i.id === "openai" || i.id === "anthropic") && i.status === "connected",
      )
    );
  if (id === "agente") return s.agents.some((a) => a.status === "active");
  if (id === "email") return connected(s, "resend") || connected(s, "ses");
  if (id === "telefonia") return connected(s, "zadarma");
  if (id === "voz_ia") return connected(s, "elevenlabs");
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
  remaining: number;
  /** obrigatórios que faltam: o indicador do layout e a abertura automática usam */
  requiredPending: number;
}

export function roteiroState(s: SetupSnapshot, facts: Fact[]): RoteiroState {
  const steps = ROTEIRO.map((st) => {
    const done = isDone(st.id, s, facts);
    const skipped = facts.some((f) => f.key === `pulou_${st.id}`);
    // pular obrigatório não resolve: fica gravado, e o passo continua pendente
    return { ...st, done, skipped, resolved: done || (skipped && !st.required) };
  });
  // obrigatório pendente vem primeiro, mesmo que a pessoa tenha pulado
  const current =
    steps.find((st) => st.required && !st.done) ?? steps.find((st) => !st.resolved) ?? null;
  return {
    steps,
    current,
    remaining: steps.filter((st) => !st.resolved).length,
    requiredPending: steps.filter((st) => st.required && !st.done).length,
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
    return `${i + 1}. ${tag} ${st.title}${st.required ? " (obrigatório)" : " (opcional)"}`;
  });
  const now = r.current
    ? `Passo atual: ${r.current.title}. Objetivo: ${r.current.goal}`
    : "Roteiro completo: a central está pronta. Agora você ajuda a ajustar o agente, o conhecimento e as regras.";
  return `${lines.join("\n")}
${now}
Obrigatório é o mínimo para a central funcionar: a pessoa pode pular, mas ele continua pendente (diga isso com gentileza e volte a ele depois). Opcional pulado não volta a ser oferecido.
Rótulos de ramo que a pessoa pode escolher (rótulo = valor de salvar_empresa): ${SEGMENT_LABELS.map((x) => `${x.label} = ${x.id}`).join("; ")}.`;
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
  if (id === "recursos")
    return {
      kind: "choices",
      title: "O que mais vocês vão usar",
      hint: "Caixa de entrada, contatos, funil, agente de IA e um canal sempre vêm.",
      multiple: true,
      options: [
        ...EXTRA_MODULES.map((m) => ({
          label: m.label,
          description: m.what,
          icon: "outro" as const,
        })),
        { label: "Só o essencial", description: "Nada além do núcleo por enquanto", icon: "outro" },
      ],
    };
  if (id === "canal")
    return {
      kind: "choices",
      title: "Canal de atendimento",
      hint: "O WhatsApp entra pelo WhatsApp Oficial da Zernio. Sem conta na Zernio ainda, comece pelo chat do site e ligue o WhatsApp depois.",
      multiple: false,
      options: [
        { label: "WhatsApp", description: "Oficial, pela Zernio (recomendado)", icon: "whatsapp" },
        { label: "Chat do site", description: "Pronto na hora, sem conta externa", icon: "site" },
        { label: "E-mail", description: "A caixa da empresa", icon: "email" },
      ],
    };
  if (id === "primeira_conversa")
    return {
      kind: "steps",
      title: "A primeira vitória",
      steps: [
        { label: "Mandar uma mensagem de teste", state: "agora" },
        { label: "Responder pela Caixa de entrada", state: "depois" },
        { label: "Criar o negócio no funil", state: "depois" },
      ],
    };
  if (id === "conhecimento")
    return {
      kind: "choices",
      title: "Como eu aprendo sobre vocês",
      multiple: false,
      options: [
        { label: "Tenho site", description: "Eu leio e aprendo os serviços", icon: "site" },
        { label: "Tenho Instagram", description: "Eu leio o perfil", icon: "instagram" },
        {
          label: "Vou mandar documentos",
          description: "Tabela de preços, apresentação",
          icon: "documento",
        },
        { label: "Prefiro contar aqui", description: "A gente conversa", icon: "outro" },
      ],
    };
  if (id === "email")
    return {
      kind: "form",
      title: "E-mail pela Resend",
      hint: "No painel da Resend: API Keys › Create API key. A chave vai direto para o cofre.",
      submit: "Conectar",
      fields: [
        { name: "chave", label: "Chave da Resend", type: "segredo", optional: false },
        { name: "remetente", label: "E-mail remetente", type: "email", optional: false },
        { name: "nome", label: "Nome do remetente", type: "texto", optional: true },
      ],
    };
  if (id === "telefonia")
    return {
      kind: "form",
      title: "Telefonia pela Zadarma",
      hint: "No painel da Zadarma: Integrações e API › Chaves e API. As duas vão direto para o cofre.",
      submit: "Conectar",
      fields: [
        { name: "chave", label: "Chave da API", type: "segredo", optional: false },
        { name: "segredo", label: "Segredo da API", type: "segredo", optional: false },
      ],
    };
  if (id === "voz_ia")
    return {
      kind: "form",
      title: "Voz pela ElevenLabs",
      hint: "No painel da ElevenLabs: Desenvolvedores › Chaves de API › Criar chave.",
      submit: "Conectar",
      fields: [{ name: "chave", label: "Chave da ElevenLabs", type: "segredo", optional: false }],
    };
  return null;
}

export interface OpenerMessage {
  text: string;
  blocks: StageBlock[];
}

/**
 * A abertura da conversa: abre direto no passo que falta, sem esperar a IA. Vem em DUAS mensagens
 * (design system SUBIDO: uma pergunta por passo, leitura sem rolagem): a primeira cumprimenta e
 * diz o tamanho do trabalho; a segunda faz só a pergunta do passo, com as opções dele. O roteiro
 * inteiro não entra na conversa: ele fica na faixa de progresso do topo da Nexa.
 */
export function opener(p: {
  state: RoteiroState;
  company: string;
  person: string;
  /** "Refazer configuração inicial": revê do começo sem apagar o que já está salvo */
  restart?: boolean;
}): { messages: OpenerMessage[] } {
  const hi = `Oi${p.person ? `, ${p.person}` : ""}! Eu sou a Nexa.`;
  if (p.restart) {
    const recursos = stepBlock("recursos");
    return {
      messages: [
        {
          text: `${hi} Vamos rever a configuração do começo. Tudo o que já está salvo continua valendo: refaça só o que quiser mudar, e os passos que você tinha pulado voltam para a lista.`,
          blocks: [],
        },
        {
          text: "**Para começar: além do atendimento e do funil, o que vocês querem usar?**",
          blocks: recursos ? [recursos] : [],
        },
      ],
    };
  }
  const step = p.state.current;
  const named = p.company && p.company !== PLACEHOLDER_COMPANY;
  if (!step)
    return {
      messages: [
        {
          text: `${hi} A central${named ? ` da **${p.company}**` : ""} já está pronta. Para ver o agente respondendo, abra Equipe de IA e converse com ele no simulador, como se fosse um cliente. **O que você quer ajustar no atendimento hoje?**`,
          blocks: [],
        },
      ],
    };
  const first = p.state.steps.every((st) => !st.done);
  const intro = first
    ? `Vamos configurar a central juntos, conversando: eu faço o trabalho e tiro qualquer dúvida no caminho. Para funcionar, bastam ${p.state.requiredPending} passos; o resto deixa a IA mais esperta e dá para fazer depois.`
    : `Vamos continuar a configuração${named ? ` da **${p.company}**` : ""}: ${
        p.state.requiredPending
          ? `${p.state.requiredPending === 1 ? "falta 1 passo obrigatório" : `faltam ${p.state.requiredPending} passos obrigatórios`}`
          : "o mínimo já está pronto; agora é deixar a IA mais esperta"
      }.`;
  const ask =
    step.id === "empresa" && named
      ? `Vi que a empresa é ${p.company}. Qual é o ramo de vocês?`
      : step.ask.charAt(0).toUpperCase() + step.ask.slice(1);
  const block = stepBlock(step.id);
  return {
    messages: [
      { text: `${hi} ${intro}`, blocks: [] },
      { text: `**${ask}**`, blocks: block ? [block] : [] },
    ],
  };
}
