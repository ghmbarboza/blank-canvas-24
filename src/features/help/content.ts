// Central de ajuda de quem opera o Vínculo (dono, gestor, atendente, vendedor).
// Não confundir com /ajuda/$slug, que é a central pública que o cliente final da empresa vê.
// Texto conferido contra as telas desta versão: ao mudar um caminho de tela, ajuste aqui.
import type { LinkProps } from "@tanstack/react-router";

import type { SettingsTab } from "@/features/settings/tabs";

export interface HelpLink {
  to: NonNullable<LinkProps["to"]>;
  /** aba de Ajustes, quando o link aponta para /ajustes */
  aba?: SettingsTab;
  label: string;
}

export interface FaqItem {
  pergunta: string;
  resposta: string;
}

export interface HelpGuide {
  slug: string;
  titulo: string;
  resumo: string;
  passos: string[];
  link?: HelpLink;
}

export const atualizadoEm = "2026-11-18";

export const faq: FaqItem[] = [
  {
    pergunta: "Como conecto o WhatsApp da empresa?",
    resposta:
      "Por QR Code, em Canais. Você cola o endereço e a chave do servidor do WhatsApp (os dois chegam por e-mail do provedor), lê o código com o celular da empresa e pronto. O guia Conectar o WhatsApp por QR Code mostra o passo a passo.",
  },
  {
    pergunta: "O WhatsApp caiu. O que eu faço?",
    resposta:
      "Abra Canais e veja o cartão do número. Se não estiver como Conectado, clique nos três pontinhos, escolha Ver QR de novo e leia o código com o celular da empresa. Enquanto o número está fora, as mensagens não chegam e as regras de pós-venda não disparam.",
  },
  {
    pergunta: "Posso mandar mensagem para uma lista grande de uma vez?",
    resposta:
      "Não é o uso deste app. O número conectado por QR Code serve para conversar com quem já é seu cliente. Disparo em massa para desconhecidos pode fazer o WhatsApp bloquear o número. As Regras de pós-venda já mandam as mensagens aos poucos, na hora certa de cada cliente.",
  },
  {
    pergunta: "Dá para atender o Instagram também?",
    resposta:
      "Dá, e é opcional. Em Canais, no cartão Instagram, salve a chave da Zernio (o serviço que liga o Instagram à central) e autorize a conta da empresa. As mensagens diretas passam a chegar na mesma Caixa de entrada do WhatsApp.",
  },
  {
    pergunta: "Como a pessoa convidada recebe o convite?",
    resposta:
      "O convite gera um link. Copie e mande para a pessoa pelo WhatsApp. O link vale por 3 dias, funciona uma vez só e a pessoa precisa entrar com o mesmo e-mail que você convidou. Se você fechou a janela sem copiar, o link continua em Ajustes › Pessoas e acessos, nos convites pendentes, no botão Copiar link. Se venceu, convide de novo.",
  },
  {
    pergunta: "Onde coloco as chaves?",
    resposta:
      "Só pelas telas do Vínculo, em Canais: o endereço e a chave do servidor do WhatsApp no cartão WhatsApp por QR Code, e a chave da Zernio no cartão Instagram. Ajustes › Integrações mostra se cada uma está funcionando. A chave vai direto para o cofre da conta e não aparece de novo na tela. Nunca peça para guardar chave pelo chat do Lovable nem em Secrets do projeto: o Vínculo não lê chave de lá.",
  },
  {
    pergunta: "Por que a IA não respondeu uma conversa?",
    resposta:
      "Os motivos mais comuns: a IA está desligada no canal ou naquela conversa; a conversa já está com uma pessoa da equipe (use Devolver à IA no topo da conversa); nenhum agente ativo atende aquele canal (confira em Equipe de IA); está fora do horário configurado; um atendente respondeu há menos de 30 minutos; ou a conversa atingiu o limite diário de respostas da IA. O horário de atendimento e o limite de respostas ficam na configuração de cada agente, em Equipe de IA › Configurar.",
  },
  {
    pergunta: "A IA respondeu de forma genérica. Como melhoro?",
    resposta:
      "Ela só responde bem sobre o que leu. Abra Chamados › Base de conhecimento e acrescente um artigo com a informação que faltou (prazo, troca, garantia, preço). Depois teste a mesma pergunta em Equipe de IA, na aba Testar do agente.",
  },
  {
    pergunta: "O Vínculo já tem IA ou preciso contratar?",
    resposta:
      "Já tem. O atendente de IA responde no WhatsApp usando a IA inclusa do Lovable, sem chave nenhuma. O uso consome o crédito do workspace do Lovable onde a sua cópia mora.",
  },
  {
    pergunta: "Pulei a configuração inicial. Como volto?",
    resposta:
      "O botão Configurar no menu lateral (dono e administrador) mostra quantas configurações faltam e reabre a Vi no passo pendente. Para começar do zero, use Ajustes › Recursos extras › Refazer configuração inicial: a Vi volta ao primeiro passo, oferece de novo o que você tinha pulado e nada do que já foi salvo é apagado.",
  },
  {
    pergunta: "Acabei de fazer a minha cópia (remix). Quem é o dono?",
    resposta:
      "A primeira pessoa que se cadastra num Vínculo novo vira dona da central e cai direto na configuração com a Vi. Quem chega depois entra só por convite, criado pelo dono ou por um administrador em Ajustes › Pessoas e acessos.",
  },
  {
    pergunta: "Qual a diferença entre os papéis?",
    resposta:
      "Dono: acesso total. Administrador: tudo do gestor, mais canais, integrações e equipe. Gestor: vê tudo e mexe nas regras e na carteira. Atendente: vê os canais compartilhados. Vendedor: vê só os próprios canais, clientes e negócios.",
  },
  {
    pergunta: "A tradução automática do navegador atrapalha?",
    resposta:
      "Pode atrapalhar: ao colar uma chave com a tradução ligada, o navegador às vezes troca letras e a chave para de funcionar. Mantenha a página em português original (recuse a tradução) na tela de Canais. Os campos de chave do Vínculo já pedem ao navegador para não traduzir.",
  },
  {
    pergunta: "Algumas telas do menu não aparecem. Por quê?",
    resposta:
      "O menu mostra só o que faz sentido para o seu papel e o que está ligado. Recursos extras (Meu dia, Automações, Saúde da carteira e outros) aparecem quando um administrador liga em Ajustes › Recursos extras. Se alguém abrir o endereço de um extra desligado, a tela mostra Recurso desligado e o caminho para ligar.",
  },
];

