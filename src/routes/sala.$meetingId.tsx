import { createFileRoute } from "@tanstack/react-router";

import { RoomPage } from "@/features/meetings/room/RoomPage";
import { pageHead } from "@/lib/page-head";

// Sala de reunião pública: o convidado entra pelo link do convite (?t=), a equipe entra logada.
export const Route = createFileRoute("/sala/$meetingId")({
  validateSearch: (search: Record<string, unknown>): { t?: string | undefined } => {
    const t = search["t"];
    return typeof t === "string" && /^[a-f0-9]{48}$/.test(t) ? { t } : {};
  },
  head: () => pageHead("Sala de reunião", "Reunião por vídeo na Central de CS."),
  component: SalaRoute,
});

function SalaRoute() {
  const { meetingId } = Route.useParams();
  const { t } = Route.useSearch();
  return <RoomPage key={meetingId} meetingId={meetingId} token={t ?? null} />;
}
