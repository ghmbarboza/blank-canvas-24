// Matriz "pedido do dono → ferramenta": o mapa do que a assistente faz pela conversa. É a
// referência do produto (o que ela cobre) e a base do teste do roteador de ferramentas: cada linha
// roda com um modelo simulado e precisa cair na ferramenta certa, com argumentos válidos.
export interface MatrixRow {
  /** assunto, para o relatório */
  area: string;
  /** como o dono pede, em português comum */
  pedido: string;
  ferramenta: string;
  /** argumentos que o modelo manda para esse pedido */
  args: Record<string, unknown>;
}

export const MATRIX: readonly MatrixRow[] = [
  // empresa
  {
    area: "Empresa",
    pedido: "minha loja é a Bela Casa, vendo móveis planejados",
    ferramenta: "salvar_empresa",
    args: { nome: "Bela Casa", ramo: "varejo", o_que_vende: "móveis planejados" },
  },
  {
    area: "Empresa",
    pedido: "muda o tom pra mais descontraído",
    ferramenta: "salvar_empresa",
    args: { tom: "descontraído e próximo" },
  },
  {
    area: "Empresa",
    pedido: "a gente atende de segunda a sábado das 9 às 18",
    ferramenta: "salvar_empresa",
    args: { horario: "segunda a sábado, das 9h às 18h" },
  },
  {
    area: "Empresa",
    pedido: "anota aí que a gente fica em Campinas",
    ferramenta: "guardar_informacao",
    args: { chave: "cidade", rotulo: "Cidade", valor: "Campinas", categoria: "empresa" },
  },
  {
    area: "Empresa",
    pedido: "isso da cidade tá errado, apaga",
    ferramenta: "apagar_informacao",
    args: { chave: "cidade" },
  },
  { area: "Empresa", pedido: "como tá a configuração?", ferramenta: "ver_progresso", args: {} },
  // WhatsApp
  {
    area: "WhatsApp",
    pedido: "quero conectar o zap da empresa",
    ferramenta: "conectar_whatsapp",
    args: {},
  },
  {
    area: "WhatsApp",
    pedido: "o endereço é https://evo.belacasa.com.br e a chave é abc123XYZ",
    ferramenta: "conectar_whatsapp",
    args: { endereco: "https://evo.belacasa.com.br", chave: "abc123XYZ" },
  },
  {
    area: "WhatsApp",
    pedido: "o qr code venceu, gera outro",
    ferramenta: "conectar_whatsapp",
    args: { novo_qr: true },
  },
  { area: "WhatsApp", pedido: "o whatsapp tá conectado?", ferramenta: "ver_whatsapp", args: {} },
  { area: "WhatsApp", pedido: "desconecta o número", ferramenta: "desconectar_whatsapp", args: {} },
  // Instagram
  {
    area: "Instagram",
    pedido: "quero ligar o instagram, a chave é sk_FakeZernio1234567890abcd",
    ferramenta: "conectar_zernio",
    args: { chave: "sk_FakeZernio1234567890abcd" },
  },
  {
    area: "Instagram",
    pedido: "abre a conexão do instagram",
    ferramenta: "link_zernio",
    args: { opcao: "instagram" },
  },
  { area: "Instagram", pedido: "o instagram conectou?", ferramenta: "conferir_zernio", args: {} },
  // base de conhecimento
  {
    area: "Base de conhecimento",
    pedido: "troca em até 30 dias com nota fiscal, guarda isso",
    ferramenta: "guardar_conhecimento",
    args: { titulo: "Política de troca", conteudo: "Troca em até 30 dias, com nota fiscal." },
  },
  {
    area: "Base de conhecimento",
    pedido: "lê essa página de dúvidas: belacasa.com.br/duvidas",
    ferramenta: "ler_site",
    args: { url: "belacasa.com.br/duvidas", guardar_na_biblioteca: true },
  },
  {
    area: "Base de conhecimento",
    pedido: "o que o atendente já sabe?",
    ferramenta: "listar_conhecimento",
    args: {},
  },
  {
    area: "Base de conhecimento",
    pedido: "apaga a política de troca antiga",
    ferramenta: "apagar_conhecimento",
    args: { titulo: "Política de troca" },
  },
  // atendente
  {
    area: "Atendente de IA",
    pedido: "cria o atendente, o nome dele é Bia",
    ferramenta: "configurar_atendente",
    args: { ligado: true, nome: "Bia" },
  },
  {
    area: "Atendente de IA",
    pedido: "desliga o atendente por enquanto",
    ferramenta: "configurar_atendente",
    args: { ligado: false },
  },
  {
    area: "Atendente de IA",
    pedido: "seja mais direto e nunca prometa prazo",
    ferramenta: "configurar_atendente",
    args: { orientacoes: ["Seja direto, com respostas curtas", "Nunca prometa prazo"] },
  },
  {
    area: "Atendente de IA",
    pedido: "quando não souber, fala que vai chamar alguém",
    ferramenta: "configurar_atendente",
    args: { quando_nao_sabe: "diga que vai chamar uma pessoa da equipe" },
  },
  {
    area: "Atendente de IA",
    pedido: "passa pra humano quando o cliente reclamar",
    ferramenta: "configurar_atendente",
    args: { passar_para_humano: "o cliente reclamar ou pedir para falar com uma pessoa" },
  },
  {
    area: "Atendente de IA",
    pedido: "muda a saudação pra: Oi! Aqui é a Bia da Bela Casa",
    ferramenta: "configurar_atendente",
    args: { saudacao: "Oi! Aqui é a Bia da Bela Casa" },
  },
  {
    area: "Atendente de IA",
    pedido: "pergunta como se fosse cliente: qual o prazo de entrega?",
    ferramenta: "testar_atendente",
    args: { pergunta: "Qual o prazo de entrega?" },
  },
  // regras
  {
    area: "Regras de pós-venda",
    pedido: "liga tudo",
    ferramenta: "configurar_regras",
    args: { todas: "ligar" },
  },
  {
    area: "Regras de pós-venda",
    pedido: "desliga tudo",
    ferramenta: "configurar_regras",
    args: { todas: "desligar" },
  },
  {
    area: "Regras de pós-venda",
    pedido: "avisa na recompra em 60 dias",
    ferramenta: "configurar_regras",
    args: { regras: [{ regra: "recompra", ligada: true, dias: 60 }] },
  },
  {
    area: "Regras de pós-venda",
    pedido: "muda a mensagem de boas-vindas",
    ferramenta: "configurar_regras",
    args: {
      regras: [{ regra: "boas_vindas", mensagem: "Oi {{primeiro_nome}}! Obrigado pela compra." }],
    },
  },
  {
    area: "Regras de pós-venda",
    pedido: "no máximo 20 mensagens por dia",
    ferramenta: "configurar_regras",
    args: { teto_diario: 20 },
  },
  {
    area: "Regras de pós-venda",
    pedido: "quais regras estão ligadas?",
    ferramenta: "ver_regras",
    args: {},
  },
  // equipe
  {
    area: "Equipe",
    pedido: "convida a ana@belacasa.com.br como atendente",
    ferramenta: "convidar_pessoa",
    args: { email: "ana@belacasa.com.br", papel: "agent" },
  },
  { area: "Equipe", pedido: "quem tem acesso?", ferramenta: "listar_equipe", args: {} },
  {
    area: "Equipe",
    pedido: "a Ana agora é gestora",
    ferramenta: "mudar_papel",
    args: { pessoa: "Ana", papel: "gestor" },
  },
  // clientes
  {
    area: "Clientes",
    pedido: "cadastra a Maria Silva, 11 98888-7777",
    ferramenta: "cadastrar_clientes",
    args: { clientes: [{ nome: "Maria Silva", telefone: "11 98888-7777" }] },
  },
  {
    area: "Clientes",
    pedido: "importa essa lista: (lista colada)",
    ferramenta: "cadastrar_clientes",
    args: { lista: "Maria Silva, 11 98888-7777\nJoão Souza 19 97777-6666" },
  },
  {
    area: "Clientes",
    pedido: "o João já é cliente",
    ferramenta: "marcar_cliente",
    args: { pessoa: "João", cliente: true },
  },
  {
    area: "Clientes",
    pedido: "quantos clientes em risco?",
    ferramenta: "consultar_clientes",
    args: {},
  },
  // catálogo
  {
    area: "Catálogo",
    pedido: "meu site é belacasa.com.br, lê lá o que eu vendo",
    ferramenta: "importar_do_site",
    args: { url: "belacasa.com.br" },
  },
  {
    area: "Catálogo",
    pedido: "adiciona o sofá Oslo por 3.499,90",
    ferramenta: "cadastrar_produto",
    args: { nome: "Sofá Oslo", preco: "3499,90", tipo: "produto" },
  },
  {
    area: "Catálogo",
    pedido: "o sofá Oslo agora custa 3.200",
    ferramenta: "cadastrar_produto",
    args: { nome: "Sofá Oslo", preco: "3200" },
  },
  { area: "Catálogo", pedido: "o que tem no catálogo?", ferramenta: "listar_catalogo", args: {} },
  {
    area: "Catálogo",
    pedido: "tira a mesa Lisboa do catálogo",
    ferramenta: "remover_produto",
    args: { nome: "Mesa Lisboa" },
  },
  // estado geral
  { area: "Estado geral", pedido: "o que falta configurar?", ferramenta: "diagnostico", args: {} },
  { area: "Estado geral", pedido: "tá tudo funcionando?", ferramenta: "diagnostico", args: {} },
  // outros
  {
    area: "Outros",
    pedido: "liga as metas no menu",
    ferramenta: "ligar_recurso",
    args: { recurso: "metas", ligado: true },
  },
  {
    area: "Outros",
    pedido: "queria que mandasse boleto",
    ferramenta: "registrar_desejo",
    args: { titulo: "Enviar boleto", descricao: "Mandar boleto pelo WhatsApp" },
  },
  {
    area: "Outros",
    pedido: "prefiro preencher a empresa pela tela",
    ferramenta: "abrir_passo",
    args: { passo: "empresa" },
  },
  {
    area: "Outros",
    pedido: "me mostra a caixa de entrada",
    ferramenta: "abrir_tela",
    args: { rota: "/inbox", rotulo: "Abrir a Caixa de entrada" },
  },
];
