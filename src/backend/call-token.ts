// Prova de quem iniciou uma ligação (revisão de segurança de 04/11, S10): o servidor devolve um
// token assinado junto com o id da ligação; encerrar exige o token (ou ser gestor). Sem estado.
import { createHmac, timingSafeEqual } from "node:crypto";

export function callToken(key: string, userId: string, callId: string): string {
  return createHmac("sha256", key).update(`call:${userId}:${callId}`).digest("base64url");
}

export function validCallToken(
  key: string,
  userId: string,
  callId: string,
  token: unknown,
): boolean {
  if (typeof token !== "string" || !key) return false;
  const want = Buffer.from(callToken(key, userId, callId));
  const got = Buffer.from(token);
  return want.length === got.length && timingSafeEqual(want, got);
}
