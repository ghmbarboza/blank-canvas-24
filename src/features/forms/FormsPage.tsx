import { Link } from "@tanstack/react-router";
import {
  BarChart3,
  ClipboardList,
  Copy,
  Inbox,
  LayoutTemplate,
  Loader2,
  MessageCircle,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAccount } from "@/lib/account";
import { formatMoney, formatRelative } from "@/lib/format";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";

import { countLabel } from "@/lib/plural";
import { useAttribution, useSaveWebchat, useSubmissions, useWebchatChannels } from "./api";
import { copyText } from "./copy-text";
import { SOURCE_LABEL } from "./sources";
import { SourcesList } from "./SourcesList";

// Captação: formulários, landing pages, chat do site, respostas e de onde vêm os leads.
export function FormsPage() {
  const { current } = useAccount();
  const accountId = current!.accountId;
  const [tab, setTab] = useState("forms");
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="Captação"
        description="As portas de entrada do seu negócio: quem preenche vira contato e cai direto no atendimento."
      />
      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
        <TabsList className="mx-4 mt-3 w-fit max-w-[calc(100%-2rem)] justify-start overflow-x-auto sm:mx-6 sm:max-w-[calc(100%-3rem)]">
          <TabsTrigger value="forms">
            <ClipboardList className="mr-1 size-3.5" /> Entradas
          </TabsTrigger>
          <TabsTrigger value="pages" asChild>
            <Link to="/formularios/paginas">
              <LayoutTemplate className="mr-1 size-3.5" /> Páginas
            </Link>
          </TabsTrigger>
          <TabsTrigger value="chat">
            <MessageCircle className="mr-1 size-3.5" /> Chat do site
          </TabsTrigger>
          <TabsTrigger value="responses">
            <Inbox className="mr-1 size-3.5" /> Respostas
          </TabsTrigger>
          <TabsTrigger value="origin">
            <BarChart3 className="mr-1 size-3.5" /> Origem dos leads
          </TabsTrigger>
        </TabsList>
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <TabsContent value="forms" className="m-0">
            <div className="mx-auto w-full max-w-5xl">
              <SourcesList accountId={accountId} onOpenChat={() => setTab("chat")} />
            </div>
          </TabsContent>
          <TabsContent value="chat" className="m-0">
            <WebchatPanel accountId={accountId} />
          </TabsContent>
          <TabsContent value="responses" className="m-0">
            <Submissions accountId={accountId} />
          </TabsContent>
          <TabsContent value="origin" className="m-0">
            <Attribution accountId={accountId} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

function WebchatPanel({ accountId }: { accountId: string }) {
  const { isAdmin } = useAccount();
  const chans = useWebchatChannels(accountId);
  const save = useSaveWebchat(accountId);
  const ch = chans.data?.[0];
  const cfg = (ch?.config ?? {}) as Record<string, unknown>;
  const [form, setForm] = useState<{
    name: string;
    greeting: string;
    color: string;
    ai: boolean;
    ask_email: boolean;
  } | null>(null);
  const v = form ?? {
    name: ch?.name ?? "Chat do site",
    greeting: (cfg["greeting"] as string) ?? "Oi! Como podemos ajudar?",
    color: (cfg["color"] as string) ?? "#001F35",
    // a chave que vale é a do canal (a mesma do botão em Canais); chat novo nasce com IA ligada
    ai: ch ? Boolean((ch as { ai_enabled?: boolean }).ai_enabled ?? cfg["ai"]) : true,
    ask_email: cfg["ask_email"] !== false,
  };
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const snippet = `<script src="${origin}/api/public/widget.js" data-account="${accountId}"${ch ? ` data-chat="${ch.id}"` : ""} async></script>`;

  if (chans.isPending) return <Skeleton className="h-64 rounded-[24px]" />;
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="rounded-[24px] border border-border bg-surface p-5">
        <p className="eyebrow mb-3">{ch ? "Configuração do chat" : "Ligar o chat do site"}</p>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="wc-name">Nome que o visitante vê</Label>
            <Input
              id="wc-name"
              value={v.name}
              onChange={(e) => setForm({ ...v, name: e.target.value })}
              disabled={!isAdmin}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="wc-greet">Saudação</Label>
            <Textarea
              id="wc-greet"
              rows={2}
              value={v.greeting}
              onChange={(e) => setForm({ ...v, greeting: e.target.value })}
              disabled={!isAdmin}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="wc-color">Cor</Label>
            <Input
              id="wc-color"
              type="color"
              className="h-10 w-24 p-1"
              value={v.color}
              onChange={(e) => setForm({ ...v, color: e.target.value })}
              disabled={!isAdmin}
            />
          </div>
          <label className="flex items-center justify-between rounded-xl border border-border px-3 py-2.5 text-[13px]">
            Pedir nome e e-mail antes de conversar
            <Switch
              checked={v.ask_email}
              onCheckedChange={(c) => setForm({ ...v, ask_email: c })}
              disabled={!isAdmin}
            />
          </label>
          <label className="flex items-center justify-between rounded-xl border border-border px-3 py-2.5 text-[13px]">
            IA responde no chat (quando ligada nas conversas)
            <Switch
              checked={v.ai}
              onCheckedChange={(c) => setForm({ ...v, ai: c })}
              disabled={!isAdmin}
            />
          </label>
          {isAdmin && (
            <Button
              className="w-fit"
              disabled={save.isPending}
              onClick={() =>
                save.mutate(
                  { ...(ch ? { channelId: ch.id } : {}), ...v },
                  {
                    onSuccess: () => {
                      toast.success(
                        ch ? "Chat atualizado" : "Chat criado: cole o código no seu site",
                      );
                      setForm(null);
                    },
                    onError: (e) => toast.error(errorMessage(e)),
                  },
                )
              }
            >
              {save.isPending && <Loader2 className="animate-spin" />}{" "}
              {ch ? "Salvar" : "Criar chat do site"}
            </Button>
          )}
        </div>
      </section>
      <section className="rounded-[24px] border border-border bg-surface p-5">
        <p className="eyebrow mb-2">Código para o site</p>
        <p className="mb-3 text-[13px] text-muted-foreground">
          Cole antes do fechamento do &lt;/body&gt;. Ele registra visitas (sem cookies de
          terceiros), mostra o chat e renderiza formulários em{" "}
          <code className="font-mono">&lt;div data-vinculo-form="ID"&gt;</code>.
        </p>
        <pre className="overflow-x-auto rounded-xl bg-[#001F35] p-4 font-mono text-[11px] leading-relaxed text-white/90">
          {snippet}
        </pre>
        <Button size="sm" variant="outline" className="mt-3" onClick={() => copyText(snippet)}>
          <Copy /> Copiar código
        </Button>
        <p className="mt-4 text-[12px] text-subtle">
          As conversas chegam na Caixa de entrada como canal “Chat do site” e as respostas voltam
          para o visitante.
        </p>
      </section>
    </div>
  );
}

