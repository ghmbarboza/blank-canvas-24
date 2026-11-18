import { Link } from "@tanstack/react-router";
import { Compass, PowerOff } from "lucide-react";

import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/lib/brand";
import type { ModuleDef } from "./modules";

// Rota de um recurso extra desligado: a tela não abre, diz o que é e onde ligar.
export function ModuleOffPage({ module, canEnable }: { module: ModuleDef; canEnable: boolean }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <PageHeader title={module.label} description={module.what} />
      <div className="px-4 pb-10 sm:px-8 lg:px-10">
        <EmptyState
          icon={PowerOff}
          title="Recurso desligado"
          description={
            canEnable
              ? `${module.when} Ligue em Ajustes › Recursos extras; o que já foi salvo continua guardado.`
              : `${module.when} Peça a um administrador para ligar em Ajustes › Recursos extras.`
          }
          action={
            canEnable ? (
              <Button asChild>
                <Link to="/ajustes" search={{ aba: "recursos" }}>
                  Abrir Recursos extras
                </Link>
              </Button>
            ) : undefined
          }
          className="rounded-2xl border border-border bg-surface"
        />
      </div>
    </div>
  );
}

// Endereço de uma tela que não faz parte desta edição do produto (ver src/lib/edition.ts).
export function EditionOffPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <PageHeader title="Tela indisponível" />
      <div className="px-4 pb-10 sm:px-8 lg:px-10">
        <EmptyState
          icon={Compass}
          title={`Esta tela não faz parte do ${BRAND.name}`}
          description="O atendimento acontece pela Caixa de entrada. Volte ao Painel para continuar."
          action={
            <Button asChild>
              <Link to="/painel">Ir para o Painel</Link>
            </Button>
          }
          className="rounded-2xl border border-border bg-surface"
        />
      </div>
    </div>
  );
}
