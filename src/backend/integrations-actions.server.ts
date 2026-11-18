// Salvar e testar integração da conta (config na coluna, segredos no Vault). Usado pela tela
// (/api/integrations) e pela Nexa, a implantação por conversa: o mesmo caminho, as mesmas regras.
import { admin, HttpError, type Caller } from "@/backend/http.server";
import { providerDef, secretKeyName, type ProviderId } from "@/features/integrations/providers";

export async function saveIntegration(
  caller: Caller,
  provider: ProviderId,
  values: Record<string, string>,
): Promise<void> {
  const def = providerDef(provider);
  if (!def) throw new HttpError(400, "Integração desconhecida", "bad_provider");
  const db = admin();

  const { data: prev } = await db
    .from("account_integrations")
    .select("config")
    .eq("account_id", caller.accountId)
    .eq("provider", def.id)
    .maybeSingle();
  const config: Record<string, string> = {
    ...((prev?.config ?? {}) as Record<string, string>),
  };
  for (const f of def.fields) {
    const v = values[f.key];
    if (v === undefined) continue;
    const clean = String(v).trim();
    if (clean.length > 4000) throw new HttpError(400, `${f.label}: valor longo demais`, "too_long");
    if (f.secret) {
      // vazio = manter o atual; "__clear__" = apagar
      if (clean === "") continue;
      const { error } = await db.rpc("secret_set", {
        _account: caller.accountId,
        _scope: "integration",
        _scope_id: caller.accountId,
        _key: secretKeyName(def.id, f.key),
        _value: clean === "__clear__" ? "" : clean,
      });
      if (error) throw new HttpError(500, "Não deu para guardar o segredo", "secret");
    } else {
      if (clean) config[f.key] = clean;
      else delete config[f.key];
    }
  }
  const { error } = await db.from("account_integrations").upsert(
    {
      account_id: caller.accountId,
      provider: def.id,
      config,
      status: "pending",
      last_error: null,
    },
    { onConflict: "account_id,provider" },
  );
  if (error) throw new HttpError(500, error.message, "save");
  await db.rpc("audit", {
    _account: caller.accountId,
    _action: "integration.saved",
    _entity: "integration",
    _entity_id: caller.accountId,
    _meta: { provider: def.id },
  });
}

export async function testIntegration(caller: Caller, provider: ProviderId): Promise<string> {
  const def = providerDef(provider);
  if (!def) throw new HttpError(400, "Integração desconhecida", "bad_provider");
  const db = admin();

  const { getIntegration } = await import("@/backend/integrations.server");
  const it = await getIntegration(caller.accountId, def.id);
  if (!it) throw new HttpError(400, "Salve a integração antes de testar", "not_saved");
  let message = "";
  try {
    message = await runTest(def.id, it.config, it.secrets);
    await db
      .from("account_integrations")
      .update({ status: "connected", last_error: null })
      .eq("account_id", caller.accountId)
      .eq("provider", def.id);
    if (def.id === "resend" && caller.role === "owner") {
      message += await adoptPlatformAlert(caller.email, it.config, it.secrets);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db
      .from("account_integrations")
      .update({ status: "error", last_error: msg.slice(0, 500) })
      .eq("account_id", caller.accountId)
      .eq("provider", def.id);
    throw new HttpError(422, msg, "test_failed");
  }
  return message;
}

async function runTest(
  provider: string,
  config: Record<string, string>,
  secrets: Record<string, string>,
): Promise<string> {
  const need = (v: string | undefined, label: string) => {
    if (!v) throw new Error(`Falta ${label}`);
    return v;
  };
  switch (provider) {
    case "openai":
    case "anthropic": {
      const { llmKeyTest } = await import("@/backend/providers/llm-key.server");
      return llmKeyTest(provider, need(secrets["api_key"], "a chave"));
    }
    case "resend":
      return (await import("@/backend/providers/resend.server")).resendTest(
        need(secrets["api_key"], "a chave"),
        config["from_email"],
      );
    case "livekit":
      return (await import("@/backend/providers/livekit.server")).livekitTest({
        url: need(config["url"], "a URL"),
        apiKey: need(config["api_key"], "a API key"),
        apiSecret: need(secrets["api_secret"], "o API secret"),
      });
    case "deepgram":
      return (await import("@/backend/providers/deepgram.server")).deepgramTest(
        need(secrets["api_key"], "a chave"),
      );
    case "zadarma":
      return (await import("@/backend/providers/zadarma.server")).zadarmaTest({
        key: need(secrets["api_key"], "a key"),
        secret: need(secrets["api_secret"], "o secret"),
      });
    case "elevenlabs":
      return (await import("@/backend/providers/elevenlabs.server")).elevenTest(
        need(secrets["api_key"], "a chave"),
      );
    case "asaas":
      return (await import("@/backend/providers/asaas.server")).asaasTest(
        need(secrets["api_key"], "a chave"),
        config["environment"],
      );
    case "flowcrm": {
      const { flowcrmTest } = await import("@/backend/providers/flowcrm.server");
      return flowcrmTest(need(config["url"], "o endereço"), need(secrets["key"], "a chave"));
    }
    case "zapsign":
      return (await import("@/backend/providers/zapsign.server")).zapsignTest(
        need(secrets["api_token"], "o token"),
        config["environment"],
      );
    case "ses":
      return (await import("@/backend/providers/ses.server")).sesTest({
        accessKeyId: need(secrets["access_key_id"], "o access key ID"),
        secretAccessKey: need(secrets["secret_access_key"], "o secret access key"),
        region: need(config["region"], "a região"),
      });
    case "turnstile":
      need(config["site_key"], "a site key");
      return (await import("@/backend/providers/turnstile.server")).turnstileTest(
        need(secrets["secret"], "a secret key"),
      );
    default:
      return "Dados salvos (esta integração é validada na primeira conexão)";
  }
}

// Primeiro Resend que passa no teste do dono liga o alerta da plataforma para o e-mail dele (#31).
// Nunca derruba o teste: se não der, o alerta só fica no painel de Saúde, como antes.
async function adoptPlatformAlert(
  email: string | null,
  config: Record<string, string>,
  secrets: Record<string, string>,
): Promise<string> {
  const key = secrets["api_key"];
  if (!email || !key) return "";
  const fromEmail = config["from_email"];
  const from = fromEmail
    ? `${(config["from_name"] || "Nexus One").replace(/[<>"\r\n]/g, "")} <${fromEmail}>`
    : null;
  const { admin } = await import("@/backend/http.server");
  const { data, error } = await admin().rpc("platform_adopt_alert", {
    _email: email,
    _key: key,
    ...(from ? { _from: from } : {}),
  });
  if (error || data !== true) return "";
  return `. Alertas de serviço fora do ar vão para ${email}`;
}
