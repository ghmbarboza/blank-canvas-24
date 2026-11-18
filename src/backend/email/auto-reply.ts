// E-mail de robô (resposta automática, aviso de ausência, devolução, notificação "não responda"):
// a IA não responde, senão dois robôs conversam para sempre.

const ROBOT_SENDER =
  /^(no-?reply|do-?not-?reply|nao-?responda|mailer-daemon|postmaster|bounce[s]?|notifica(tion|coes|ções)s?|alerts?)([+._-][^@]*)?@/i;
const ROBOT_SUBJECT =
  /^\s*(auto(matic)?\s*(reply|response)|autoreply|resposta autom[aá]tica|out of (the )?office|fora do escrit[oó]rio|ausente|aus[eê]ncia|undeliverable|delivery status notification|mail delivery (failed|subsystem)|falha na entrega|n[aã]o entregue)/i;

export function isAutomatedEmail(from: string, subject: string | null | undefined): boolean {
  return ROBOT_SENDER.test(from.trim()) || ROBOT_SUBJECT.test(subject ?? "");
}
