import { createFileRoute } from "@tanstack/react-router";

import { MeetingsPage } from "@/features/meetings/MeetingsPage";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/_app/reunioes/")({
  head: () => pageHead("Reuniões", "Sala de vídeo própria com transcrição, coach ao vivo e ata."),
  component: MeetingsPage,
});
