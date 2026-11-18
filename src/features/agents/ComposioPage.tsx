import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { useAccount } from "@/lib/account";

import { ComposioPanel } from "./ComposioPanel";

export function ComposioPage() {
  const { current } = useAccount();
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="Ferramentas conectadas"
        description="Gmail, Outlook, Agenda, HubSpot, Planilhas e outros: a equipe de IA age nos apps que sua empresa já usa."
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link to="/equipe-ia">
              <ArrowLeft /> Equipe de IA
            </Link>
          </Button>
        }
      />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto max-w-5xl">
          <ComposioPanel accountId={current!.accountId} />
        </div>
      </div>
    </div>
  );
}
