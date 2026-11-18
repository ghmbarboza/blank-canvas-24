import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, MessageSquarePlus, Undo2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";

import { ChannelIcon } from "@/components/brand/ChannelIcon";

import { agentKeys, agentsApi } from "./api";
import { agentChannelsFor, agentChannelLabel, roleDef, TEMPLATES } from "./catalog";

type Props = {
  accountId: string;
  open: boolean;
  hasAgents: boolean;
  onClose: () => void;
  onCreated: (agentId: string) => void;
};

const EXAMPLE =
  "Cria um agente de cobrança que lembra o vencimento com educação, oferece Pix ou boleto e parcela em até 3x sem juros. Fora disso, passa para o financeiro.";

// Novo agente: a partir de um modelo pronto ou descrevendo com as próprias palavras.
export function NewAgentDialog({ accountId, open, hasAgents, onClose, onCreated }: Props) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [text, setText] = useState("");
  // "" = atende os canais que não têm agente próprio
  const [channel, setChannel] = useState<string>("");

  async function run(key: string, fn: () => Promise<string>) {
    setBusy(key);
    try {
      const id = await fn();
      await qc.invalidateQueries({ queryKey: agentKeys.all(accountId) });
      toast.success(
        channel
          ? `Agente do ${agentChannelLabel(channel)} criado em rascunho. Teste e rode a avaliação para ligar.`
          : "Agente criado em rascunho. Teste e rode a avaliação para ligar.",
      );
      setText("");
      onCreated(id);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Novo agente</DialogTitle>
          <DialogDescription>
            Escolha um modelo pronto ou descreva o agente com suas palavras. Ele nasce em rascunho,
            com perguntas de teste tiradas da sua base e das conversas reais.
          </DialogDescription>
        </DialogHeader>

        <fieldset>
          <legend className="eyebrow">Para qual canal</legend>
          <p className="mt-1 text-[12px] text-subtle">
            Cada canal pode ter o seu agente, com jeito e regras próprios. Ele nasce como a porta de
            entrada do canal escolhido, se o canal ainda não tiver uma.
          </p>
          <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Canal do agente">
            {[{ id: "", label: "Todos os outros" }, ...agentChannelsFor()].map((c) => {
              const on = channel === c.id;
              return (
                <button
                  key={c.id || "todos"}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={!!busy}
                  onClick={() => setChannel(c.id)}
                  className={cn(
                    "row-wash inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[13px]",
                    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    on ? "border-primary bg-primary/5 font-medium" : "border-border",
                  )}
                >
                  {c.id && (
                    <span aria-hidden className="inline-flex">
                      <ChannelIcon platform={c.id} size={14} />
                    </span>
                  )}
                  {c.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <section
          aria-labelledby="descrever"
          className="rounded-xl bg-primary p-4 text-primary-foreground"
        >
          <h3 id="descrever" className="flex items-center gap-2 text-[14px] font-medium">
            <MessageSquarePlus className="size-4" aria-hidden /> Descreva o agente
          </h3>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={EXAMPLE}
            rows={3}
            className="mt-3 border-white/20 bg-white/10 text-primary-foreground placeholder:text-white/60"
            aria-label="Descrição do agente"
          />
          <div className="mt-3 flex justify-end">
            <Button
              variant="secondary"
              size="sm"
              disabled={!!busy || text.trim().length < 10}
              onClick={() =>
                run(
                  "text",
                  async () =>
                    (
                      await agentsApi<{ agentId: string }>(accountId, "agent.draft_from_text", {
                        text,
                        channel,
                      })
                    ).agentId,
                )
              }
            >
              {busy === "text" ? <Loader2 className="animate-spin" /> : null} Montar o agente
            </Button>
          </div>
        </section>

        <h3 className="eyebrow mt-2">Modelos prontos</h3>
        <ul className="grid gap-2 sm:grid-cols-2">
          {TEMPLATES.map((t) => (
            <li key={t.key}>
              <button
                type="button"
                disabled={!!busy}
                onClick={() =>
                  run(
                    t.key,
                    async () =>
                      (
                        await agentsApi<{ agentId: string }>(accountId, "template.create", {
                          template: t.key,
                          channel,
                        })
                      ).agentId,
                  )
                }
                className={cn(
                  "row-wash flex h-full w-full flex-col rounded-xl border border-border p-3 text-left",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60",
                  !hasAgents && t.role === "reception" && "border-primary",
                )}
              >
                <span className="flex items-center gap-2 text-[14px] font-semibold">
                  {busy === t.key && <Loader2 className="size-4 animate-spin" />}
                  {t.name}
                  {!hasAgents && t.role === "reception" && (
                    <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground">
                      comece por aqui
                    </span>
                  )}
                </span>
                <span className="mt-1 text-[12px] text-muted-foreground">
                  {roleDef(t.role).summary}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          disabled={!!busy}
          onClick={() =>
            run("legacy", async () => {
              const { data, error } = await supabase.rpc("agents_import_legacy", {
                _account: accountId,
              });
              if (error) throw error;
              return data as string;
            })
          }
          className="mt-1 inline-flex items-center gap-2 self-start text-[13px] text-muted-foreground hover:text-foreground"
        >
          <Undo2 className="size-4" aria-hidden /> Trazer o agente que já atende no Atendimento
          (SAC)
        </button>
      </DialogContent>
    </Dialog>
  );
}
