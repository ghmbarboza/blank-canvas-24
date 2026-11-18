// Marca do produto, num lugar só. Trocar o nome aqui troca no app inteiro.
export const BRAND = {
  /** Nome do produto. */
  name: "Central de CS",
  /** Frase curta que acompanha o nome. */
  tagline: "Pós-venda no WhatsApp e Instagram",
  /** Descrição de uma linha (metadados da página, tela de entrada). */
  description:
    "Central de Customer Success: atendimento com IA no WhatsApp e no Instagram, pesquisa de satisfação, saúde da carteira e recompra.",
  /** Nome sem acento, para endereços, cabeçalhos e identificadores que saem do app. */
  slug: "vinculo",
  /** Nome da assistente que conduz a configuração no primeiro acesso. */
  assistant: "Cris",
  assistantRole: "sua guia de implantação",
  /** Cor do tema (barra do navegador). Azul-marinho do G4. */
  themeColor: "#001F35",
  /** Projeto de origem no Lovable, de onde o aluno faz a cópia (remix). */
  sourceProjectUrl: "https://lovable.dev/projects/eb8a8a98-385c-4b36-a07e-ae78fe7129cb",
  remixUrl: "https://lovable.dev/projects/eb8a8a98-385c-4b36-a07e-ae78fe7129cb/remix",
} as const;

/** Título de aba no padrão do app: "Tela · Central de CS". */
export function brandTitle(page?: string): string {
  return page ? `${page} · ${BRAND.name}` : `${BRAND.name} · ${BRAND.tagline}`;
}
