import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Loader2, Plug } from "lucide-react";
import { toast } from "sonner";

import { Switch } from "@/components/ui/switch";
import { useAccount } from "@/lib/account";
import { errorMessage } from "@/lib/functions";

import { agentsApi, useAgentTools, useComposioState, useToggleTool, type Agent } from "./api";
import { composioToolkit, INTERNAL_TOOLS } from "./catalog";

interface ToolInfo {
  slug: string;
  name: string;
  description: string;
  toolkit: string;
  input_parameters: Record<string, unknown>;
}

// O que o agente pode fazer: ferramentas da plataforma e ações nos apps conectados (Composio).
export function AgentToolsPanel({ accountId, agent }: { accountId: string; agent: Agent }) {
  const { isManager } = useAccount();
  const tools = useAgentTools(accountId);
  const composio = useComposioState(accountId);
  const toggle = useToggleTool(accountId);
  const [pending, setPending] = useState<string | null>(null);
  const mine = (tools.data ?? []).filter((t) => t.agent_id === agent.id);
  const has = (kind: string, slug: string) => mine.some((t) => t.kind === kind && t.slug === slug);
  const active = (composio.data?.connections ?? []).filter((c) => c.status === "active");

  async function flip(kind: "internal" | "composio", slug: string, on: boolean, toolkit?: string) {
    setPending(slug);
    try {
      let config: Record<string, unknown> | undefined;
      if (kind === "composio" && on && toolkit) {
        // guarda o esquema da ação para o modelo não depender da Composio a cada turno
        const r = await agentsApi<{ tools: ToolInfo[] }>(accountId, "composio.tools", { toolkit });
        const t = r.tools.find((x) => x.slug === slug);
        if (!t) throw new Error("Essa ação não está disponível na sua conta da Composio");
        config = {
          toolkit,
          name: t.name,
          description: t.description,
          input_parameters: t.input_parameters,
        };
      }
      await toggle.mutateAsync({
        agentId: agent.id,
        kind,
        slug,
        on,
        ...(config ? { config } : {}),
      });
      if (agent.status === "active")
        toast.message("O agente pausou: rode a avaliação de novo para ligar.");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-6 pt-4">
      <section aria-labelledby="t-int">
        <h3 id="t-int" className="eyebrow mb-2">
          Da plataforma
        </h3>
        <ul className="divide-y divide-border rounded-xl border border-border">
          {INTERNAL_TOOLS.map((t) => (
            <li key={t.slug} className="flex items-start justify-between gap-4 px-4 py-3">
              <span>
                <span className="block text-[13px] font-medium">{t.label}</span>
                <span className="block text-[12px] text-subtle">
                  {t.help}
                  {t.requires === "booking" && " Precisa da página de agendamento em Configurar."}
                  {t.requires === "asaas" && " Precisa do Asaas em Ajustes › Integrações."}
                </span>
              </span>
              {pending === t.slug ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Switch
                  checked={has("internal", t.slug)}
                  disabled={!isManager || !!pending}
                  onCheckedChange={(v) => void flip("internal", t.slug, v)}
                  aria-label={t.label}
                />
              )}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="t-cp">
        <h3 id="t-cp" className="eyebrow mb-2">
          Nos seus apps (Composio)
        </h3>
        {active.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-4 text-[13px] text-muted-foreground">
            Nenhum app conectado ainda. Conecte Gmail, Agenda, HubSpot, Planilhas e outros em{" "}
            <Link
              to="/equipe-ia/ferramentas"
              className="inline-flex items-center gap-1 font-medium text-foreground underline"
            >
              <Plug className="size-3.5" aria-hidden /> Ferramentas conectadas
            </Link>
            .
          </div>
        ) : (
          <div className="space-y-3">
            {active.map((c) => {
              const def = composioToolkit(c.toolkit);
              return (
                <div key={c.id} className="rounded-xl border border-border">
                  <p className="border-b border-border px-4 py-2 text-[13px] font-semibold">
                    {def?.name ?? c.toolkit}
                  </p>
                  <ul className="divide-y divide-border">
                    {(def?.suggested ?? []).map((s) => (
                      <li
                        key={s.slug}
                        className="flex items-center justify-between gap-4 px-4 py-2.5"
                      >
                        <span className="text-[13px]">{s.label}</span>
                        {pending === s.slug ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Switch
                            checked={has("composio", s.slug)}
                            disabled={!isManager || !!pending}
                            onCheckedChange={(v) => void flip("composio", s.slug, v, c.toolkit)}
                            aria-label={s.label}
                          />
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
