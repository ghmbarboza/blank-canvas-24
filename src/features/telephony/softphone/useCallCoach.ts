import { useCallback, useEffect, useRef, useState } from "react";

import { createRuleEngine } from "@/features/coach/rules";
import type { CoachTip, Speaker, TranscriptSegment } from "@/features/coach/types";

import { telephonyApi } from "../api";

// Coach na ligação: o softphone (widget WebRTC da Zadarma) toca no navegador do vendedor.
// Separamos o microfone (vendedor, canal 0) do áudio remoto (cliente, canal 1) pela WebAudio e
// mandamos em estéreo para o Deepgram com token efêmero. Nenhuma chave vai para o navegador.

const DG_URL =
  "wss://api.deepgram.com/v1/listen?model=nova-3&language=multi&encoding=linear16&sample_rate=16000&channels=2&multichannel=true&interim_results=true&punctuate=true&smart_format=true&endpointing=300";
const AI_EVERY_MS = 10_000;

export type CoachStatus = "idle" | "starting" | "listening" | "no_remote" | "error";

// O widget toca o áudio do cliente num <audio> com srcObject; procuramos o primeiro ativo.
function findRemoteStream(local: MediaStream | null): MediaStream | null {
  const els = Array.from(document.querySelectorAll("audio, video")) as HTMLMediaElement[];
  for (const el of els) {
    const s = el.srcObject;
    if (
      s instanceof MediaStream &&
      s !== local &&
      s.getAudioTracks().some((t) => t.readyState === "live")
    )
      return s;
  }
  return null;
}

function floatTo16(a: Float32Array, b: Float32Array): ArrayBuffer {
  const out = new Int16Array(a.length * 2);
  for (let i = 0; i < a.length; i++) {
    const l = Math.max(-1, Math.min(1, a[i] ?? 0));
    const r = Math.max(-1, Math.min(1, b[i] ?? 0));
    out[i * 2] = l < 0 ? l * 0x8000 : l * 0x7fff;
    out[i * 2 + 1] = r < 0 ? r * 0x8000 : r * 0x7fff;
  }
  return out.buffer;
}

export function useCallCoach(accountId: string, contactId: string | null) {
  const [status, setStatus] = useState<CoachStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [interim, setInterim] = useState<Record<Speaker, string>>({ seller: "", customer: "" });
  const [tips, setTips] = useState<CoachTip[]>([]);
  const engine = useRef(createRuleEngine());
  const cleanup = useRef<(() => void) | null>(null);
  const started = useRef(0);
  const lastAi = useRef(0);
  const segRef = useRef<TranscriptSegment[]>([]);

  const stop = useCallback(() => {
    cleanup.current?.();
    cleanup.current = null;
    setStatus("idle");
  }, []);

  const askAi = useCallback(async () => {
    const recent = segRef.current.filter((s) => s.final).slice(-40);
    if (recent.length < 2) return;
    const text = recent.map((s) => `${s.speaker === "seller" ? "V" : "C"}: ${s.text}`).join("\n");
    try {
      const r = await telephonyApi.coach(accountId, text, contactId);
      const at = Date.now() - started.current;
      const fresh: CoachTip[] = r.tips.map((t, i) => ({
        id: `ai-${at}-${i}`,
        kind: (t.kind as CoachTip["kind"]) ?? "info",
        title: t.title,
        text: t.text,
        at,
        source: "ai",
      }));
      if (fresh.length) setTips((cur) => [...fresh, ...cur].slice(0, 30));
    } catch {
      // IA indisponível: as regras locais continuam valendo
    }
  }, [accountId, contactId]);

  const start = useCallback(async () => {
    if (cleanup.current) return;
    setStatus("starting");
    setError(null);
    engine.current.reset();
    setSegments([]);
    segRef.current = [];
    setTips([]);
    started.current = Date.now();
    lastAi.current = Date.now();
    try {
      const [{ token }, mic] = await Promise.all([
        telephonyApi.deepgramToken(accountId),
        navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
        }),
      ]);
      const ctx = new AudioContext({ sampleRate: 16000 });
      const merger = ctx.createChannelMerger(2);
      ctx.createMediaStreamSource(mic).connect(merger, 0, 0);
      let remote = findRemoteStream(mic);
      const attachRemote = (s: MediaStream) => ctx.createMediaStreamSource(s).connect(merger, 0, 1);
      if (remote) attachRemote(remote);
      const proc = ctx.createScriptProcessor(4096, 2, 2);
      const mute = ctx.createGain();
      mute.gain.value = 0;
      merger.connect(proc);
      proc.connect(mute);
      mute.connect(ctx.destination);

      const ws = new WebSocket(DG_URL, ["bearer", token]);
      ws.binaryType = "arraybuffer";
      proc.onaudioprocess = (e) => {
        if (ws.readyState === WebSocket.OPEN)
          ws.send(floatTo16(e.inputBuffer.getChannelData(0), e.inputBuffer.getChannelData(1)));
      };
      ws.onopen = () => setStatus(remote ? "listening" : "no_remote");
      ws.onerror = () => {
        setError("Não deu para conectar à transcrição");
        setStatus("error");
      };
      ws.onmessage = (ev) => {
        const msg = JSON.parse(String(ev.data)) as {
          type?: string;
          is_final?: boolean;
          channel_index?: number[];
          channel?: { alternatives?: { transcript?: string }[] };
        };
        if (msg.type !== "Results") return;
        const text = msg.channel?.alternatives?.[0]?.transcript?.trim() ?? "";
        const speaker: Speaker = (msg.channel_index?.[0] ?? 0) === 0 ? "seller" : "customer";
        if (!msg.is_final) {
          setInterim((cur) => ({ ...cur, [speaker]: text }));
          return;
        }
        setInterim((cur) => ({ ...cur, [speaker]: "" }));
        if (!text) return;
        const seg: TranscriptSegment = {
          speaker,
          text,
          final: true,
          at: Date.now() - started.current,
        };
        segRef.current = [...segRef.current, seg].slice(-400);
        setSegments(segRef.current);
        const fresh = engine.current.push(seg);
        if (fresh.length) setTips((cur) => [...fresh, ...cur].slice(0, 30));
        if (Date.now() - lastAi.current > AI_EVERY_MS) {
          lastAi.current = Date.now();
          void askAi();
        }
      };
      // O áudio do cliente pode surgir depois (quando a ligação conecta): continua procurando.
      const poll = window.setInterval(() => {
        if (remote) return;
        remote = findRemoteStream(mic);
        if (remote) {
          attachRemote(remote);
          setStatus("listening");
        }
      }, 1500);
      const keepAlive = window.setInterval(
        () => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ type: "KeepAlive" })),
        8000,
      );
      cleanup.current = () => {
        window.clearInterval(poll);
        window.clearInterval(keepAlive);
        proc.disconnect();
        try {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "CloseStream" }));
          ws.close();
        } catch {
          // já fechado
        }
        mic.getTracks().forEach((t) => t.stop());
        void ctx.close();
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não deu para iniciar o coach");
      setStatus("error");
      cleanup.current?.();
      cleanup.current = null;
    }
  }, [accountId, askAi]);

  useEffect(() => () => cleanup.current?.(), []);

  return { status, error, segments, interim, tips, start, stop };
}
