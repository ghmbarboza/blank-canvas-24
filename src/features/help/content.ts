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

export const atualizadoEm = "2026-11-04";

export const faq: FaqItem[] = [
  {
    pergunta: "Como ligo a agenda do Google ou do Outlook?",
    resposta:
      "Pela mesma chave da Zernio, sem criar app no Google Cloud nem no Azure. Em Canais, na Central Tudo pela Zernio, abra Agenda e e-mail e clique em Conectar no Google ou na Microsoft: o login é feito na página da própria Zernio. Use o mesmo e-mail com que a pessoa entra no Vínculo: é por ele que os compromissos dela ficam ocupados nos links de agendamento.",
  },
  {
    pergunta: "Como conecto o WhatsApp da empresa?",
    resposta:
      "Pelo WhatsApp Oficial pela Zernio, em Canais: número oficial da Meta, vários atendentes no mesmo número sem o celular ligado e modelos aprovados para falar com o cliente depois das 24 h. É a mesma chave da Zernio que liga Instagram, Messenger, anúncios e agenda. Para casos especiais, Canais guarda outras formas de conectar num bloco avançado, fechado por padrão.",
  },
  {
    pergunta: "Meu número já está em outra ferramenta. Posso usar no Vínculo?",
    resposta:
      "Um número oficial fica ligado a uma ferramenta de atendimento por vez. Para trazer para o Vínculo, desconecte da outra ferramenta antes ou use um segundo número para testar sem derrubar o atendimento atual. Se o número está só no app WhatsApp Business do celular, a conexão oficial pela Zernio pode manter o app funcionando junto (a Meta mostra um QR para ler no app) ou levar o número só para o Vínculo: a tela pergunta qual dos dois você quer.",
  },
  {
    pergunta: "O convite não chegou por e-mail. E agora?",
    resposta:
      "Em Ajustes › Pessoas e acessos, nos convites pendentes, use Copiar link e mande pelo WhatsApp. O link vale por 72 horas e só funciona com o mesmo e-mail que foi convidado. Se expirou, convide de novo.",
  },
  {
    pergunta: "Onde coloco as chaves das integrações?",
    resposta:
      "Só pelas telas do Vínculo. A chave da Zernio (WhatsApp, redes, anúncios e agenda) fica em Canais, no passo 1 do WhatsApp Oficial. As outras (IA própria, e-mail, telefonia, reuniões e pagamentos) ficam em Ajustes › Integrações. A chave vai direto para o cofre da conta e não aparece de novo na tela. Nunca peça para guardar chave pelo chat do Lovable nem em Secrets do projeto: o Vínculo não lê chave de lá.",
  },
  {
    pergunta: "Por que a IA não respondeu uma conversa?",
    resposta:
      "Os motivos mais comuns: a IA está desligada no canal ou naquela conversa; a conversa já está com uma pessoa da equipe (use Devolver à IA no topo da conversa); nenhum agente ativo atende aquele canal (confira em Equipe de IA); está fora do horário configurado; um atendente respondeu há menos de 30 minutos; ou a conversa atingiu o limite diário de respostas da IA. O horário de atendimento e o limite de respostas ficam na configuração de cada agente, em Equipe de IA › Configurar.",
  },
  {
    pergunta: "Quanto custa usar?",
    resposta:
      "A IA vem inclusa pelo Lovable e consome o crédito do workspace do Lovable. Se preferir, cadastre sua própria chave da OpenAI ou da Anthropic em Ajustes › Integrações e a IA passa a usar a sua fatura. No WhatsApp oficial, a Meta cobra as mensagens de modelo pela tabela dela (Canais mostra os valores). Ligações cobram na conta de telefonia que você conectar.",
  },
  {
    pergunta: "Como sei de onde veio cada lead e qual campanha deu retorno?",
    resposta:
      "Toda entrada (WhatsApp, formulário, chat do site, anúncio) grava a origem do contato. O selo de origem aparece na conversa e na ficha do contato. Para ver o retorno por campanha, abra Origem dos leads no menu (gestores) ou a aba Origem dos leads em Captação.",
  },
  {
    pergunta: "Pulei a configuração inicial. Como volto?",
    resposta:
      "O botão Configurar no menu lateral (dono e administrador) mostra quantas configurações faltam e reabre a Vi no passo pendente. Para começar do zero, use Ajustes › Recursos extras › Refazer configuração inicial: a Vi volta ao primeiro passo, oferece de novo o que você tinha pulado e nada do que já foi salvo é apagado.",
  },
  {
    pergunta: "Acabei de fazer o remix. Quem é o dono?",
    resposta:
      "A primeira pessoa que se cadastra num Vínculo novo vira dona da central e cai direto na configuração com a Vi. Quem chega depois entra só por convite, enviado pelo dono ou por um administrador em Ajustes › Pessoas e acessos.",
  },
  {
    pergunta: "Qual a diferença entre os papéis?",
    resposta:
      "Dono: acesso total. Administrador: tudo do gestor, mais canais, integrações e equipe. Gestor: vê tudo e edita o funil. Atendente: vê os canais compartilhados. Vendedor: vê só os próprios canais, contatos e negócios.",
  },
  {
    pergunta: "Posso conectar o WhatsApp por QR Code?",
    resposta:
      "Pode. Em Canais, a primeira opção conecta o WhatsApp por QR Code usando um servidor de Evolution API: você cola o endereço e a chave do servidor e lê o código com o celular. É o caminho mais rápido para começar. Para volume alto de mensagens, prefira o número oficial da Meta, que fica logo abaixo na mesma tela.",
  },
  {
    pergunta: "O Vínculo já tem IA própria ou preciso contratar?",
    resposta:
      "Já tem. O agente de IA do Vínculo responde no WhatsApp, no chat do site e nas redes usando a IA inclusa do Lovable, sem chave nenhuma. Se quiser usar a sua conta da OpenAI ou da Anthropic, cadastre a chave em Ajustes › Integrações.",
  },
  {
    pergunta: "A tradução automática do navegador atrapalha?",
    resposta:
      "Pode atrapalhar: ao colar uma chave com a tradução ligada, o navegador às vezes troca letras e a chave para de funcionar. Mantenha a página em português original (recuse a tradução) nas telas de Integrações e Canais. Os campos de chave do Vínculo já pedem ao navegador para não traduzir.",
  },
  {
    pergunta: "Algumas telas do menu não aparecem. Por quê?",
    resposta:
      "O menu mostra só o que faz sentido para o seu papel e o que está ligado. Ligações aparece depois de conectar a Zadarma; Reuniões, depois do LiveKit. Recursos extras (campanhas de e-mail, automações, metas, treino e outros) aparecem quando um administrador liga em Ajustes › Recursos extras. Se alguém abrir o endereço de um extra desligado, a tela mostra Recurso desligado e o caminho para ligar.",
  },
];

