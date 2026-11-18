import {
  useRemoteParticipants,
  useLocalParticipant,
  useTranscriptions,
} from "@livekit/components-react";

// Legendas ao vivo: o agente publica a transcrição na sala (tópico lk.transcription).
// Mostra as últimas falas sobre o vídeo, para todos (inclusive o convidado, que não tem login).
export function Captions() {
  const lines = useTranscriptions();
  const remote = useRemoteParticipants();
  const { localParticipant } = useLocalParticipant();
  const nameOf = (identity: string) =>
    identity === localParticipant.identity
      ? "Você"
      : (remote.find((p) => p.identity === identity)?.name ?? "Participante");
  const last = lines.slice(-2);
  if (last.length === 0) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[84px] z-10 flex justify-center px-4">
      <div className="max-w-3xl space-y-1 rounded-2xl bg-black/60 px-4 py-2.5 text-center backdrop-blur-sm">
        {last.map((l, i) => (
          <p key={`${l.streamInfo.id}-${i}`} className="text-[14px] leading-snug text-white">
            <span className="font-semibold text-white/70">
              {/* o agente publica em nome de quem falou (atributo lk.participant_identity) */}
              {nameOf(
                l.streamInfo.attributes?.["lk.participant_identity"] ?? l.participantInfo.identity,
              )}
              :{" "}
            </span>
            {l.text}
          </p>
        ))}
      </div>
    </div>
  );
}
