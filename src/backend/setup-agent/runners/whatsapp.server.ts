// WhatsApp por QR Code pela conversa: guarda o servidor (endereço e chave), cria a conexão e manda
// para a tela o bloco com o QR Code, que se atualiza e vira "Conectado" sozinho. A chave só passa
// por aqui para ir ao cofre: nunca volta na resposta, no histórico nem no registro da ferramenta.
import { admin } from "@/backend/http.server";
import { checkEvolutionUrl, explainEvolutionError } from "@/features/channels/evolution-errors";

import { callChannels } from "../edge.server";
import { boolArg, fromPerson, s, type Runner, type SetupCtx } from "../runner-types";

interface EvoChannel {
  id: string;
  status: string;
  handle: string | null;
  name: string;
}

async function evolutionState(accountId: string) {
  const db = admin();
  const [integ, channels] = await Promise.all([
    db
      .from("account_integrations")
      .select("status")
      .eq("account_id", accountId)
      .eq("provider", "evolution")
      .maybeSingle(),
    db
      .from("channels")
      .select("id, status, handle, name")
      .eq("account_id", accountId)
      .eq("provider", "evolution")
      .order("created_at", { ascending: false }),
  ]);
  const list = (channels.data ?? []) as EvoChannel[];
  return {
    serverReady: integ.data?.status === "connected",
    connected: list.find((c) => c.status === "connected") ?? null,
    pending: list.find((c) => c.status !== "connected") ?? null,
    all: list,
  };
}

/** Atendente já ligado antes de conectar o número: o número novo nasce com a resposta automática. */
async function enableAiIfAgentOn(accountId: string, channelId: string) {
  const db = admin();
  const { count } = await db
    .from("ai_agents")
    .select("id", { head: true, count: "exact" })
    .eq("account_id", accountId)
    .eq("status", "active")
    .neq("role", "supervisor");
  if (count)
    await db
      .from("channels")
      .update({ ai_enabled: true })
      .eq("id", channelId)
      .eq("account_id", accountId);
}

function friendly(err: unknown): Error {
  const help = explainEvolutionError(err instanceof Error ? err.message : String(err));
  return new Error(`${help.title}. ${help.fix}`);
}

async function saveServer(ctx: SetupCtx, rawUrl: string, key: string) {
  const url = checkEvolutionUrl(rawUrl);
  if (!url.ok) throw new Error(url.message);
  fromPerson(ctx.userText, key, "A chave do servidor");
  const res = await callChannels<{ ok: boolean; error?: string | null }>(
    ctx.req,
    ctx.caller.accountId,
    "integration.save",
    { provider: "evolution", baseUrl: url.url, apiKey: key },
    20_000,
  ).catch((err) => {
    throw friendly(err);
  });
  if (!res.ok) throw friendly(res.error ?? "sem resposta do servidor (network)");
}

