import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

import { BRAND } from "@/lib/brand";
import { pageHead } from "@/lib/page-head";

// O passo a passo da aula mora num site próprio. Este endereço continua existindo para quem
// tem o link antigo (ou abriu pela cópia do app) e leva direto para lá.
function AulaRedirect() {
  useEffect(() => {
    window.location.replace(BRAND.aulaUrl);
  }, []);
  return (
    <main className="grid min-h-screen place-items-center p-6 text-center">
      <p className="text-[15px]">
        Abrindo o passo a passo da aula.{" "}
        <a className="font-semibold underline underline-offset-4" href={BRAND.aulaUrl}>
          Ir agora
        </a>
      </p>
    </main>
  );
}

export const Route = createFileRoute("/aula")({
  head: () => pageHead("Passo a passo da aula", "O passo a passo completo da aula ao vivo."),
  component: AulaRedirect,
});
