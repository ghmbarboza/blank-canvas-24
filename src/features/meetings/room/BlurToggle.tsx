import { useEffect, useRef, useState } from "react";
import { useLocalParticipant } from "@livekit/components-react";
import { LocalVideoTrack, Track } from "livekit-client";
import { toast } from "sonner";

type Processor = Awaited<ReturnType<typeof makeBlur>>;

// O módulo de desfoque (com o modelo de segmentação) só baixa quando alguém clica no botão.
async function makeBlur() {
  const mod = await import("@livekit/track-processors");
  if (!mod.supportsBackgroundProcessors()) return null;
  return mod.BackgroundBlur(12);
}

// Botão "Desfocar fundo" da barra da sala: liga e desliga o desfoque na câmera local.
export function BlurToggle() {
  const { localParticipant, cameraTrack } = useLocalParticipant();
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const processor = useRef<Processor>(null);
  const track = cameraTrack?.track instanceof LocalVideoTrack ? cameraTrack.track : null;

  // câmera desligada e religada vem sem o desfoque: o estado do botão acompanha
  useEffect(() => {
    if (!track) setOn(false);
  }, [track]);

  async function toggle() {
    if (!track) {
      toast.message("Ligue a câmera para desfocar o fundo");
      return;
    }
    setBusy(true);
    try {
      if (on) {
        await track.stopProcessor();
        setOn(false);
        return;
      }
      processor.current ??= await makeBlur();
      if (!processor.current) {
        toast.error("Este navegador não consegue desfocar o fundo. Tente o Chrome ou o Edge.");
        return;
      }
      await track.setProcessor(processor.current);
      setOn(true);
    } catch (err) {
      console.error("[sala] desfoque falhou", err);
      toast.error("Não deu para desfocar o fundo agora.");
    } finally {
      setBusy(false);
    }
  }

  if (!localParticipant.isCameraEnabled && !on) return null;
  return (
    <button
      type="button"
      className="lk-button"
      aria-pressed={on}
      disabled={busy || cameraTrack?.source !== Track.Source.Camera}
      onClick={() => void toggle()}
    >
      {busy ? "Aplicando…" : on ? "Fundo desfocado" : "Desfocar fundo"}
    </button>
  );
}
