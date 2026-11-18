import { BRAND } from "@/lib/brand";

// Conteúdo da página da aula. Texto entre **asteriscos** é nome de botão ou de tela
// e sai em negrito (ver rich.tsx).

export interface AulaStep {
  id: string;
  title: string;
  /** Uma frase: para que serve este passo. */
  why: string;
  /** O que fazer, na ordem. */
  actions: readonly string[];
  /** Ponto de conferência: o que aparece na tela quando deu certo. */
  check: string;
  /** Se travou: causa provável e o que fazer. */
  stuck: readonly string[];
  /** Lista extra dentro do passo (as regras do passo 6). */
  extras?: readonly { name: string; what: string }[];
  /** Botão principal do passo. */
  cta?: { label: string; href: string };
}

export interface PrepItem {
  id: string;
  title: string;
  detail: string;
  link?: { label: string; href: string };
}

export const TAKEAWAYS: readonly { title: string; detail: string }[] = [
  {
    title: "Atendente de IA que conhece a sua empresa",
    detail: "Responde no WhatsApp com base no material que você enviar.",
  },
  {
    title: "Pesquisa de satisfação automática",
    detail: "Sai sozinha depois da entrega e traz a nota de cada cliente.",
  },
  {
    title: "Alerta de cliente em risco",
    detail: "Nota baixa ou cliente parado vira aviso antes de virar perda.",
  },
  {
    title: "Lembrete de recompra",
    detail: "Na hora certa, o cliente recebe o convite para comprar de novo.",
  },
];

export const PREP_ITEMS: readonly PrepItem[] = [
  {
    id: "lovable",
    title: "Conta no Lovable",
    detail: "É onde a sua cópia do projeto vai morar. Criar a conta é grátis.",
    link: { label: "Abrir lovable.dev", href: "https://lovable.dev" },
  },
  {
    id: "evolution",
    title: "Servidor de Evolution API, com URL e chave",
    detail:
      "É o serviço que liga o seu WhatsApp ao app. Provedores como a Cloudfy entregam em minutos, por e-mail, um endereço (URL) e uma chave. Deixe esse e-mail aberto.",
  },
  {
    id: "celular",
    title: "Celular com o WhatsApp da empresa",
    detail: "De preferência um número só para o pós-venda, separado do seu pessoal.",
  },
  {
    id: "material",
    title: "Material da empresa em PDF ou texto",
    detail:
      "Perguntas frequentes, política de troca, tabela de serviços. É o que vira a base de conhecimento do atendente.",
  },
];

