import { createFileRoute } from "@tanstack/react-router";

import { MyQueuePage } from "@/features/queue/MyQueuePage";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/_app/fila/")({
  head: () => pageHead("Minha fila", "Ligações, conversas, chamados e retornos numa fila só."),
  component: MyQueuePage,
});
