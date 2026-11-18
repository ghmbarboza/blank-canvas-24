// Deepgram: token temporário para o navegador (nunca a chave) e transcrição de arquivo.
export async function deepgramGrant(
  apiKey: string,
  ttlSeconds = 600,
): Promise<{ access_token: string; expires_in: number }> {
  const res = await fetch("https://api.deepgram.com/v1/auth/grant", {
    method: "POST",
    headers: { authorization: `Token ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ ttl_seconds: ttlSeconds }),
    signal: AbortSignal.timeout(10_000),
  });
  const j = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    err_msg?: string;
  };
  if (!res.ok || !j.access_token)
    throw new Error(`Deepgram ${res.status}: ${j.err_msg ?? "sem token"}`);
  return { access_token: j.access_token, expires_in: j.expires_in ?? ttlSeconds };
}

export async function deepgramTranscribeUrl(
  apiKey: string,
  url: string,
  opts: { diarize?: boolean } = {},
) {
  const qs = new URLSearchParams({
    model: "nova-3",
    language: "multi",
    smart_format: "true",
    punctuate: "true",
    ...(opts.diarize ? { diarize: "true", utterances: "true" } : {}),
  });
  const res = await fetch(`https://api.deepgram.com/v1/listen?${qs}`, {
    method: "POST",
    headers: { authorization: `Token ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ url }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error(`Deepgram ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = (await res.json()) as {
    metadata?: { duration?: number };
    results?: {
      channels?: { alternatives?: { transcript?: string }[] }[];
      utterances?: { speaker: number; start: number; end: number; transcript: string }[];
    };
  };
  return {
    text: j.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "",
    utterances: j.results?.utterances ?? [],
    duration: j.metadata?.duration ?? 0,
  };
}

export async function deepgramTest(apiKey: string): Promise<string> {
  const res = await fetch("https://api.deepgram.com/v1/projects", {
    headers: { authorization: `Token ${apiKey}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 401 || res.status === 403) throw new Error("Chave do Deepgram recusada");
  if (!res.ok) throw new Error(`Deepgram respondeu ${res.status}`);
  const j = (await res.json()) as { projects?: { name: string }[] };
  return `Chave válida (${j.projects?.length ?? 0} projeto(s))`;
}
