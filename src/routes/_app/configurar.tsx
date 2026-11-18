import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { useSetup } from "@/features/setup/SetupWizard";
import { pageHead } from "@/lib/page-head";

// Link antigo /configurar: a Cris agora é um modal. Abre o modal sobre o Painel.
function OpenNexa() {
  const { openNexa } = useSetup();
  const navigate = useNavigate();
  useEffect(() => {
    void navigate({ to: "/painel", replace: true });
    openNexa();
  }, [navigate, openNexa]);
  return null;
}

export const Route = createFileRoute("/_app/configurar")({
  head: () => pageHead("Configurar com a Cris", "Configure a central conversando com a Cris."),
  component: OpenNexa,
});
