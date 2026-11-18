// Mensagem do teste do Resend para quem não é técnico: fala só do domínio do remetente da conta.
// Nunca lista os outros domínios da chave (podem ser de terceiros que dividem a conta do Resend).
export interface ResendDomain {
  name: string;
  status: string;
}

export function describeResendDomains(domains: ResendDomain[], fromEmail?: string): string {
  const verified = domains.filter((d) => d.status === "verified").map((d) => d.name.toLowerCase());
  const host = fromEmail?.split("@")[1]?.trim().toLowerCase();
  if (!host) {
    return verified.length
      ? "Chave válida. Falta informar o remetente para enviar."
      : "Chave válida, mas nenhum domínio verificado ainda no Resend";
  }
  if (verified.includes(host)) return `Tudo certo: ${host} está verificado e pronto para enviar`;
  const known = domains.find((d) => d.name.toLowerCase() === host);
  return known
    ? `O domínio ${host} ainda não foi verificado no Resend (status: ${known.status}). Confira os registros DNS.`
    : `O domínio ${host} não está cadastrado nesta conta do Resend. Cadastre e verifique antes de enviar.`;
}