export const WHATSAPP_RUNNERS: Record<string, Runner> = {
  async conectar_whatsapp(ctx, a) {
    const url = s(a["endereco"], 300);
    const key = s(a["chave"], 400);
    const secrets = key ? [key] : [];
    if (key && !url) {
      const st = await evolutionState(ctx.caller.accountId);
      if (!st.serverReady)
        return {
          content:
            "Faltou o endereço do servidor (começa com https://). Peça só o endereço; a chave a pessoa já mandou, mas não foi guardada: ela cola de novo junto com o endereço, de preferência no formulário seguro da tela.",
          block: { kind: "whatsapp", title: "Conectar o WhatsApp" },
          secrets,
        };
    }
    if (url && key) await saveServer(ctx, url, key);
    const st = await evolutionState(ctx.caller.accountId);
    if (!st.serverReady)
      return {
        content:
          "Mostrei na tela o formulário seguro: a pessoa cola o endereço e a chave do servidor, clica em Conectar e o QR Code aparece ali mesmo. Diga isso em uma frase e que quem não tem servidor contrata um provedor de Evolution API (a Cloudfy é um exemplo). Não peça a chave no texto.",
        block: {
          kind: "whatsapp",
          title: "Conectar o WhatsApp",
          hint: "Cole o endereço e a chave que o provedor mandou. A chave vai direto para o cofre.",
        },
        secrets,
      };
    const again = boolArg(a["novo_qr"]) === true || boolArg(a["outro_numero"]) === true;
    if (st.connected && !again)
      return {
        content: `O WhatsApp já está conectado${st.connected.handle ? ` no número ${st.connected.handle}` : ""}. Para conectar outro número, chame de novo com outro_numero=true.`,
        block: { kind: "whatsapp", title: "WhatsApp conectado" },
        secrets,
      };
    let channelId = boolArg(a["outro_numero"]) === true ? null : (st.pending?.id ?? null);
    if (channelId) {
      // o número antigo pode não existir mais no servidor (trocou de servidor): confere antes
      const ok = await callChannels(
        ctx.req,
        ctx.caller.accountId,
        "evolution.qr",
        { channelId },
        20_000,
      )
        .then(() => true)
        .catch(() => false);
      if (!ok) channelId = null;
    }
    if (!channelId) {
      const created = await callChannels<{ channelId: string }>(
        ctx.req,
        ctx.caller.accountId,
        "evolution.create",
        { name: "WhatsApp", isShared: true },
        40_000,
      ).catch((err) => {
        throw friendly(err);
      });
      channelId = created.channelId;
      await enableAiIfAgentOn(ctx.caller.accountId, channelId);
    }
    return {
      content:
        "QR Code na tela. Diga em uma frase: abrir o WhatsApp no celular DA EMPRESA, tocar em Dispositivos conectados, Conectar dispositivo e apontar para o código. A tela vira Conectado sozinha; não peça para a pessoa avisar.",
      block: {
        kind: "whatsapp",
        title: "Leia o QR Code",
        hint: "WhatsApp do celular da empresa › Dispositivos conectados › Conectar dispositivo",
        channelId,
      },
      action: { kind: "done", label: "QR Code gerado", tool: "conectar_whatsapp" },
      secrets,
    };
  },

  async ver_whatsapp(ctx) {
    const st = await evolutionState(ctx.caller.accountId);
    if (!st.serverReady && !st.all.length)
      return { content: "WhatsApp: ainda não tem servidor salvo nem número conectado." };
    const lines: string[] = [
      `Servidor: ${st.serverReady ? "salvo e respondendo" : "com problema ou sem chave"}.`,
    ];
    for (const ch of st.all.slice(0, 4)) {
      const live = await callChannels<{ status: string }>(
        ctx.req,
        ctx.caller.accountId,
        "evolution.status",
        { channelId: ch.id },
        12_000,
      ).catch(() => null);
      const status = live?.status ?? ch.status;
      const label =
        status === "connected"
          ? "conectado"
          : status === "connecting"
            ? "esperando ler o QR Code"
            : "desconectado";
      lines.push(
        `Número ${ch.handle ?? ch.name}: ${label}${live ? "" : " (não consegui conferir ao vivo agora)"}.`,
      );
    }
    if (!st.all.length)
      lines.push("Nenhum número criado ainda: use conectar_whatsapp para gerar o QR Code.");
    return { content: lines.join("\n") };
  },

  async desconectar_whatsapp(ctx, a) {
    const st = await evolutionState(ctx.caller.accountId);
    const target = st.connected ?? st.pending;
    if (!target) return { content: "Não há WhatsApp conectado para desconectar." };
    if (boolArg(a["confirmado"]) !== true)
      return {
        content: `PEÇA CONFIRMAÇÃO antes: desconectar o número ${target.handle ?? target.name} faz a central parar de receber e responder mensagens até ler um QR Code novo. Só chame de novo com confirmado=true depois do sim da pessoa.`,
      };
    await callChannels(
      ctx.req,
      ctx.caller.accountId,
      "evolution.logout",
      { channelId: target.id },
      20_000,
    ).catch((err) => {
      throw friendly(err);
    });
    return {
      content: `Número ${target.handle ?? target.name} desconectado. Para voltar, gere outro QR Code com conectar_whatsapp.`,
      action: { kind: "done", label: "WhatsApp desconectado", tool: "desconectar_whatsapp" },
    };
  },
};