export const guias: HelpGuide[] = [
  {
    slug: "whatsapp-qr-code",
    titulo: "Conectar o WhatsApp por QR Code",
    resumo: "O número que a empresa já usa, ligado em poucos minutos.",
    passos: [
      "Tenha em mãos o endereço e a chave do servidor do WhatsApp. Os dois chegam por e-mail do provedor que você contratou.",
      "No menu, abra Configuração › Canais. No cartão WhatsApp por QR Code, cole o endereço (começa com https://) e a chave.",
      "Vai aparecer um QR Code na tela.",
      "No celular da empresa, abra o WhatsApp, entre em Dispositivos conectados, toque em Conectar um dispositivo e aponte a câmera para o código.",
      "Quando o canal aparecer como Conectado, mande uma mensagem de outro celular e confira a conversa na Caixa de entrada.",
    ],
    link: { to: "/canais", label: "Abrir Canais" },
  },
  {
    slug: "instagram",
    titulo: "Conectar o Instagram",
    resumo: "Opcional: as mensagens diretas chegam na mesma Caixa de entrada do WhatsApp.",
    passos: [
      "O Instagram da empresa precisa ser uma conta profissional.",
      "Crie a conta em zernio.com e copie a chave de API. A Zernio é o serviço que liga o Instagram à central.",
      "No Vínculo, abra Configuração › Canais. No cartão Instagram, cole a chave da Zernio e salve. Faz uma vez só.",
      "Clique em Conectar o Instagram, entre na conta da empresa na página do Instagram e autorize.",
      "Ao voltar, o canal aparece como Conectado e as mensagens diretas novas chegam na Caixa de entrada.",
    ],
    link: { to: "/canais", label: "Abrir Canais" },
  },
  {
    slug: "base-de-conhecimento",
    titulo: "Subir a base de conhecimento",
    resumo: "O material que o atendente de IA lê antes de responder.",
    passos: [
      "Junte o que os clientes sempre perguntam: prazo, troca, garantia, preço, horário, formas de pagamento.",
      "No menu, abra Chamados e clique em Base de conhecimento.",
      "Clique em Novo artigo, dê um título claro (por exemplo, Política de troca) e escreva ou cole o texto.",
      "Salve e repita para cada assunto. Artigo curto, com um assunto só, funciona melhor.",
      "Tem o material em PDF? No botão Configurar do menu lateral, a Vi recebe o arquivo no passo da base de conhecimento.",
    ],
    link: { to: "/atendimento/base", label: "Abrir Base de conhecimento" },
  },
  {
    slug: "atendente-de-ia",
    titulo: "Criar e testar o atendente de IA",
    resumo: "Ele responde no WhatsApp e passa para a equipe quando precisa.",
    passos: [
      "Abra Equipe de IA no menu (gestores) e clique em Novo agente. Comece pelo modelo de pós-venda.",
      "Abra o agente e, em Configurar, ajuste o nome, o jeito de falar e quando passar para uma pessoa.",
      "Na aba Testar, faça uma pergunta cuja resposta está na base de conhecimento. Por exemplo: qual é o prazo de troca?",
      "Se a resposta vier genérica, acrescente o assunto na Base de conhecimento e teste de novo.",
      "Para ajustar conversando, use o botão Configurar no menu lateral e fale com a Vi.",
    ],
    link: { to: "/equipe-ia", label: "Abrir Equipe de IA" },
  },
  {
    slug: "regras-de-pos-venda",
    titulo: "Ligar as regras de pós-venda",
    resumo: "Mensagens que saem sozinhas na hora certa de cada cliente.",
    passos: [
      "Abra Regras de pós-venda no menu (gestores).",
      "Ligue as regras que fazem sentido: Boas-vindas, Check-in de 7 dias, Pesquisa de satisfação, Nota baixa vira chamado, Nota alta pede indicação, Hora de comprar de novo e Cliente parado.",
      "Cada regra já vem com um texto pronto. Troque as palavras pelo jeito da sua empresa e ajuste os dias, quando a regra tiver.",
      "Confira se o WhatsApp está conectado: sem número, as regras ficam ligadas mas as mensagens não saem.",
      "Em Ajustes › Recursos extras, deixe Automações ligado. É ele que faz as regras dispararem.",
    ],
    link: { to: "/pos-venda", label: "Abrir Regras de pós-venda" },
  },
  {
    slug: "caixa-de-entrada",
    titulo: "Atender pela Caixa de entrada",
    resumo: "Todas as conversas num lugar só, com a IA e a equipe trabalhando juntas.",
    passos: [
      "Abra Caixa de entrada (ou Minha fila, para ver o que é seu agora).",
      "Escolha a conversa. O selo mostra por onde o cliente falou.",
      "Responda em Resposta ou deixe um recado para a equipe em Nota interna, que o cliente não vê.",
      "Use as Respostas rápidas para os textos que se repetem.",
      "Quando terminar, use Devolver à IA, ou clique em Abrir chamado se o caso precisar de acompanhamento.",
    ],
    link: { to: "/inbox", label: "Abrir Caixa de entrada" },
  },
  {
    slug: "chamados",
    titulo: "Acompanhar chamados",
    resumo: "O que precisa de solução fica registrado, com dono e prazo.",
    passos: [
      "Abra Chamados no menu.",
      "Clique em Novo chamado, ou use Abrir chamado no topo de uma conversa da Caixa de entrada.",
      "Diga o que o cliente precisa e quem cuida do caso.",
      "Atualize o chamado conforme o caso anda e encerre quando estiver resolvido.",
      "Com a regra Nota baixa vira chamado ligada, a nota ruim na pesquisa já abre um chamado sozinha.",
    ],
    link: { to: "/atendimento", label: "Abrir Chamados" },
  },
  {
    slug: "pesquisa-de-satisfacao",
    titulo: "Pesquisa de satisfação",
    resumo: "A nota de cada cliente, pedida pelo WhatsApp.",
    passos: [
      "O jeito mais simples: em Regras de pós-venda, ligue Pesquisa de satisfação. Ela sai sozinha alguns dias depois da compra.",
      "Ligue também Nota baixa vira chamado e Nota alta pede indicação, para agir em cima da resposta.",
      "Para perguntar a todos de uma vez, abra Chamados, entre na aba Pesquisas (CSAT e NPS) e clique em Nova pesquisa.",
      "Escreva a pergunta, escolha quem recebe, revise e clique em Enviar.",
      "As notas aparecem na mesma aba e em Relatórios.",
    ],
    link: { to: "/atendimento", label: "Abrir Chamados" },
  },
  {
    slug: "equipe-e-papeis",
    titulo: "Convidar a equipe e escolher papéis",
    resumo: "Cada pessoa vê só o que o papel dela precisa.",
    passos: [
      "Abra Ajustes › Pessoas e acessos (dono ou administrador).",
      "Clique em Convidar pessoa, informe o e-mail dela e o papel: administrador, gestor, atendente ou vendedor.",
      "O convite gera um link. Copie e mande para a pessoa pelo WhatsApp. Vale por 3 dias e funciona uma vez só.",
      "A pessoa abre o link e entra com o mesmo e-mail convidado.",
      "Perdeu o link? Ele fica nos convites pendentes, no botão Copiar link. Para mudar o papel ou desativar alguém, use a lista de pessoas.",
    ],
    link: { to: "/ajustes", aba: "equipe", label: "Abrir Pessoas e acessos" },
  },
];

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Busca sem acento e sem caixa; todas as palavras precisam aparecer. */
export function matches(query: string, ...texts: string[]): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = fold(texts.join(" "));
  return words.every((w) => hay.includes(w));
}

