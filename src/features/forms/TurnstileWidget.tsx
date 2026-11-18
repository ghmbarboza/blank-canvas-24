import { useEffect, useRef } from "react";

// Widget do Cloudflare Turnstile (modo explícito). O script é carregado uma vez por página.
const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface TurnstileApi {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string;
      language?: string;
      callback: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
    },
  ) => string;
  reset: (id?: string) => void;
  remove: (id: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let loading: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT;
    s.async = true;
    s.onload = () =>
      window.turnstile ? resolve(window.turnstile) : reject(new Error("Turnstile indisponível"));
    s.onerror = () => {
      loading = null;
      reject(new Error("Turnstile indisponível"));
    };
    document.head.appendChild(s);
  });
  return loading;
}

interface Props {
  siteKey: string;
  onToken: (token: string | null) => void;
  /** Mude o número para pedir um token novo (o token vale um envio só). */
  resetSignal: number;
}

export function TurnstileWidget({ siteKey, onToken, resetSignal }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const cb = useRef(onToken);
  useEffect(() => {
    cb.current = onToken;
  });

  useEffect(() => {
    let alive = true;
    loadTurnstile()
      .then((api) => {
        if (!alive || !box.current) return;
        widget.current = api.render(box.current, {
          sitekey: siteKey,
          language: "pt-br",
          callback: (t) => cb.current(t),
          "expired-callback": () => cb.current(null),
          "error-callback": () => cb.current(null),
        });
      })
      .catch(() => cb.current(null));
    return () => {
      alive = false;
      if (widget.current) window.turnstile?.remove(widget.current);
      widget.current = null;
    };
  }, [siteKey]);

  useEffect(() => {
    if (resetSignal && widget.current) {
      cb.current(null);
      window.turnstile?.reset(widget.current);
    }
  }, [resetSignal]);

  return <div ref={box} className="min-h-[65px]" aria-label="Verificação anti-robô" />;
}
