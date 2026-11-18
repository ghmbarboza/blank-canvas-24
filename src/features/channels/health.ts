// Saúde da conexão de um canal, em linguagem de quem usa: o que está acontecendo e o que fazer.
export type HealthTone = "live" | "pending" | "off" | "problem";

export interface ChannelHealth {
  tone: HealthTone;
  label: string;
  /** o que a pessoa faz para resolver; null quando está tudo certo */
  fix: string | null;
  /** atalho direto para resolver, quando existe */
  action: "qr" | "webhook" | null;
}

interface HealthInput {
  provider: string;
  platform: string;
  status: string;
}

/** Provedores que o Nexus ainda conecta; canal de outro provedor ficou de um recurso removido. */
const KNOWN_PROVIDERS = new Set([
  "whatsapp_cloud",
  "evolution",
  "zernio",
  "zadarma",
  "webchat",
  "email",
]);

function fixFor(c: HealthInput): Pick<ChannelHealth, "fix" | "action"> {
  if (c.provider === "evolution")
    return { fix: "Leia o QR de novo com o celular do número.", action: "qr" };
  if (c.provider === "zernio" && c.platform === "whatsapp")
    return { fix: "Conecte de novo pelo cartão do WhatsApp Oficial, logo abaixo.", action: null };
  if (c.provider === "zernio")
    return { fix: "Conecte a rede de novo em Mais canais, logo abaixo.", action: null };
  if (c.provider === "whatsapp_cloud")
    return { fix: "Confira o token da Meta e os dados do webhook.", action: "webhook" };
  if (c.provider === "zadarma")
    return { fix: "Confira a chave da Zadarma em Ajustes › Integrações.", action: null };
  if (!KNOWN_PROVIDERS.has(c.provider))
    return {
      fix: "Este provedor saiu do Nexus. Conecte o SMS pela Zadarma em Outras formas de conectar e remova este canal.",
      action: null,
    };
  return { fix: "Remova o canal e conecte de novo.", action: null };
}

export function channelHealth(c: HealthInput): ChannelHealth {
  if (c.status === "connected")
    return { tone: "live", label: "funcionando", fix: null, action: null };
  if (c.status === "connecting" || c.status === "pending")
    return { tone: "pending", label: "conectando", fix: null, action: null };
  if (c.status === "error") return { tone: "problem", label: "com problema", ...fixFor(c) };
  return { tone: "off", label: "desconectado", ...fixFor(c) };
}

/** Resumo do bloco "Canais operando": tudo normal ou quantos precisam de atenção. */
export function healthSummary(list: HealthInput[]): { ok: boolean; problems: number } {
  const problems = list.filter((c) => {
    const t = channelHealth(c).tone;
    return t === "problem" || t === "off";
  }).length;
  return { ok: problems === 0, problems };
}
