// Envio para o Flow CRM. Falha lança erro: o job (flowcrm.push) tenta de novo pela fila.
import { assertPublicUrl } from "@/backend/net-guard.server";

import { contactUpsert, validFlowUrl } from "./flowcrm";

const TIMEOUT_MS = 15_000;

export async function flowcrmPost(
  url: string,
  key: string,
  body: unknown,
  idempotencyKey?: string,
): Promise<Record<string, unknown>> {
  // Além da forma (validFlowUrl), o destino resolvido no DNS tem de ser público (S12).
  const target = await assertPublicUrl(validFlowUrl(url), { httpsOnly: true });
  const res = await fetch(target, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
      ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: "manual", // workerd não aceita "error"; 3xx é recusado logo abaixo
  });
  if (res.type === "opaqueredirect" || (res.status >= 300 && res.status < 400))
    throw new Error("O Flow CRM respondeu com redirecionamento, que não é seguido.");
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.status === 401 || res.status === 403)
    throw new Error("O Flow CRM recusou a chave. Confira se ela começa com fcrm_ e está ativa.");
  if (!res.ok)
    throw new Error(
      `O Flow CRM respondeu ${res.status}: ${String(data["error"] ?? data["message"] ?? "erro")}`.slice(
        0,
        300,
      ),
    );
  return data;
}

export async function flowcrmTest(url: string, key: string): Promise<string> {
  await flowcrmPost(url, key, { action: "ping", data: {} });
  return "Flow CRM respondeu. Contatos novos e vendas passam a ir para lá.";
}

export { contactUpsert };
