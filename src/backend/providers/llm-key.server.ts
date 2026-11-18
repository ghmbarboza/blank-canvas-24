// Teste de chave de IA do cliente: lista os modelos (GET, sem gastar token).
const TIMEOUT_MS = 10_000;

export async function llmKeyTest(provider: "openai" | "anthropic", key: string): Promise<string> {
  const res =
    provider === "openai"
      ? await fetch("https://api.openai.com/v1/models", {
          headers: { authorization: `Bearer ${key}` },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        })
      : await fetch("https://api.anthropic.com/v1/models?limit=1", {
          headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
  if (res.status === 401 || res.status === 403)
    throw new Error("A chave foi recusada. Confira se copiou inteira e se está ativa.");
  if (!res.ok) throw new Error(`O provedor respondeu ${res.status}. Tente de novo em instantes.`);
  return provider === "openai"
    ? "Chave da OpenAI aceita. A IA do Vínculo já usa a sua conta."
    : "Chave da Anthropic aceita. O Claude já responde pela sua conta.";
}
