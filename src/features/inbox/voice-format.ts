// Gravar áudio no composer (#72). Puro: qual formato pedir ao navegador e se o canal aceita.

/** Ordem de preferência: OGG/Opus é o que o WhatsApp mostra como nota de voz. */
export const RECORDING_TYPES = ["audio/ogg;codecs=opus", "audio/mp4", "audio/webm;codecs=opus"];

export function pickRecordingType(isSupported: (t: string) => boolean): string | null {
  return RECORDING_TYPES.find((t) => isSupported(t)) ?? null;
}

export function extensionFor(mime: string): string {
  if (mime.startsWith("audio/ogg")) return "ogg";
  if (mime.startsWith("audio/mp4")) return "m4a";
  return "webm";
}

/** A API direta da Meta não aceita WebM; os outros canais aceitam ou convertem. */
export function channelAcceptsAudio(provider: string | undefined, mime: string): boolean {
  return !(provider === "whatsapp_cloud" && mime.startsWith("audio/webm"));
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
