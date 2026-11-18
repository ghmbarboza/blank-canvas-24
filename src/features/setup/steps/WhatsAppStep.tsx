import { ArrowRight } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { OfficialWhatsApp } from "@/features/channels/AddWhatsApp";
import { EvolutionConnect } from "@/features/channels/EvolutionConnect";

import type { StepProps } from "./ui";

/** Passo 2: WhatsApp por QR Code na própria tela; o número oficial fica como segunda opção. */
export function WhatsAppStep({ accountId, onNext, done }: StepProps & { done: boolean }) {
  const qc = useQueryClient();
  return (
    <div className="space-y-5">
      <EvolutionConnect
        accountId={accountId}
        onConnected={() => void qc.invalidateQueries({ queryKey: ["setup"] })}
      />
      {done ? (
        <Button className="h-11" onClick={onNext}>
          Continuar
          <ArrowRight aria-hidden />
        </Button>
      ) : null}
      <div className="border-t border-border pt-4">
        <OfficialWhatsApp accountId={accountId} compact />
      </div>
    </div>
  );
}