export function searchHelp(query: string): { faq: FaqItem[]; guias: HelpGuide[] } {
  return {
    faq: faq.filter((f) => matches(query, f.pergunta, f.resposta)),
    guias: guias.filter((g) => matches(query, g.titulo, g.resumo, ...g.passos)),
  };
}

export function guideBySlug(slug: string): HelpGuide | undefined {
  return guias.find((g) => g.slug === slug);
}

/** Seções da página de Ajuda (padrão HelpPage do DS): cada guia mora num tema. */
export interface HelpTopic {
  id: string;
  titulo: string;
  guias: string[];
}

export const temas: HelpTopic[] = [
  { id: "canais", titulo: "Conectar os canais", guias: ["whatsapp-qr-code", "instagram"] },
  {
    id: "agente",
    titulo: "Atendente de IA",
    guias: ["base-de-conhecimento", "atendente-de-ia"],
  },
  {
    id: "posvenda",
    titulo: "Pós-venda automático",
    guias: ["regras-de-pos-venda", "pesquisa-de-satisfacao"],
  },
  { id: "atender", titulo: "Atender", guias: ["caixa-de-entrada", "chamados"] },
  { id: "equipe", titulo: "Equipe e convites", guias: ["equipe-e-papeis"] },
];

/** Guia de "Como pegar esta chave" por provedor/canal (usado nas telas de integração). */
export const GUIA_DO_PROVEDOR: Record<string, string> = {
  evolution: "whatsapp-qr-code",
  zernio: "instagram",
  instagram: "instagram",
};