function Submissions({ accountId }: { accountId: string }) {
  const subs = useSubmissions(accountId);
  if (subs.isPending) return <Skeleton className="h-64 rounded-[24px]" />;
  const list = subs.data ?? [];
  if (list.length === 0)
    return (
      <EmptyState
        icon={Inbox}
        title="Nenhuma resposta ainda"
        description="Assim que alguém enviar um formulário, falar no chat ou chegar por anúncio, aparece aqui."
      />
    );
  return (
    <div className="overflow-x-auto rounded-[24px] border border-border bg-surface">
      <table className="w-full text-left text-[13px]">
        <thead className="border-b border-border text-[11px] tracking-wide text-subtle uppercase">
          <tr>
            <th className="px-4 py-3">Quem</th>
            <th className="px-4 py-3">Por onde</th>
            <th className="px-4 py-3">Origem</th>
            <th className="px-4 py-3">Quando</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {list.map((s) => {
            const c = s.contacts as unknown as {
              name: string | null;
              email: string | null;
              phone: string | null;
            } | null;
            const utm = (s.utm ?? {}) as Record<string, string>;
            return (
              <tr key={s.id} className="row-wash">
                <td className="px-4 py-2.5">
                  {s.contact_id ? (
                    <Link
                      to="/contatos/$contactId"
                      params={{ contactId: s.contact_id }}
                      className="font-medium hover:underline"
                    >
                      {c?.name ?? c?.email ?? "Contato"}
                    </Link>
                  ) : (
                    "—"
                  )}
                  <p className="text-[11px] text-subtle">{c?.email ?? c?.phone ?? ""}</p>
                </td>
                <td className="px-4 py-2.5">
                  {SOURCE_LABEL[s.source] ?? s.source}
                  {(s.forms as unknown as { name: string } | null)?.name
                    ? ` · ${(s.forms as unknown as { name: string }).name}`
                    : ""}
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  {[utm["utm_source"], utm["utm_campaign"]].filter(Boolean).join(" · ") ||
                    (s.referrer ? new URL(s.referrer).hostname : "direto")}
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  {formatRelative(s.created_at)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Attribution({ accountId }: { accountId: string }) {
  const [days, setDays] = useState(30);
  const q = useAttribution(accountId, days);
  const rows = q.data ?? [];
  const max = Math.max(1, ...rows.map((r) => r.leads));
  return (
    <section className="rounded-[24px] border border-border bg-surface p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="eyebrow">Primeiro toque: de onde os leads vieram</p>
        <div className="flex gap-1">
          {[7, 30, 90, 365].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={cn(
                "rounded-full px-3 py-1 text-[12px]",
                d === days
                  ? "bg-primary text-primary-foreground"
                  : "border border-border text-muted-foreground",
              )}
            >
              {d === 365 ? "12 meses" : `${d} dias`}
            </button>
          ))}
        </div>
      </div>
      {q.isPending ? (
        <Skeleton className="h-40" />
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-[13px] text-muted-foreground">Sem leads no período.</p>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((r) => (
            <li
              key={`${r.source}-${r.medium}`}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3"
            >
              <div>
                <div className="flex items-baseline justify-between gap-2 text-[13px]">
                  <span className="truncate font-medium">
                    {r.source} <span className="text-subtle">· {r.medium}</span>
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {countLabel(r.leads, "lead")} · {countLabel(r.customers, "cliente")}
                  </span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-surface-2">
                  <div
                    className="h-2 rounded-full bg-[#001F35]"
                    style={{ width: `${(r.leads / max) * 100}%` }}
                  />
                </div>
              </div>
              <span className="w-24 text-right font-display text-[14px] font-semibold tabular-nums">
                {formatMoney(r.revenue, true)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
