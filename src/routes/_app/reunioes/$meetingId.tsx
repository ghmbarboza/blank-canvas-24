import { createFileRoute } from "@tanstack/react-router";

import { MeetingDetailPage } from "@/features/meetings/MeetingDetailPage";
import { MeetingsShell } from "@/features/meetings/MeetingsRail";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/_app/reunioes/$meetingId")({
  head: () => pageHead("Reunião", "Ata, nota, transcrição e dicas do coach."),
  component: MeetingRoute,
});

function MeetingRoute() {
  const { meetingId } = Route.useParams();
  return (
    <MeetingsShell selectedId={meetingId}>
      <MeetingDetailPage key={meetingId} meetingId={meetingId} />
    </MeetingsShell>
  );
}
