// Reprocessar aviso da Zernio que ficou parado. Puro (teste em zernio-retry.test.ts).
// O webhook grava o aviso (status "received") e processa na mesma requisição. Se a Zernio desiste
// de esperar (servidor frio) e o runtime corta a requisição, o aviso fica "received" para sempre e a
// mensagem do cliente some da Caixa. A rotina zernio.events_retry pega esses avisos e processa de novo.

/** Conta do Vínculo gravada na chave de dedupe do aviso (`<conta>:<id do evento>`). */
export function accountOfDedupe(externalId: string | null | undefined): string | null {
  const m = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):/i.exec(
    externalId ?? "",
  );
  return m ? m[1]!.toLowerCase() : null;
}

/** Janela de reprocessamento: parado há mais de 1 min e há menos de 48 h. */
export const RETRY_MIN_AGE_MS = 60_000;
export const RETRY_MAX_AGE_MS = 48 * 3_600_000;

export function isStuck(createdAt: string, now: number = Date.now()): boolean {
  const age = now - new Date(createdAt).getTime();
  return age >= RETRY_MIN_AGE_MS && age <= RETRY_MAX_AGE_MS;
}
