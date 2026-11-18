import { createFileRoute } from "@tanstack/react-router";

import { AulaPage } from "@/features/aula/AulaPage";
import { pageHead } from "@/lib/page-head";

// Página pública da aula: instruções, botão de cópia do projeto e passos de configuração.
export const Route = createFileRoute("/aula")({
  head: () => pageHead("Aula", "Monte o seu pós-venda no WhatsApp em duas horas."),
  component: AulaPage,
});
