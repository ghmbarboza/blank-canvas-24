// Blocos que as ferramentas da assistente desenham dentro da conversa: o WhatsApp por QR Code
// (formulário seguro, código que se atualiza e vira "Conectado" sozinho) e a prévia do que foi
// lido no site. Em resposta antiga viram uma linha: nada fica conferindo em segundo plano.
import { Check } from "lucide-react";
import { useRef } from "react";

import type { StageBlock } from "@/backend/setup-agent/stage";
import { SiteImportPreview } from "@/features/catalog/SiteImportPreview";
import { EvolutionConnect } from "@/features/channels/EvolutionConnect";
import { QrPanel } from "@/features/channels/QrPanel";

type WhatsAppBlock = Extract<StageBlock, { kind: "whatsapp" }>;
type SiteBlock = Extract<StageBlock, { kind: "site_import" }>;

interface Common {
  accountId: string;
  /** só a última resposta fica viva; nas antigas o bloco é uma linha de registro */
  live: boolean;
  /** a assistente não está falando: pode mandar a continuação da conversa */
  active: boolean;
  onAnswer: (text: string) => void;
}

function Line({ children }: { children: string }) {
  return (
    <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
      <Check className="size-3.5" aria-hidden /> {children}
    </p>
  );
}

export function WhatsAppBlockView({
  block,
  accountId,
  live,
  onAnswer,
}: Common & { block: WhatsAppBlock }) {
  const told = useRef(false);
  if (!live)
    return (
      <Line>
        {block.channelId
          ? "QR Code do WhatsApp mostrado aqui"
          : "Conexão do WhatsApp mostrada aqui"}
      </Line>
    );
  // conectou: a conversa segue sozinha para o próximo passo (uma vez só)
  const connected = () => {
    if (told.current) return;
    told.current = true;
    onAnswer("Pronto, li o QR Code e o WhatsApp conectou.");
  };
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <h3 className="text-[14px] font-semibold">{block.title}</h3>
      {block.hint ? <p className="mt-1 text-[13px] text-muted-foreground">{block.hint}</p> : null}
      <div className="mt-4">
        {block.channelId ? (
          <QrPanel accountId={accountId} channelId={block.channelId} onConnected={connected} />
        ) : (
          <EvolutionConnect accountId={accountId} onConnected={connected} />
        )}
      </div>
    </div>
  );
}

export function SiteImportBlockView({
  block,
  accountId,
  live,
  active,
  onAnswer,
}: Common & { block: SiteBlock }) {
  if (!live)
    return (
      <Line>
        {block.preview.items.length
          ? `Prévia de ${block.preview.items.length} itens lidos do site`
          : "Resumo do que foi lido no site"}
      </Line>
    );
  return (
    <SiteImportPreview
      accountId={accountId}
      preview={block.preview}
      fillCompany
      active={active}
      onDone={(_r, text) => onAnswer(`Conferi e confirmei a importação do site: ${text}.`)}
    />
  );
}
