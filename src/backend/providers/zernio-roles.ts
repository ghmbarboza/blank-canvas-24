// Quem pode cada ação da Zernio. Chave, conexão, compra e portabilidade de número custam dinheiro
// ou mudam a conta: só administrador. Atender (mensagem, ligação pelo WhatsApp) é de todo membro.
export const ADMIN_ACTIONS = new Set([
  "key.save",
  "key.test",
  "whatsapp.connect_url",
  "whatsapp.connected",
  "social.connect_url",
  "hub.connect",
  "sync",
  "numbers.catalog",
  "numbers.list",
  "numbers.kyc_link",
  "numbers.purchase",
  "port.check",
  "voice.save",
  "calling.get",
  "calling.save",
]);
export const MANAGER_ACTIONS = new Set([
  "health",
  // transferir ligação em curso para outro número: só gestor (S10)
  "call.transfer",
  "hub",
  "social_auto.list",
  "social_auto.create",
  "social_auto.toggle",
  "social_auto.remove",
  "social_auto.draft",
]);

export function zernioRole(action: string): "admin" | "manager" | "member" {
  if (ADMIN_ACTIONS.has(action)) return "admin";
  if (MANAGER_ACTIONS.has(action)) return "manager";
  return "member";
}
