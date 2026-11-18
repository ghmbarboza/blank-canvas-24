import { hasChannel, hasPlatform } from "@/lib/edition";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Loader2, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { SettingsCard } from "@/features/settings/SettingsCard";
import { patchAccountSettings } from "@/features/settings/api";
import { supabase } from "@/integrations/supabase/client";
import { ACCOUNT_QUERY_KEY, useAccount } from "@/lib/account";
import { formatRelative } from "@/lib/format";
import { errorMessage } from "@/lib/functions";
import { DEFAULT_PRIVACY, PrivacySettings } from "./default-privacy";

const REASON: Record<string, string> = {
  unsubscribe: "Descadastro",
  bounce: "E-mail inválido (bounce)",
  complaint: "Marcou como spam",
  manual: "Manual",
  dnc: "Não ligar (Não Me Perturbe)",
  optout_spoken: "Pediu para não contatar",
};
const CHANNEL: Record<string, string> = {
  email: "E-mail",
  whatsapp: "WhatsApp",
  sms: "SMS",
  voice: "Ligação",
};

/** Gravação só existe com telefone ou reunião por vídeo na edição. */
const RECORDS = hasChannel("phone") || hasChannel("video");

// LGPD na prática: aviso de gravação, retenção, opt-in e a lista de quem não pode ser contatado.
export function PrivacyTab() {
  const { current, isManager } = useAccount();
  const accountId = current!.accountId;
  const qc = useQueryClient();
  const saved = {
    ...DEFAULT_PRIVACY,
    ...((current!.settings as Record<string, unknown>)["privacy"] as
      Partial<PrivacySettings> | undefined),
  };
  const [form, setForm] = useState<PrivacySettings>(saved);
  useEffect(() => setForm(saved), [JSON.stringify(saved)]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = useMutation({
    mutationFn: () =>
      patchAccountSettings(accountId, (cur) => ({ ...cur, privacy: form as never })),
    onSuccess: () => {
      toast.success("Política de privacidade salva");
      void qc.invalidateQueries({ queryKey: ACCOUNT_QUERY_KEY });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const set = <K extends keyof PrivacySettings>(k: K, v: PrivacySettings[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="space-y-6">
      <SettingsCard
        title="Privacidade e LGPD"
        description={
          RECORDS
            ? "Regras aplicadas em todas as gravações, ligações, reuniões e envios da conta. Uma vez por dia o sistema apaga sozinho as gravações e transcrições que passaram do prazo e registra isso na Auditoria."
            : "Regras aplicadas em todos os envios da conta. O que passa do prazo é apagado sozinho e fica registrado no Histórico de alterações."
        }
        readOnlyNote={isManager ? undefined : "Só gestores alteram a política."}
      >
        <form
          className="grid gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          {RECORDS && (
            <div className="grid gap-1.5">
              <Label htmlFor="pv-notice">
                Aviso de gravação (lido no início da ligação e mostrado na entrada da reunião)
              </Label>
              <Textarea
                id="pv-notice"
                rows={3}
                value={form.recording_notice}
                onChange={(e) => set("recording_notice", e.target.value)}
                disabled={!isManager}
              />
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            {RECORDS && (
              <div className="grid gap-1.5">
                <Label>Guardar gravações por</Label>
                <Select
                  value={String(form.retention_recordings_days)}
                  onValueChange={(v) => set("retention_recordings_days", Number(v))}
                  disabled={!isManager}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[30, 90, 180, 365, 730].map((d) => (
                      <SelectItem key={d} value={String(d)}>
                        {d} dias
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {RECORDS && (
              <div className="grid gap-1.5">
                <Label>Guardar transcrições por</Label>
                <Select
                  value={String(form.retention_transcripts_days)}
                  onValueChange={(v) => set("retention_transcripts_days", Number(v))}
                  disabled={!isManager}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[90, 180, 365, 730, 1825].map((d) => (
                      <SelectItem key={d} value={String(d)}>
                        {d} dias
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor="pv-qs">Não contatar a partir de</Label>
              <Input
                id="pv-qs"
                type="time"
                value={form.quiet_hours_start}
                onChange={(e) => set("quiet_hours_start", e.target.value)}
                disabled={!isManager}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pv-qe">Voltar a contatar a partir de</Label>
              <Input
                id="pv-qe"
                type="time"
                value={form.quiet_hours_end}
                onChange={(e) => set("quiet_hours_end", e.target.value)}
                disabled={!isManager}
              />
            </div>
          </div>
          <label className="flex items-center justify-between gap-4 rounded-xl border border-border px-4 py-3 text-[13px]">
            <span>
              <span className="font-medium">Opt-in duplo no e-mail</span>
              <span className="block text-[12px] text-muted-foreground">
                Quem entra por formulário confirma o e-mail antes de receber campanhas.
              </span>
            </span>
            <Switch
              checked={form.email_double_opt_in}
              onCheckedChange={(c) => set("email_double_opt_in", c)}
              disabled={!isManager}
            />
          </label>
          <label className="flex items-center justify-between gap-4 rounded-xl border border-border px-4 py-3 text-[13px]">
            <span>
              <span className="font-medium">Marketing por WhatsApp só com consentimento</span>
              <span className="block text-[12px] text-muted-foreground">
                Campanhas e automações de marketing pulam quem não deu consentimento registrado.
              </span>
            </span>
            <Switch
              checked={form.whatsapp_marketing_requires_consent}
              onCheckedChange={(c) => set("whatsapp_marketing_requires_consent", c)}
              disabled={!isManager}
            />
          </label>
          {isManager && (
            <div>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? <Loader2 className="animate-spin" /> : <ShieldCheck />} Salvar
                política
              </Button>
            </div>
          )}
        </form>
      </SettingsCard>
      <Suppressions accountId={accountId} isManager={isManager} />
    </div>
  );
}

function Suppressions({ accountId, isManager }: { accountId: string; isManager: boolean }) {
  const qc = useQueryClient();
  const [channel, setChannel] = useState(hasChannel("email") ? "email" : "whatsapp");
  const [address, setAddress] = useState("");
  const [q, setQ] = useState("");
  const list = useQuery({
    queryKey: ["suppressions", accountId, q],
    queryFn: async () => {
      let query = supabase
        .from("suppressions")
        .select("*")
        .eq("account_id", accountId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (q.trim()) query = query.ilike("address", `%${q.trim()}%`);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });
  const add = useMutation({
    mutationFn: async () => {
      const addr = channel === "email" ? address.trim().toLowerCase() : address.replace(/\D/g, "");
      if (!addr) throw new Error("Informe o endereço");
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("suppressions").insert({
        account_id: accountId,
        channel,
        address: addr,
        reason: channel === "voice" ? "dnc" : "manual",
        source: "ajustes",
        created_by: u.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setAddress("");
      toast.success("Adicionado à lista de não contatar");
      void qc.invalidateQueries({ queryKey: ["suppressions", accountId] });
    },
    onError: (e) =>
      toast.error(errorMessage(e).includes("duplicate") ? "Já está na lista" : errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("suppressions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["suppressions", accountId] }),
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <SettingsCard
      title="Não contatar"
      description={
        hasChannel("phone")
          ? "Descadastros, bounces, reclamações e pedidos de “não me ligue”. Nenhum envio, campanha, automação ou discador alcança quem está aqui."
          : "Quem pediu para não receber mensagens. Nenhum envio ou automação alcança quem está aqui."
      }
    >
      <form
        className="mb-4 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate();
        }}
      >
        <Select value={channel} onValueChange={setChannel}>
          <SelectTrigger className="w-36" aria-label="Canal">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(CHANNEL)
              .filter(([k]) => hasPlatform(k))
              .map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <Input
          className="min-w-0 flex-1"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder={channel === "email" ? "email@exemplo.com" : "Telefone com DDD"}
          aria-label="Endereço"
        />
        <Button type="submit" variant="outline" disabled={add.isPending}>
          <Plus /> Adicionar
        </Button>
      </form>
      <Input
        className="mb-3"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar na lista"
        aria-label="Buscar"
      />
      <ul className="max-h-80 divide-y divide-border overflow-y-auto rounded-xl border border-border">
        {(list.data ?? []).length === 0 && (
          <li className="px-4 py-6 text-center text-[12px] text-muted-foreground">Lista vazia.</li>
        )}
        {(list.data ?? []).map((s) => (
          <li key={s.id} className="flex items-center gap-3 px-4 py-2">
            <Ban className="size-3.5 text-subtle" aria-hidden />
            <span className="min-w-0 flex-1 truncate font-mono text-[12px]">{s.address}</span>
            <span className="hidden text-[11px] text-subtle sm:inline">
              {CHANNEL[s.channel]} · {REASON[s.reason] ?? s.reason} · {formatRelative(s.created_at)}
            </span>
            {isManager && (
              <button
                type="button"
                aria-label="Remover da lista"
                onClick={() => remove.mutate(s.id)}
                className="rounded-full p-1.5 text-subtle hover:bg-surface-2 hover:text-danger"
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
          </li>
        ))}
      </ul>
    </SettingsCard>
  );
}
