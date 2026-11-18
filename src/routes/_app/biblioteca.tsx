import { createFileRoute } from "@tanstack/react-router";

import { LibraryPage } from "@/features/library/LibraryPage";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/_app/biblioteca")({
  head: () =>
    pageHead(
      "Biblioteca",
      "Busca nas conversas de reuniões e ligações, termos monitorados e melhores momentos.",
    ),
  component: LibraryPage,
});
