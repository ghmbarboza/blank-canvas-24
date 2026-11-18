// Voz da Nexa com o que o navegador já tem (Web Speech): ouvir em pt-BR e falar em pt-BR.
// Sem custo e sem chave. Onde o navegador não tem (Firefox não ouve), o botão some e a
// conversa segue escrita. O "mudo" fica guardado por pessoa neste navegador.
import { useCallback, useEffect, useRef, useState } from "react";

const MUTE_KEY = "nexa:muted";

interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult:
    ((e: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
}

function recognitionCtor(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w["SpeechRecognition"] ?? w["webkitSpeechRecognition"] ?? null) as
    (new () => Recognition) | null;
}

/** Tira markdown e emoji antes de falar: a voz lê "negrito", não asteriscos. */
export function speakable(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`#>]+/g, "")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function readMuted(): boolean {
  try {
    // voz é escolha da pessoa: começa calada, como um chat
    return localStorage.getItem(MUTE_KEY) !== "0";
  } catch {
    return true;
  }
}

export function useVoice(onHeard: (text: string, final: boolean) => void) {
  const [muted, setMuted] = useState(readMuted);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const rec = useRef<Recognition | null>(null);
  const heard = useRef(onHeard);
  heard.current = onHeard;
  const canListen = recognitionCtor() !== null;
  const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;

  const stopSpeaking = useCallback(() => {
    if (canSpeak) window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [canSpeak]);

  const speak = useCallback(
    (text: string) => {
      if (!canSpeak || muted) return;
      const say = speakable(text);
      if (!say) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(say);
      u.lang = "pt-BR";
      u.rate = 1.04;
      const voice = window.speechSynthesis
        .getVoices()
        .find((v) => v.lang.toLowerCase().startsWith("pt-br") || v.lang.toLowerCase() === "pt_br");
      if (voice) u.voice = voice;
      u.onstart = () => setSpeaking(true);
      u.onend = () => setSpeaking(false);
      u.onerror = () => setSpeaking(false);
      window.speechSynthesis.speak(u);
    },
    [canSpeak, muted],
  );

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      try {
        localStorage.setItem(MUTE_KEY, next ? "1" : "0");
      } catch {
        /* sem armazenamento: vale só nesta aba */
      }
      if (next && canSpeak) window.speechSynthesis.cancel();
      return next;
    });
  }, [canSpeak]);

  const listen = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    if (rec.current) {
      rec.current.stop();
      return;
    }
    stopSpeaking(); // quem vai falar não quer ouvir a Nexa por cima
    const r = new Ctor();
    r.lang = "pt-BR";
    r.interimResults = true;
    r.continuous = false;
    r.onresult = (e) => {
      const list = Array.from(e.results);
      const text = list.map((x) => x[0].transcript).join(" ");
      heard.current(
        text,
        list.every((x) => x.isFinal),
      );
    };
    r.onend = () => {
      rec.current = null;
      setListening(false);
    };
    r.onerror = () => {
      rec.current = null;
      setListening(false);
    };
    rec.current = r;
    setListening(true);
    r.start();
  }, [stopSpeaking]);

  useEffect(
    () => () => {
      rec.current?.stop();
      if (canSpeak) window.speechSynthesis.cancel();
    },
    [canSpeak],
  );

  return {
    muted,
    toggleMute,
    speak,
    stopSpeaking,
    speaking,
    listening,
    listen,
    canListen,
    canSpeak,
  };
}
