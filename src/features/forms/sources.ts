// Portas de entrada de lead: nomes para a tela e o código de incorporação do formulário.
export const SOURCE_LABEL: Record<string, string> = {
  form: "Formulário",
  landing: "Landing page",
  meta_ads: "Anúncio Meta",
  google_ads: "Google Ads",
  api: "API",
  webchat: "Chat do site",
};

export function formEmbedCode(origin: string, accountId: string, formId: string): string {
  return `<div data-nexus-form="${formId}"></div>\n<script src="${origin}/api/public/widget.js" data-account="${accountId}" async></script>`;
}

export function ownerModeLabel(mode: string | undefined): string {
  if (mode === "round_robin") return "rodízio de vendedores";
  if (mode === "user") return "responsável fixo";
  return "sem responsável automático";
}