export const STEPS: readonly AulaStep[] = [
  {
    id: "copia",
    title: "Faça a sua cópia",
    why: "Você sai da aula com um app que é seu, no seu endereço.",
    actions: [
      "Clique no botão abaixo. O Lovable abre em outra aba; entre na sua conta se ele pedir.",
      "Confirme a cópia (no Lovable ela se chama **Remix**) e espere o projeto abrir.",
      "No canto de cima, à direita, clique em **Publicar** (**Publish**) e confirme.",
      "Abra o endereço publicado e guarde esse link: é o seu app.",
    ],
    check: `O seu endereço abre a tela de entrada do ${BRAND.name}.`,
    stuck: [
      "O botão pediu login: entre no Lovable e clique no botão desta página de novo.",
      "Não achou o Publicar: ele fica no alto da tela do projeto, à direita. Em tela pequena, pode estar dentro do menu.",
      "O endereço abriu em branco: espere um minuto e recarregue a página.",
    ],
    cta: { label: "Fazer a minha cópia no Lovable", href: BRAND.remixUrl },
  },
  {
    id: "conta",
    title: "Crie a sua conta",
    why: "A primeira conta criada no seu app vira a dona. Crie você, antes de passar o link para alguém.",
    actions: [
      "No seu app publicado (não nesta página), clique em **Criar conta**.",
      "Preencha nome, e-mail e senha.",
      "Se o app pedir, confirme o e-mail: abra a mensagem que chegou e clique no link. Olhe também o spam.",
    ],
    check: `Você entra no app e a ${BRAND.assistant}, ${BRAND.assistantRole}, pergunta o nome da sua empresa.`,
    stuck: [
      "O e-mail de confirmação não chegou: espere um minuto, olhe o spam e a aba Promoções.",
      "Apareceu que o acesso é só por convite: alguém criou uma conta antes de você nesse endereço. Confira se abriu o seu link, e não o de um colega.",
    ],
  },
  {
    id: "whatsapp",
    title: "Conecte o WhatsApp",
    why: "É por esse número que o atendente e as mensagens de pós-venda vão falar com o cliente.",
    actions: [
      "No menu, abra **Canais** e escolha conectar o WhatsApp por QR Code.",
      "Cole a URL e a chave do servidor, as duas que vieram no e-mail do provedor.",
      "Vai aparecer um QR Code na tela.",
      "No celular da empresa: WhatsApp, **Dispositivos conectados**, **Conectar um dispositivo**. Aponte a câmera para o QR Code.",
    ],
    check: "O canal do WhatsApp aparece como **Conectado**.",
    stuck: [
      "O QR Code venceu: peça um novo na mesma tela e leia de novo.",
      "Deu erro ao colar: copie a URL inteira, começando por https://, e a chave sem espaço sobrando.",
      "O celular não lê: confira se ele está com internet e aumente o brilho da tela do notebook.",
    ],
  },
  {
    id: "base",
    title: "Suba a base de conhecimento",
    why: "O atendente só responde bem sobre o que ele leu. Este é o material dele.",
    actions: [
      "Abra **Base de conhecimento**.",
      "Envie o PDF da empresa ou cole o texto.",
      "Espere o app terminar de ler o arquivo.",
    ],
    check: "O arquivo aparece na lista como **pronto**.",
    stuck: [
      "O PDF é uma foto ou um documento escaneado: ele não tem texto para ler. Cole o conteúdo como texto.",
      "Ficou muito tempo lendo: espere um minuto e recarregue a página.",
      "Não trouxe material: escreva agora cinco perguntas que os clientes sempre fazem, com as respostas, e envie como texto.",
    ],
  },
  {
    id: "atendente",
    title: "Crie o seu atendente de IA",
    why: "É quem responde o cliente no WhatsApp, com o jeito e as informações da sua empresa.",
    actions: [
      "Abra **Equipe de IA** e crie um atendente.",
      "Dê um nome a ele e ligue a base de conhecimento que você acabou de enviar.",
      "Na área de teste, faça uma pergunta cuja resposta está no seu material. Exemplo: qual é o prazo de troca?",
    ],
    check: "Ele responde com a informação do seu material, e não com uma resposta genérica.",
    stuck: [
      "A resposta veio genérica: confira se a base de conhecimento está ligada ao atendente e se o arquivo está como pronto.",
      "Ele disse que não sabe: a resposta não está no material. Acrescente esse trecho na base e pergunte de novo.",
    ],
  },
  {
    id: "regras",
    title: "Ligue as regras de pós-venda",
    why: "São as mensagens que saem sozinhas na hora certa. Cada regra já vem com um texto pronto.",
    actions: [
      "Abra **Pós-venda**.",
      "Ligue as sete regras abaixo, uma por uma.",
      "Na aula, deixe os textos como estão. Você ajusta as palavras em casa.",
    ],
    extras: [
      { name: "Boas-vindas", what: "recebe o cliente novo logo depois da compra." },
      { name: "Check-in de 7 dias", what: "pergunta, uma semana depois, se está tudo certo." },
      { name: "Pesquisa de satisfação", what: "pede uma nota para o atendimento." },
      { name: "Nota baixa vira chamado", what: "abre um chamado para alguém da equipe resolver." },
      { name: "Nota alta pede indicação", what: "convida o cliente satisfeito a indicar você." },
      {
        name: "Hora de comprar de novo",
        what: "lembra o cliente quando chega a época da recompra.",
      },
      { name: "Cliente parado", what: "avisa quando alguém some há tempo demais." },
    ],
    check: "As sete regras aparecem como ligadas.",
    stuck: [
      "Não sabe o que escrever: use o texto pronto. O importante agora é sair com tudo ligado.",
      "Uma regra não liga: confira se o WhatsApp do passo 3 continua como Conectado.",
    ],
  },
  {
    id: "teste",
    title: "Teste no seu número",
    why: "É a prova final: você vira o cliente por um minuto.",
    actions: [
      "Pegue o seu celular pessoal, e não o da empresa.",
      "Mande uma mensagem para o número que você conectou. Pode ser a mesma pergunta do passo 5.",
      "No app, abra a **Caixa de entrada**.",
    ],
    check: "A conversa aparece na **Caixa de entrada** e o atendente responde no seu celular.",
    stuck: [
      "A mensagem não chegou no app: abra **Canais** e veja se o WhatsApp está como Conectado. Se caiu, leia o QR Code de novo.",
      "Chegou, mas ninguém respondeu: confira se o atendente está ligado ao canal do WhatsApp.",
      "Você mandou do próprio número conectado: não funciona. Use outro celular.",
    ],
  },
];

export const CAUTIONS: readonly { title: string; detail: string }[] = [
  {
    title: "Mensagem ativa só para quem já é seu cliente",
    detail: "Pós-venda é conversa com quem comprou. Lista fria não entra aqui.",
  },
  {
    title: "Comece com poucas mensagens por dia",
    detail: "Aumente aos poucos, olhando como os clientes respondem.",
  },
  {
    title: "Número conectado por QR Code não é para disparo em massa",
    detail: "Usado assim, ele pode ser bloqueado pelo WhatsApp.",
  },
  {
    title: "Para volume, o caminho é o número oficial da Meta",
    detail: "Quando a operação crescer, migre para a conexão oficial do WhatsApp.",
  },
];

export const AFTER_CLASS: readonly { title: string; detail: string }[] = [
  {
    title: "Importe a sua carteira de clientes",
    detail:
      "Suba a planilha com nome, telefone e data da última compra. As regras passam a valer para todos.",
  },
  {
    title: "Abra a área do cliente",
    detail: "Um endereço onde o cliente acompanha pedidos e chamados sem precisar perguntar.",
  },
  {
    title: "Ligue mais canais",
    detail: "Instagram, e-mail e telefone caem na mesma Caixa de entrada.",
  },
  {
    title: "Ajuste os textos com a sua voz",
    detail: "Troque as mensagens prontas pelas palavras que a sua equipe usa no dia a dia.",
  },
];

export const STEP_IDS: readonly string[] = STEPS.map((s) => s.id);
export const PREP_IDS: readonly string[] = PREP_ITEMS.map((p) => p.id);
