import { useCallback, useEffect, useRef, useState } from "react";

import { extensionFor, pickRecordingType } from "./voice-format";

const MAX_SECONDS = 5 * 60;

/** Grava áudio pelo microfone e devolve um arquivo pronto para anexar (#72). */
export function useVoiceRecorder(onDone: (file: File) => void, onError: (msg: string) => void) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const cancelled = useRef(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanup = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    recRef.current?.stream.getTracks().forEach((t) => t.stop());
    recRef.current = null;
    setRecording(false);
  }, []);

  useEffect(
    () => () => {
      cancelled.current = true;
      if (recRef.current?.state === "recording") recRef.current.stop();
      cleanup();
    },
    [cleanup],
  );

  const start = useCallback(async () => {
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      onError("Este navegador não grava áudio. Anexe um arquivo de áudio.");
      return;
    }
    const mime = pickRecordingType((t) => MediaRecorder.isTypeSupported(t));
    if (!mime) {
      onError("Este navegador não grava em um formato aceito. Anexe um arquivo de áudio.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      onError("Sem acesso ao microfone. Libere o microfone para este site no navegador.");
      return;
    }
    const rec = new MediaRecorder(stream, { mimeType: mime });
    chunks.current = [];
    cancelled.current = false;
    rec.ondataavailable = (e) => {
      if (e.data.size) chunks.current.push(e.data);
    };
    rec.onstop = () => {
      const blob = new Blob(chunks.current, { type: mime });
      cleanup();
      if (cancelled.current || !blob.size) return;
      const name = `audio-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.${extensionFor(mime)}`;
      onDone(new File([blob], name, { type: mime.split(";")[0] ?? mime }));
    };
    recRef.current = rec;
    rec.start();
    setSeconds(0);
    setRecording(true);
    timer.current = setInterval(() => {
      setSeconds((s) => {
        if (s + 1 >= MAX_SECONDS && recRef.current?.state === "recording") recRef.current.stop();
        return s + 1;
      });
    }, 1000);
  }, [cleanup, onDone, onError]);

  const stop = useCallback(() => {
    if (recRef.current?.state === "recording") recRef.current.stop();
  }, []);

  const cancel = useCallback(() => {
    cancelled.current = true;
    stop();
  }, [stop]);

  return { recording, seconds, start, stop, cancel };
}