export const guias: HelpGuide[] = [
  {
    slug: "whatsapp-oficial-zernio",
    titulo: "Conectar o WhatsApp Oficial pela Zernio",
    resumo: "O caminho recomendado: número oficial, sem celular ligado, vários atendentes.",
    passos: [
      "Crie a conta em zernio.com e copie a chave de API.",
      "No Vínculo, abra Canais e, em WhatsApp Oficial, salve a chave da Zernio. A tela confirma com Chave salva e testada.",
      "Clique em Conectar com o Facebook: abre a página segura da Meta para você confirmar o número da empresa.",
      "Escolha se o número continua no app WhatsApp Business junto com o Vínculo ou se passa a funcionar só aqui.",
      "Ao voltar para o Vínculo, o canal é registrado sozinho e as mensagens novas chegam na Caixa de entrada.",
    ],
    link: { to: "/canais", label: "Abrir Canais" },
  },
  {
    slug: "instagram-messenger",
    titulo: "Conectar Instagram, Messenger e outras redes",
    resumo: "Pela Zernio, sem criar app na Meta.",
    passos: [
      "Salve a chave da Zernio em Canais (é a mesma do WhatsApp Oficial).",
      "Na Central Tudo pela Zernio, em Mensagens ou Redes sociais, clique em Conectar na rede que você quer.",
      "Autorize a conta na página da rede. Ao voltar, o Vínculo busca a conta conectada.",
      "As mensagens diretas novas passam a chegar na Caixa de entrada. LinkedIn, Threads e YouTube trazem só comentários.",
    ],
    link: { to: "/canais", label: "Abrir Canais" },
  },
  {
    slug: "agenda-google-microsoft",
    titulo: "Ligar a agenda do Google ou do Outlook",
    resumo: "Pela Zernio: os compromissos de quem atende ficam ocupados nos links de agendamento.",
    passos: [
      "Salve a chave da Zernio em Canais (é a mesma do WhatsApp Oficial).",
      "Na Central Tudo pela Zernio, em Agenda e e-mail, clique em Conectar no Google Agenda e Gmail ou no Outlook e Microsoft 365.",
      "Entre com o mesmo e-mail que a pessoa usa no Vínculo e autorize a agenda e o e-mail na página da Zernio.",
      "Ao voltar, a caixa aparece como conectada. Repita para cada pessoa da equipe que recebe agendamentos.",
      "Abra um link de agendamento: os horários marcados na agenda dela já aparecem como ocupados.",
    ],
    link: { to: "/canais", label: "Abrir Canais" },
  },
  {
    slug: "campanha-whatsapp",
    titulo: "Fazer uma campanha de WhatsApp",
    resumo: "Um modelo aprovado para quem aceitou receber, disparado agora ou agendado.",
    passos: [
      "Conecte o WhatsApp Oficial pela Zernio em Canais. Campanha só sai por número oficial.",
      "No painel da Zernio, crie o modelo de mensagem do número e envie para aprovação. Só os modelos aprovados aparecem no Vínculo. Dica: termine com Responda SAIR para não receber mais.",
      "No Vínculo, abra Campanhas de WhatsApp no menu (gestores) e clique em Nova campanha.",
      "Dê um nome, escolha o número e o Modelo aprovado. Se o modelo tiver variáveis, preencha cada uma ({nome} usa o primeiro nome do contato).",
      "Em Para quem, digite as etiquetas do público (vazio = todos). A tela mostra quantos podem receber: só quem tem consentimento de marketing e não pediu para sair. Clique em Salvar rascunho.",
      "Na lista, clique em Disparar. Escolha dia e hora e clique em Agendar, ou deixe vazio e clique em Disparar agora. O envio sai em lotes de 30 por minuto e o horário silencioso adia para a manhã.",
      "Acompanhe Enviadas, Na fila, Puladas e Com erro no cartão da campanha. Agendada, use Desagendar; enviando, Cancelar envio para o que ainda não saiu.",
    ],
    link: { to: "/campanhas/whatsapp", label: "Abrir Campanhas de WhatsApp" },
  },
  {
    slug: "whatsapp-outras-formas",
    titulo: "Outras formas de conectar o WhatsApp (avançado)",
    resumo: "Para casos especiais. O caminho da empresa é o WhatsApp Oficial pela Zernio.",
    passos: [
      "Em Canais, abaixo da Central Tudo pela Zernio, abra Outras formas de conectar (avançado). O bloco fica fechado por padrão.",
      "WhatsApp com o app próprio na Meta: para quem já tem um app criado na Meta. Clique em Conectar pela Meta, preencha os dados do app e, no fim, cole no painel da Meta o endereço e o token de verificação que a tela mostra.",
      "WhatsApp por QR Code: não é oficial e mensagens em massa podem bloquear o número. Clique em Conectar por QR, informe o endereço e a chave de acesso do servidor que mantém a conexão, dê um nome ao número e leia o QR com o celular.",
      "SMS pela Zadarma: com a Zadarma conectada em Ajustes › Integrações, clique em Conectar SMS e informe o número virtual. Para receber SMS, ligue o aviso de SMS recebido na Zadarma com o endereço que a tela mostra.",
      "Em qualquer caso, mande uma mensagem de teste e confira a conversa na Caixa de entrada.",
    ],
    link: { to: "/canais", label: "Abrir Canais" },
  },
  {
    slug: "ligacoes-zadarma-elevenlabs",
    titulo: "Ligar e atender pelo telefone (Zadarma e ElevenLabs)",
    resumo:
      "A equipe liga pelo navegador com a Zadarma; a IA de voz atende e liga com a ElevenLabs.",
    passos: [
      "Crie a conta na Zadarma e coloque crédito. Em Ajustes › Integrações, clique em Configurar na Zadarma, cole a Key e o Secret e clique em Testar.",
      "Em Ajustes › Telefonia, copie o Webhook de ligações e cole no painel da Zadarma, em API › Notificações. Ali também ficam o saldo e o aviso de saldo baixo.",
      "Ainda em Telefonia, cadastre os Números, crie um ramal para cada vendedor (Criar ramal) e monte as Filas. Ligações aparece no menu e o botão do telefone, no canto da tela, liga e atende pelo navegador.",
      "Para a IA de voz: crie a conta na ElevenLabs, gere a chave e cole em Ajustes › Integrações › ElevenLabs.",
      "Abra Ligações › Agentes de voz › Novo agente e comece por um modelo pronto. Converse em Testar por texto (não gasta crédito) e clique em Publicar na ElevenLabs.",
      "Em Ajustes › Telefonia › Números, escolha o agente em Quem atende. Para a IA ligar para uma lista, use Ligações › Campanhas de voz › Nova campanha, com um segmento, um agente publicado e a janela de horário.",
    ],
    link: { to: "/ajustes", aba: "telefonia", label: "Abrir Telefonia" },
  },
  {
    slug: "agente-de-ia",
    titulo: "Criar e ajustar o agente de IA",
    resumo: "O agente responde no WhatsApp e no chat do site e passa para a equipe quando precisa.",
    passos: [
      "Abra Equipe de IA no menu (gestores). Se ainda não há agente, monte a equipe a partir de um modelo.",
      "Em Configurar, ajuste o jeito de falar, as regras e quando passar para uma pessoa.",
      "Use o Simulador para conversar com o agente como se fosse um cliente antes de ligar no atendimento.",
      "Para ajustar conversando, use o botão Vi no menu lateral.",
      "Acompanhe em Equipe de IA quantas conversas a IA está atendendo e quantas passou para a equipe.",
    ],
    link: { to: "/equipe-ia", label: "Abrir Equipe de IA" },
  },
  {
    slug: "chat-do-site",
    titulo: "Colocar o chat no site",
    resumo: "O visitante conversa no site e a conversa cai na Caixa de entrada.",
    passos: [
      "Abra Captação no menu e vá à aba Chat do site.",
      "Ajuste o nome e a saudação e clique em Criar chat do site.",
      "Em Código para o site, clique em Copiar código e cole antes do fechamento do </body> do seu site.",
      "Abra o site, mande uma mensagem e confira a conversa no canal Chat do site da Caixa de entrada.",
    ],
    link: { to: "/formularios", label: "Abrir Captação" },
  },
  {
    slug: "formulario-com-consentimento",
    titulo: "Criar um formulário com consentimento (LGPD)",
    resumo: "Quem preenche vira contato, com a origem e a prova do aceite gravadas.",
    passos: [
      "Abra Captação no menu e clique em Novo formulário.",
      "Escolha os campos (nome, e-mail, telefone e os que precisar).",
      "Em Consentimento (LGPD), ligue o aceite e revise o texto que o visitante vai marcar.",
      "Publique e use o link no anúncio ou no site. Cada envio aparece em Respostas e o contato chega com a origem.",
      "Para parar de receber, desligue a chave No ar em vez de excluir: excluído, o link público para de funcionar na hora.",
    ],
    link: { to: "/formularios", label: "Abrir Captação" },
  },
  {
    slug: "caixa-de-entrada",
    titulo: "Atender pela Caixa de entrada",
    resumo: "Uma caixa para todos os canais, com a IA e a equipe trabalhando juntas.",
    passos: [
      "Abra Caixa de entrada (ou Minha fila, para ver o que é seu agora).",
      "Escolha a conversa. O selo mostra o canal e a origem do contato.",
      "Responda em Resposta ou deixe um recado para a equipe em Nota interna, que o cliente não vê.",
      "Use as respostas rápidas para os textos que se repetem.",
      "Quando terminar, devolva à IA, adie ou abra um chamado se o caso precisar de acompanhamento.",
    ],
    link: { to: "/inbox", label: "Abrir Caixa de entrada" },
  },
  {
    slug: "funil-e-origem",
    titulo: "Funil de vendas e retorno das campanhas",
    resumo: "Do lead ao negócio fechado, sabendo qual campanha trouxe cada venda.",
    passos: [
      "Abra Funil de vendas e crie um negócio, ou abra a ficha do contato.",
      "Arraste o negócio entre as etapas conforme a conversa avança. Ao perder, informe o motivo.",
      "O Painel mostra a previsão ponderada e o que precisa de você hoje.",
      "Em Origem dos leads (gestores), veja quantos leads e quanto de venda veio de cada canal, anúncio e campanha.",
    ],
    link: { to: "/crm", label: "Abrir Funil de vendas" },
  },
  {
    slug: "equipe-e-papeis",
    titulo: "Convidar a equipe e escolher papéis",
    resumo: "Cada pessoa vê só o que o papel dela precisa.",
    passos: [
      "Abra Ajustes › Pessoas e acessos (dono ou administrador).",
      "Clique em Convidar pessoa, informe o e-mail e o papel: administrador, gestor, atendente ou vendedor.",
      "O convite vai por e-mail. Se não chegar, use Copiar link nos convites pendentes e mande pelo WhatsApp. Vale por 72 horas.",
      "A pessoa entra com o mesmo e-mail convidado. Para mudar o papel ou desativar alguém, use a lista de pessoas.",
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
  {
    id: "whatsapp",
    titulo: "WhatsApp e redes",
    guias: [
      "whatsapp-oficial-zernio",
      "instagram-messenger",
      "campanha-whatsapp",
      "whatsapp-outras-formas",
    ],
  },
  { id: "agente", titulo: "Agente de IA", guias: ["agente-de-ia"] },
  { id: "ligacoes", titulo: "Ligações", guias: ["ligacoes-zadarma-elevenlabs"] },
  {
    id: "atender",
    titulo: "Atender e captar",
    guias: ["caixa-de-entrada", "chat-do-site", "formulario-com-consentimento"],
  },
  { id: "vender", titulo: "Vendas e origem dos leads", guias: ["funil-e-origem"] },
  { id: "agenda", titulo: "Agenda e reuniões", guias: ["agenda-google-microsoft"] },
  { id: "equipe", titulo: "Equipe e convites", guias: ["equipe-e-papeis"] },
];

/** Guia de "Como pegar esta chave" por provedor/canal (usado nas telas de integração). */
export const GUIA_DO_PROVEDOR: Record<string, string> = {
  zernio: "whatsapp-oficial-zernio",
  google: "agenda-google-microsoft",
  microsoft: "agenda-google-microsoft",
  whatsapp_cloud: "whatsapp-outras-formas",
  meta: "whatsapp-outras-formas",
  evolution: "whatsapp-outras-formas",
  zadarma: "ligacoes-zadarma-elevenlabs",
  elevenlabs: "ligacoes-zadarma-elevenlabs",
  instagram: "instagram-messenger",
  messenger: "instagram-messenger",
  webchat: "chat-do-site",
  openai: "agente-de-ia",
  anthropic: "agente-de-ia",
};
