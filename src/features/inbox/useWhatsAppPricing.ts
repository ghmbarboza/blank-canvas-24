import { useAccount } from "@/lib/account";

import { normalizePricing, type WhatsAppPricing } from "./whatsapp-pricing";

/** Tabela de preço do WhatsApp da conta atual (settings.whatsapp_pricing, com padrões). */
export function useWhatsAppPricing(): WhatsAppPricing {
  const { current } = useAccount();
  const settings = (current?.settings ?? {}) as Record<string, unknown>;
  return normalizePricing(settings["whatsapp_pricing"]);
}
