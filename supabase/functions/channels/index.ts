// Gestão de integrações e canais (só admin da conta). Corpo: { accountId, action, ...params }
import { serve, json, HttpError, readJson } from "../_shared/http.ts";
import { adminClient, functionsUrl } from "../_shared/supabase.ts";
import { requireMember } from "../_shared/auth.ts";
import { getSecret, setSecret } from "../_shared/secrets.ts";
import * as evolution from "../_shared/providers/evolution.ts";
import * as zernio from "../_shared/providers/zernio.ts";
import * as meta from "../_shared/providers/meta.ts";
import { assertPublicHttps } from "../_shared/net.ts";

type Body = { accountId: string; action: string } & Record<string, unknown>;

const str = (v: unknown, max = 500) => (typeof v === "string" ? v.trim().slice(0, max) : "");

serve(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "Método não permitido");
  const body = await readJson<Body>(req);
  const caller = await requireMember(req, body.accountId, "admin");
  const acc = caller.accountId;
  const db = adminClient();

  switch (body.action) {
    // ---------------------------------------------------------------- integrações da conta
    case "integration.save": {
      const provider = str(body.provider, 20);
      if (!["evolution", "zernio", "openai", "anthropic"].includes(provider))
        throw new HttpError(400, "Provedor inválido");
      const config: Record<string, string> = {};
      if (provider === "evolution") {
        const baseUrl = str(body.baseUrl, 300);
        if (!/^https:\/\/[^\s/]+/.test(baseUrl))
          throw new HttpError(400, "Informe a URL https do servidor Evolution");
        // Só servidor público: nada de rede interna do Supabase (S11).
        try {
          await assertPublicHttps(baseUrl);
        } catch (err) {
          throw new HttpError(
            400,
            `Endereço do servidor Evolution recusado: ${(err as Error).message}`,
          );
        }
        config.base_url = baseUrl.replace(/\/+$/, "");
      }
      const apiKey = str(body.apiKey, 400);
      if (apiKey) await setSecret(acc, "integration", acc, `${provider}_api_key`, apiKey);
      // Testa a credencial antes de marcar como conectada.
      let status = "connected";
      let lastError: string | null = null;
      try {
        if (provider === "evolution") {
          const key = apiKey || (await getSecret("integration", acc, "evolution_api_key"));
          const res = await fetch(`${config.base_url}/instance/fetchInstances`, {
            headers: { apikey: key ?? "" },
            redirect: "error", // um 302 levaria a apikey para outro lugar (R8)
          });
          if (!res.ok) throw new Error(`Evolution respondeu ${res.status}`);
        }
        if (provider === "zernio") {
          const key = apiKey || (await getSecret("integration", acc, "zernio_api_key"));
          if (!key) throw new Error("Chave ausente");
          // só testa: o webhook da Zernio é registrado por /api/zernio (key.save), apontando para
          // /api/public/zernio. Registrar aqui criava um segundo webhook na função antiga.
          await zernio.listAccounts(key);
        }
      } catch (err) {
        status = "error";
        lastError = String(err instanceof Error ? err.message : err).slice(0, 300);
      }
      await db
        .from("account_integrations")
        .upsert(
          { account_id: acc, provider, config, status, last_error: lastError },
          { onConflict: "account_id,provider" },
        );
      if (provider === "openai" || provider === "anthropic") {
        const { data: a } = await db.from("accounts").select("settings").eq("id", acc).single();
        const settings = {
          ...(a?.settings ?? {}),
          ai: { provider, model: str(body.model, 60) || undefined },
        };
        await db.from("accounts").update({ settings }).eq("id", acc);
      }
      return json({ ok: status === "connected", status, error: lastError });
    }

    // ---------------------------------------------------------------- Evolution
    case "evolution.create": {
      const cfg = await evolutionConfig(acc);
      const name = str(body.name, 80) || "WhatsApp";
      const ownerUserId = str(body.ownerUserId, 40) || null;
      const instanceName = `nx_${acc.slice(0, 8)}_${crypto.randomUUID().slice(0, 8)}`;
      const { data: ch, error } = await db
        .from("channels")
        .insert({
          account_id: acc,
          provider: "evolution",
          platform: "whatsapp",
          name,
          external_id: instanceName,
          status: "connecting",
          owner_user_id: ownerUserId,
          is_shared: ownerUserId ? Boolean(body.isShared) : true,
        })
        .select("id, webhook_token")
        .single();
      if (error) throw new HttpError(400, error.message);
      try {
        await evolution.createInstance(
          cfg,
          instanceName,
          `${functionsUrl("webhook-evolution")}?c=${ch.id}`,
          ch.webhook_token,
        );
        const qr = await evolution
          .getQr(cfg, instanceName)
          .catch(() => ({ qr: null, pairingCode: null }));
        return json({ ok: true, channelId: ch.id, ...qr });
      } catch (err) {
        await db
          .from("channels")
          .update({ status: "error", status_detail: String(err).slice(0, 300) })
          .eq("id", ch.id);
        throw new HttpError(502, `Evolution: ${err instanceof Error ? err.message : err}`);
      }
    }
    case "evolution.qr":
    case "evolution.status":
    case "evolution.logout":
    case "evolution.delete":
    case "evolution.sync_groups": {
      const ch = await loadChannel(acc, str(body.channelId, 40), "evolution");
      const cfg = await evolutionConfig(acc);
      if (body.action === "evolution.qr") return json(await evolution.getQr(cfg, ch.external_id));
      if (body.action === "evolution.status") {
        const state = await evolution.getState(cfg, ch.external_id);
        const status =
          state === "open" ? "connected" : state === "connecting" ? "connecting" : "disconnected";
        await db.from("channels").update({ status, status_detail: state }).eq("id", ch.id);
        return json({ status, state });
      }
      if (body.action === "evolution.logout") {
        await evolution.logout(cfg, ch.external_id);
        await db.from("channels").update({ status: "disconnected" }).eq("id", ch.id);
        return json({ ok: true });
      }
      if (body.action === "evolution.delete") {
        await evolution.deleteInstance(cfg, ch.external_id);
        await db.from("channels").delete().eq("id", ch.id);
        return json({ ok: true });
      }
      const groups = await evolution.fetchGroups(cfg, ch.external_id);
      let created = 0;
      for (const g of groups) {
        const { error } = await db.from("conversations").upsert(
          {
            account_id: acc,
            channel_id: ch.id,
            external_thread_id: g.id,
            is_group: true,
            title: g.subject ?? "Grupo",
            avatar_url: g.pictureUrl ?? null,
            status: "closed",
          },
          { onConflict: "channel_id,external_thread_id", ignoreDuplicates: false },
        );
        if (!error) created++;
      }
      return json({ ok: true, groups: created });
    }

    // ---------------------------------------------------------------- Zernio
    case "zernio.connect_url": {
      const key = await getSecret("integration", acc, "zernio_api_key");
      if (!key) throw new HttpError(412, "Configure a chave da Zernio primeiro");
      const platform = str(body.platform, 30);
      if (!(zernio.ZERNIO_CONNECT_PLATFORMS as readonly string[]).includes(platform))
        throw new HttpError(400, "Rede não suportada");
      const redirectUrl = str(body.redirectUrl, 400);
      if (!/^https?:\/\//.test(redirectUrl)) throw new HttpError(400, "redirectUrl inválida");
      const profileId = await zernio.defaultProfileId(key);
      if (!profileId) throw new HttpError(412, "Crie um profile na Zernio");
      return json({ url: await zernio.connectUrl(key, platform, profileId, redirectUrl) });
    }
    case "zernio.sync": {
      const key = await getSecret("integration", acc, "zernio_api_key");
      if (!key) throw new HttpError(412, "Configure a chave da Zernio primeiro");
      const accounts = await zernio.listAccounts(key);
      const { data: taken } = await db
        .from("channels")
        .select("external_id")
        .eq("provider", "zernio")
        .neq("account_id", acc)
        .in(
          "external_id",
          accounts.map((a) => a._id),
        );
      const takenIds = new Set((taken ?? []).map((t) => t.external_id));
      let synced = 0;
      for (const a of accounts) {
        if (takenIds.has(a._id)) continue;
        const { error } = await db.from("channels").upsert(
          {
            account_id: acc,
            provider: "zernio",
            platform: zernio.toPlatform(a.platform),
            external_id: a._id,
            name: a.displayName ?? a.username ?? a.platform,
            handle: a.username ? `@${a.username}` : null,
            status: a.isActive === false ? "disconnected" : "connected",
          },
          { onConflict: "provider,external_id" },
        );
        if (!error) synced++;
      }
      return json({ ok: true, synced });
    }

    // ---------------------------------------------------------------- Meta Cloud API
    case "meta.connect": {
      const phoneNumberId = str(body.phoneNumberId, 40);
      const wabaId = str(body.wabaId, 40);
      const token = str(body.accessToken, 600);
      const appSecret = str(body.appSecret, 100);
      if (!/^\d{6,20}$/.test(phoneNumberId) || !/^\d{6,20}$/.test(wabaId) || !token || !appSecret) {
        throw new HttpError(400, "Preencha Phone Number ID, WABA ID, token e App Secret");
      }
      const info = await meta.verifyPhoneNumber(token, phoneNumberId).catch((err) => {
        throw new HttpError(
          400,
          `A Meta recusou as credenciais: ${err instanceof Error ? err.message : err}`,
        );
      });
      const { data: taken } = await db
        .from("channels")
        .select("account_id")
        .eq("provider", "whatsapp_cloud")
        .eq("external_id", phoneNumberId)
        .maybeSingle();
      if (taken && taken.account_id !== acc)
        throw new HttpError(409, "Número já conectado em outra conta");
      const { data: ch, error } = await db
        .from("channels")
        .upsert(
          {
            account_id: acc,
            provider: "whatsapp_cloud",
            platform: "whatsapp",
            external_id: phoneNumberId,
            name: str(body.name, 80) || info.verified_name || "WhatsApp oficial",
            handle: info.display_phone_number ?? null,
            status: "connected",
            config: { waba_id: wabaId },
          },
          { onConflict: "provider,external_id" },
        )
        .select("id, webhook_token, account_id")
        .single();
      if (error) throw new HttpError(400, error.message);
      await setSecret(acc, "channel", ch.id, "access_token", token);
      await setSecret(acc, "channel", ch.id, "app_secret", appSecret);
      await meta.subscribeApp(token, wabaId);
      return json({
        ok: true,
        channelId: ch.id,
        webhookUrl: `${functionsUrl("webhook-whatsapp")}?c=${ch.id}`,
        verifyToken: ch.webhook_token,
      });
    }
    case "meta.templates": {
      const ch = await loadChannel(acc, str(body.channelId, 40), "whatsapp_cloud");
      const token = await getSecret("channel", ch.id, "access_token");
      if (!token) throw new HttpError(412, "Token ausente");
      return json({
        templates: await meta.listTemplates(
          token,
          (ch.config as { waba_id?: string }).waba_id ?? "",
        ),
      });
    }

    // ---------------------------------------------------------------- informações de webhook
    case "channel.webhook_info": {
      const { data: ch } = await db
        .from("channels")
        .select("id, provider, webhook_token")
        .eq("account_id", acc)
        .eq("id", str(body.channelId, 40))
        .maybeSingle();
      if (!ch) throw new HttpError(404, "Canal não encontrado");
      const fn =
        ch.provider === "whatsapp_cloud"
          ? "webhook-whatsapp"
          : ch.provider === "evolution"
            ? "webhook-evolution"
            : "webhook-zernio";
      return json({
        webhookUrl:
          ch.provider === "zernio"
            ? `${functionsUrl(fn)}?a=${acc}`
            : `${functionsUrl(fn)}?c=${ch.id}`,
        verifyToken: ch.provider === "whatsapp_cloud" ? ch.webhook_token : undefined,
      });
    }
    default:
      throw new HttpError(400, "Ação desconhecida");
  }
});

async function evolutionConfig(accountId: string) {
  const { data } = await adminClient()
    .from("account_integrations")
    .select("config")
    .eq("account_id", accountId)
    .eq("provider", "evolution")
    .maybeSingle();
  const baseUrl = (data?.config as { base_url?: string } | null)?.base_url;
  const apiKey = await getSecret("integration", accountId, "evolution_api_key");
  if (!baseUrl || !apiKey)
    throw new HttpError(412, "Configure o servidor Evolution em Integrações");
  return { baseUrl, apiKey };
}

async function loadChannel(accountId: string, id: string, provider: string) {
  const { data } = await adminClient()
    .from("channels")
    .select("id, external_id, config")
    .eq("account_id", accountId)
    .eq("id", id)
    .eq("provider", provider)
    .maybeSingle();
  if (!data) throw new HttpError(404, "Canal não encontrado");
  return data as { id: string; external_id: string; config: Record<string, unknown> };
}
