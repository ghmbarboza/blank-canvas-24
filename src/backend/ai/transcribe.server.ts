// Transcrição de áudio (mensagem de voz do WhatsApp, gravação de ligação). Com o Deepgram da conta,
// usa ele (separa quem falou); sem ele, a IA embutida (GPT Transcribe no gateway do Lovable).
// Antes, sem Deepgram, o áudio do cliente ficava sem texto e a IA não respondia.
import { getIntegration } from "@/backend/integrations.server";
import { assertPublicUrl } from "@/backend/net-guard.server";
import { deepgramTranscribeUrl } from "@/backend/providers/deepgram.server";

import { GATEWAY_TRANSCRIBE_MODEL, GATEWAY_URL, gatewayHeaders } from "./models";

export interface Transcript {
  text: string;
  utterances: { speaker: number; start: number; end: number; transcript: string }[];
  /** segundos; 0 quando o provedor não informa */
  duration: number;
  provider: "deepgram" | "lovable";
}

const MAX_BYTES = 24 * 1024 * 1024;

function filename(type: string) {
  if (type.includes("ogg") || type.includes("opus")) return "audio.ogg";
  if (type.includes("mpeg") || type.includes("mp3")) return "audio.mp3";
  if (type.includes("wav")) return "audio.wav";
  if (type.includes("webm")) return "audio.webm";
  if (type.includes("mp4") || type.includes("m4a") || type.includes("aac")) return "audio.m4a";
  return "audio.ogg";
}

// A mídia vem do provedor (webhook assinado), mas a URL não é nossa: só host público, conferido
// a cada redirecionamento (S12).
async function fetchPublic(raw: string): Promise<Response> {
  let url = await assertPublicUrl(raw);
  for (let hop = 0; hop < 4; hop++) {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000), redirect: "manual" });
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) {
      url = await assertPublicUrl(new URL(loc, url));
      continue;
    }
    return res;
  }
  throw new Error("áudio com redirecionamentos demais");
}

async function gatewayTranscribe(url: string): Promise<Transcript | null> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) return null;
  const audio = await fetchPublic(url);
  if (!audio.ok) throw new Error(`áudio indisponível (${audio.status})`);
  const blob = await audio.blob();
  if (blob.size > MAX_BYTES) throw new Error("áudio grande demais para transcrever");
  const form = new FormData();
  form.append("model", GATEWAY_TRANSCRIBE_MODEL);
  form.append("language", "pt");
  form.append("file", blob, filename(blob.type || audio.headers.get("content-type") || ""));
  const res = await fetch(`${GATEWAY_URL}/audio/transcriptions`, {
    method: "POST",
    headers: gatewayHeaders(key),
    body: form,
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`transcrição ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = (await res.json().catch(() => ({}))) as { text?: string; duration?: number };
  return {
    text: (j.text ?? "").trim(),
    utterances: [],
    duration: j.duration ?? 0,
    provider: "lovable",
  };
}

export async function transcribeUrl(
  accountId: string,
  url: string,
  opts: { diarize?: boolean } = {},
): Promise<Transcript | null> {
  await assertPublicUrl(url);
  const dg = await getIntegration(accountId, "deepgram");
  const key = dg?.secrets["api_key"];
  if (key) return { ...(await deepgramTranscribeUrl(key, url, opts)), provider: "deepgram" };
  return gatewayTranscribe(url);
}
