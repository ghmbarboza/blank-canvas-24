// "O que falta configurar?" e "está tudo funcionando?": confere o estado real da conta (canal,
// atendente, base, regras, catálogo, agendador, última mensagem) e devolve o diagnóstico em
// linguagem simples, com o que fazer em cada ponto que não está bom.
import { admin } from "@/backend/http.server";
import { RULES, dailyCapOf, ruleFlags } from "@/features/posvenda/rules";

import type { Runner } from "../runner-types";
import type { StepState } from "../stage";

interface Check {
  label: string;
  ok: boolean;
  /** o que fazer quando não está bom */
  fix?: string;
  /** opcional: não conta como problema */
  optional?: boolean;
}

const ago = (iso: string) => {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (min < 2) return "agora há pouco";
  if (min < 60) return `há ${min} minutos`;
  if (min < 48 * 60) return `há ${Math.round(min / 60)} horas`;
  return `há ${Math.round(min / 1440)} dias`;
};

export async function diagnose(accountId: string): Promise<Check[]> {
  const db = admin();
  const [acc, channels, agents, docs, products, lastIn, lastOut, cron, beat, integ] =
    await Promise.all([
      db.from("accounts").select("name, settings").eq("id", accountId).single(),
      db
        .from("channels")
        .select("platform, provider, status, handle, name, ai_enabled")
        .eq("account_id", accountId),
      db
        .from("ai_agents")
        .select("name, status, role")
        .eq("account_id", accountId)
        .neq("role", "supervisor"),
      db.from("kb_documents").select("status").eq("account_id", accountId).limit(500),
      db
        .from("products")
        .select("id", { head: true, count: "exact" })
        .eq("account_id", accountId)
        .eq("active", true),
      db
        .from("messages")
        .select("created_at")
        .eq("account_id", accountId)
        .eq("direction", "in")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      db
        .from("messages")
        .select("created_at, status")
        .eq("account_id", accountId)
        .eq("direction", "out")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      db.rpc("cron_config"),
      db
        .from("service_heartbeats")
        .select("last_seen")
        .order("last_seen", { ascending: false })
        .limit(1)
        .maybeSingle(),
      db
        .from("account_integrations")
        .select("provider, status, last_error")
        .eq("account_id", accountId),
    ]);
  const settings = acc.data?.settings ?? {};
  const segment = (settings as { setup?: { segment?: string } }).setup?.segment;
  const wa = (channels.data ?? []).filter((c) => c.platform === "whatsapp");
  const waOn = wa.find((c) => c.status === "connected");
  const evo = (integ.data ?? []).find((i) => i.provider === "evolution");
  const agent = (agents.data ?? []).find((a) => a.status === "active") ?? (agents.data ?? [])[0];
  const ready = (docs.data ?? []).filter((d) => d.status === "ready").length;
  const failed = (docs.data ?? []).filter((d) => d.status === "error").length;
  const reading = (docs.data ?? []).filter((d) => d.status === "processing").length;
  const flags = ruleFlags(settings);
  const on = RULES.filter((r) => flags[r.key]).map((r) => r.title);
  const baseUrl = (cron.data as { base_url?: string | null } | null)?.base_url;
  const beatAt = (beat.data as { last_seen?: string } | null)?.last_seen;
  const beatFresh = beatAt ? Date.now() - new Date(beatAt).getTime() < 10 * 60_000 : false;

  return [
    {
      label:
        acc.data?.name && segment ? `Empresa: ${acc.data.name}` : "Empresa: falta o nome ou o ramo",
      ok: Boolean(acc.data?.name && segment),
      fix: "diga o nome e o ramo da empresa (ou passe o site que eu leio)",
    },
    {
      label: waOn
        ? `WhatsApp conectado${waOn.handle ? ` (${waOn.handle})` : ""}`
        : wa.length
          ? "WhatsApp: número criado, mas o QR Code ainda não foi lido"
          : evo?.status === "error"
            ? "WhatsApp: o servidor salvo não respondeu"
            : "WhatsApp: ainda não conectado",
      ok: Boolean(waOn),
      fix: wa.length
        ? "gere outro QR Code e leia com o celular da empresa"
        : "conecte o WhatsApp (endereço e chave do servidor, depois o QR Code)",
    },
    {
      label: agent
        ? `Atendente ${agent.name}: ${agent.status === "active" ? "ligado" : "desligado"}`
        : "Atendente de IA: ainda não criado",
      ok: agent?.status === "active",
      fix: agent ? "peça para ligar o atendente" : "peça para criar o atendente",
    },
    ...(agent?.status === "active" && waOn && !waOn.ai_enabled
      ? [
          {
            label: "A resposta automática está desligada no número do WhatsApp",
            ok: false,
            fix: "peça para ligar o atendente de novo (isso liga a resposta automática no número)",
          },
        ]
      : []),
    {
      label: ready
        ? `Base de conhecimento: ${ready} item(ns) pronto(s)${reading ? `, ${reading} sendo lido(s)` : ""}${failed ? `, ${failed} com erro` : ""}`
        : reading
          ? `Base de conhecimento: ${reading} item(ns) sendo lido(s)`
          : "Base de conhecimento: vazia (o atendente só sabe o básico)",
      ok: ready > 0,
      fix: "mande um arquivo, cole um texto ou passe o site",
    },
    {
      label: on.length ? `Regras ligadas: ${on.join(", ")}` : "Regras de pós-venda: nenhuma ligada",
      ok: on.length > 0,
      fix: 'diga "liga tudo" ou escolha as regras',
    },
    {
      label: `Teto de envios por dia: ${dailyCapOf(settings) === 0 ? "sem teto" : dailyCapOf(settings)}`,
      ok: true,
      optional: true,
    },
    {
      label: `Catálogo: ${products.count ?? 0} item(ns)`,
      ok: (products.count ?? 0) > 0,
      optional: true,
      fix: "passe o site ou diga os itens e preços",
    },
    {
      label: baseUrl
        ? beatFresh
          ? "Agendador rodando (mensagens programadas saem na hora certa)"
          : `Agendador: sem sinal ${beatAt ? ago(beatAt) : "até agora"}`
        : "Agendador: ainda não ligado nesta cópia do app",
      ok: Boolean(baseUrl) && beatFresh,
      fix: baseUrl
        ? "abra o app publicado e espere dois minutos; se continuar sem sinal, republique o app"
        : "o dono precisa abrir o app PUBLICADO uma vez (não a prévia): isso grava o endereço e liga o agendador",
    },
    {
      label: lastIn.data
        ? `Última mensagem de cliente recebida ${ago(lastIn.data.created_at)}`
        : "Nenhuma mensagem de cliente recebida ainda",
      ok: Boolean(lastIn.data),
      optional: !waOn,
      fix: "mande um Oi de outro celular para o número conectado e veja chegar na Caixa de entrada",
    },
    ...(lastOut.data?.status === "failed"
      ? [
          {
            label: `A última mensagem enviada falhou (${ago(lastOut.data.created_at)})`,
            ok: false,
            fix: "confira se o WhatsApp continua conectado",
          },
        ]
      : []),
  ];
}

export const STATUS_RUNNERS: Record<string, Runner> = {
  async diagnostico(ctx) {
    const checks = await diagnose(ctx.caller.accountId);
    const problems = checks.filter((c) => !c.ok && !c.optional);
    const firstBad = checks.findIndex((c) => !c.ok && !c.optional);
    return {
      content: [
        problems.length
          ? `${problems.length} ponto(s) para resolver:`
          : "Tudo o que importa está funcionando.",
        ...checks.map(
          (c) =>
            `- [${c.ok ? "ok" : c.optional ? "opcional" : "FALTA"}] ${c.label}${!c.ok && c.fix ? ` → ${c.fix}` : ""}`,
        ),
        "O resumo está na tela: no texto, diga só o principal (o que falta primeiro) e ofereça resolver agora.",
      ].join("\n"),
      block: {
        kind: "steps",
        title: problems.length ? "O que falta" : "Tudo funcionando",
        steps: checks.slice(0, 8).map((c, i) => ({
          label: c.label.slice(0, 90),
          state: (c.ok ? "feito" : i === firstBad ? "agora" : "depois") as StepState,
        })),
      },
    };
  },
};
