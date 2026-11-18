import { Bot, Headset, PhoneForwarded, Voicemail } from "lucide-react";
import { BrandIcon } from "@/components/brand/BrandIcon";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

import { buildForwardTo, type ForwardChoice, type ForwardKind } from "../zernio-rules";

const OPTIONS: { kind: ForwardKind; label: string; hint: string; icon: typeof Bot }[] = [
  { kind: "ai", label: "Agente de IA", hint: "A IA de voz da ElevenLabs atende.", icon: Bot },
  {
    kind: "phone",
    label: "Um atendente",
    hint: "Toca no celular de alguém da equipe.",
    icon: PhoneForwarded,
  },
  {
    kind: "zadarma",
    label: "Central de atendimento",
    hint: "Cai na fila do call center (Zadarma).",
    icon: Headset,
  },
  {
    kind: "none",
    label: "Só caixa postal",
    hint: "Ninguém atende; o cliente deixa recado.",
    icon: Voicemail,
  },
];

interface Props {
  id: string;
  value: ForwardChoice;
  onChange: (v: ForwardChoice) => void;
  /** Número da Zernio: o agente da ElevenLabs atende por ele mesmo. */
  ownNumber?: string | null;
  allowNone?: boolean;
}

export function ForwardPicker({ id, value, onChange, ownNumber, allowNone = true }: Props) {
  const options = OPTIONS.filter((o) => allowNone || o.kind !== "none");
  const check = buildForwardTo(value);
  return (
    <div className="space-y-3">
      <RadioGroup
        value={value.kind}
        onValueChange={(k) => {
          const kind = k as ForwardKind;
          onChange(
            kind === "ai" ? { kind, phone: ownNumber ?? value.phone ?? "" } : { ...value, kind },
          );
        }}
        className="grid gap-2 sm:grid-cols-2"
        aria-label="Para onde a ligação vai"
      >
        {options.map((o) => (
          <Label
            key={o.kind}
            htmlFor={`${id}-${o.kind}`}
            className={cn(
              "flex cursor-pointer items-start gap-2.5 rounded-lg border border-border p-3 transition-colors hover:bg-surface-2",
              value.kind === o.kind && "border-primary-line bg-primary-soft",
            )}
          >
            <RadioGroupItem id={`${id}-${o.kind}`} value={o.kind} className="mt-0.5" />
            {o.kind === "ai" ? (
              <BrandIcon id="elevenlabs" size={16} className="mt-0.5" />
            ) : (
              <o.icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            )}
            <span>
              <span className="block text-[13px] font-medium">{o.label}</span>
              <span className="block text-[11px] font-normal text-muted-foreground">{o.hint}</span>
            </span>
          </Label>
        ))}
      </RadioGroup>

      {value.kind === "ai" && (
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-ai-phone`}>Número importado na ElevenLabs</Label>
          <Input
            id={`${id}-ai-phone`}
            inputMode="tel"
            placeholder="+55 11 3000-0000"
            value={value.phone ?? ""}
            onChange={(e) => onChange({ kind: "ai", phone: e.target.value })}
          />
          <p className="text-[12px] text-muted-foreground">
            Na ElevenLabs, importe este mesmo número por SIP, com o + na frente, e ligue o agente
            nele.
          </p>
        </div>
      )}
      {value.kind === "phone" && (
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-phone`}>Celular do atendente</Label>
          <Input
            id={`${id}-phone`}
            inputMode="tel"
            placeholder="(48) 99999-0000"
            value={value.phone ?? ""}
            onChange={(e) => onChange({ kind: "phone", phone: e.target.value })}
          />
        </div>
      )}
      {value.kind === "zadarma" && (
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-sip`}>Endereço SIP da central</Label>
          <Input
            id={`${id}-sip`}
            placeholder="sip:100@pbx.zadarma.com"
            value={value.sipUri ?? ""}
            onChange={(e) => onChange({ kind: "zadarma", sipUri: e.target.value })}
          />
          <p className="text-[12px] text-muted-foreground">
            No painel da Zadarma, em PBX › Ramais, copie o endereço SIP da fila que vai atender.
          </p>
        </div>
      )}
      {!check.ok && value.kind !== "none" && (value.phone || value.sipUri) && (
        <p className="text-[12px] text-danger" role="alert">
          {check.error}
        </p>
      )}
    </div>
  );
}
