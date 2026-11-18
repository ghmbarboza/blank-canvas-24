import { Link } from "@tanstack/react-router";
import { Link2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SettingsCard } from "@/features/settings/SettingsCard";
import { useIntegration } from "@/features/integrations/api";
import { useAccount } from "@/lib/account";

import { BrandTile } from "@/components/brand/BrandIcon";

// Ajustes › Agenda e reuniões: sala, links de agendamento e agenda pessoal (Google/Outlook).
export function CalendarSettingsTab() {
  const { current } = useAccount();
  const accountId = current!.accountId;
  const livekit = useIntegration(accountId, "livekit");
  const lkOk = livekit.data?.status === "connected";

  return (
    <div className="space-y-6">
      <SettingsCard
        title="Sala de reuniãa Central de CS"
        description="Vídeo próprio da plataforma, com transcrição ao vivo, coach e ata."
      >
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border p-4">
          <BrandTile id="livekit" size={32} />
          <p className="min-w-0 flex-1 text-[13px]">
            {lkOk
              ? "Conectada. As reuniões abrem na sala Central de CS."
              : "Ainda não conectada. Um administrador liga o LiveKit em Integrações."}
          </p>
          <Button size="sm" variant="outline" asChild>
            <Link to="/ajustes" search={{ aba: "integracoes" }}>
              Integrações
            </Link>
          </Button>
        </div>
      </SettingsCard>

      <SettingsCard
        title="Links de agendamento"
        description="O cliente escolhe um horário livre e a reunião já nasce com sala, convite por e-mail e WhatsApp e lembretes."
      >
        <Button asChild>
          <Link to="/agendamentos">
            <Link2 /> Gerenciar links
          </Link>
        </Button>
      </SettingsCard>
    </div>
  );
}
