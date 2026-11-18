import { createFileRoute } from "@tanstack/react-router";

import { MyDayPage } from "@/features/my-day/MyDayPage";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/_app/meu-dia")({
  head: () => pageHead("Meu dia", "Tarefas, agenda e clientes que pedem a sua atenção hoje."),
  component: MyDayPage,
});
