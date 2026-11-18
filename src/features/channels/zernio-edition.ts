// O que a edição aceita da Zernio. Fonte única para o chat da Cris (link_zernio) e para a
// sincronização de contas: sem isso, salvar a chave trazia para a central TODA conta que a pessoa
// já tinha na Zernio (visto em 18/11: o WhatsApp oficial de outra operação virou canal da cópia,
// com o atendente de IA ligado), quando a edição só oferece o Instagram.
import { EDITION, hasChannel, type Edition, type EditionChannel } from "@/lib/edition";

/** Opção da Zernio (id usado em link_zernio e `platform` da conta) e o canal da edição. */
export const ZERNIO_OPTION_CHANNEL: Record<string, EditionChannel> = {
  whatsapp: "whatsapp_official",
  instagram: "instagram",
  facebook: "messenger",
  telegram: "telegram",
  tiktok: "tiktok",
  linkedin: "linkedin",
  twitter: "x",
  youtube: "youtube",
  threads: "threads",
};

/** A edição oferece esta opção da Zernio? Fora da tabela (anúncios, Pinterest...) só na completa. */
export function zernioOptionAllowed(id: string, edition: Edition = EDITION): boolean {
  if (edition.allIntegrations) return true;
  const channel = ZERNIO_OPTION_CHANNEL[id];
  return Boolean(channel && hasChannel(channel, edition));
}
