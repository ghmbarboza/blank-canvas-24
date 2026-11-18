// Números, voz e ligação pelo WhatsApp na Zernio. Compra e portabilidade só com pedido explícito
// do administrador (confirmação na tela + chave de idempotência); nada aqui gasta sozinho.
import { newIdempotencyKey, zernio } from "./zernio-client.server";

// ------------------------------------------------------------------ catálogo e números

export interface CountryCatalog {
  code: string;
  name?: string;
  tier?: number;
  monthlyCents: number;
  needsKyc: boolean;
  callsAvailable?: boolean;
  whatsappAvailable?: boolean;
  smsAvailable?: boolean;
  outboundCallingAvailable?: boolean;
  inStock?: boolean;
  preOrderable?: boolean;
  types?: {
    numberType: string;
    tier?: number | null;
    needsKyc: boolean;
    monthlyCents: number;
    whatsappAvailable: boolean;
    smsAvailable: boolean;
    callsAvailable: boolean;
    inStock?: boolean;
    preOrderable?: boolean;
    fulfilment?: string;
  }[];
}

/** Catálogo público (sem chave): preço mensal ao vivo por país e tipo. */
export async function countryCatalog(code: string): Promise<CountryCatalog | null> {
  const r = await zernio<{ countries?: CountryCatalog[] }>(null, "/v1/phone-numbers/countries", {
    anonymous: true,
  });
  return (r.countries ?? []).find((c) => c.code === code.toUpperCase()) ?? null;
}

export interface AreaOption {
  ndc: string;
  name: string;
  count?: number;
}

export async function availability(apiKey: string, country: string, numberType: string) {
  const qs = new URLSearchParams({ country, numberType });
  return zernio<{
    available: boolean;
    preOrderable?: boolean;
    addressConstraint?: string;
    areaOptions?: AreaOption[];
  }>(apiKey, `/v1/phone-numbers/availability?${qs.toString()}`);
}

export interface ZernioNumberRow {
  _id?: string;
  id?: string;
  phoneNumber?: string | null;
  country?: string;
  status?: string;
  monthlyCents?: number;
  profileId?: string;
  numberType?: string;
  onfidoVerificationUrl?: string | null;
}

export async function listNumbers(apiKey: string) {
  return zernio<{ numbers?: ZernioNumberRow[]; connected?: ZernioNumberRow[] }>(
    apiKey,
    "/v1/phone-numbers",
  );
}

export async function getNumber(apiKey: string, id: string) {
  const r = await zernio<{ phoneNumber?: ZernioNumberRow }>(
    apiKey,
    `/v1/phone-numbers/${encodeURIComponent(id)}`,
  );
  return r.phoneNumber ?? null;
}

/** Link hospedado de KYC (7 dias). O número só é pedido quando o cliente envia o formulário. */
export async function kycShareLink(
  apiKey: string,
  p: {
    profileId: string;
    country: string;
    numberType: string;
    areaCode?: string;
    redirectUrl: string;
    companyName?: string;
  },
) {
  const body: Record<string, unknown> = {
    profileId: p.profileId,
    country: p.country,
    numberType: p.numberType,
    language: "pt-BR",
    redirect_url: p.redirectUrl,
  };
  if (p.areaCode) body["areaCode"] = p.areaCode;
  if (p.companyName) body["branding"] = { companyName: p.companyName.slice(0, 60) };
  return zernio<{ url: string; token?: string; expiresAt?: string }>(
    apiKey,
    "/v1/phone-numbers/kyc/share",
    {
      method: "POST",
      body,
    },
  );
}

/** Compra (gasta). Só chamada depois da confirmação explícita na tela. */
export async function purchaseNumber(
  apiKey: string,
  p: {
    profileId: string;
    country: string;
    numberType: string;
    areaCode?: string;
    purchaseIntentId: string;
  },
) {
  const body: Record<string, unknown> = {
    profileId: p.profileId,
    country: p.country,
    numberType: p.numberType,
    connectWhatsapp: true,
    purchaseIntentId: p.purchaseIntentId,
  };
  if (p.areaCode) body["areaCode"] = p.areaCode;
  return zernio<{
    status?: string;
    kycUrl?: string;
    phoneNumber?: {
      id: string;
      phoneNumber?: string;
      status?: string;
      country?: string;
      profileId?: string;
    };
    numberId?: string;
  }>(apiKey, "/v1/phone-numbers/purchase", { method: "POST", body });
}

// ------------------------------------------------------------------ portabilidade

export interface PortCheck {
  phoneNumber: string;
  portable: boolean;
  fastPortable?: boolean;
  phoneNumberType?: string;
  countryCode?: string;
  notPortableReason?: string | null;
  carrierName?: string | null;
}

/** Só leitura: não cria pedido. */
export async function portCheck(apiKey: string, phoneNumbers: string[]): Promise<PortCheck[]> {
  const r = await zernio<{ results?: PortCheck[] }>(apiKey, "/v1/phone-numbers/port-in/check", {
    method: "POST",
    body: { phoneNumbers },
  });
  return r.results ?? [];
}

export interface PortRequirement {
  requirementId: string;
  label: string;
  kind: "text" | "date" | "file" | "address" | "action" | string;
  description?: string;
  example?: string;
}

export async function portRequirements(apiKey: string, country: string, numberType: string) {
  const qs = new URLSearchParams({ country, numberType });
  return zernio<{ supported: boolean; fields?: PortRequirement[] }>(
    apiKey,
    `/v1/phone-numbers/port-in/requirements?${qs.toString()}`,
  );
}

// ------------------------------------------------------------------ voz no número

export interface VoiceSettings {
  forwardTo?: string;
  recordingEnabled?: boolean;
  transcriptionEnabled?: boolean;
  transcriptionLanguage?: "auto" | "en" | "es";
  voicemailEnabled?: boolean;
  voicemailGreeting?: string;
  businessHoursEnabled?: boolean;
  businessHoursTimezone?: string;
  businessHours?: { day: number; open: string; close: string }[];
  forwardCallerId?: "business" | "caller";
  ivrEnabled?: boolean;
  ivrPrompt?: string;
  ivrOptions?: { digit: string; forwardTo: string; label?: string }[];
}

export async function setVoice(apiKey: string, numberId: string, s: VoiceSettings) {
  return zernio<VoiceSettings & { enabled?: boolean; pstnForwardTo?: string | null }>(
    apiKey,
    `/v1/phone-numbers/${encodeURIComponent(numberId)}/voice`,
    { method: "POST", body: s },
  );
}

// ------------------------------------------------------------------ ligação pelo WhatsApp

export interface CallingConfig {
  phoneNumberDocId?: string;
  phoneNumber?: string;
  callingEnabled?: boolean;
  callDeepLink?: string | null;
  forwardTo?: string | null;
  recordingEnabled?: boolean;
  maxCallDurationSeconds?: number | null;
}

export async function callingConfig(
  apiKey: string,
  zernioAccountId: string,
): Promise<CallingConfig> {
  return zernio<CallingConfig>(
    apiKey,
    `/v1/whatsapp/calling?accountId=${encodeURIComponent(zernioAccountId)}`,
  );
}

export async function setWhatsAppCalling(
  apiKey: string,
  numberDocId: string,
  p: {
    zernioAccountId: string;
    forwardTo: string;
    recordingEnabled: boolean;
    maxCallDurationSeconds?: number;
    firstTime: boolean;
  },
) {
  const body: Record<string, unknown> = {
    accountId: p.zernioAccountId,
    forwardTo: p.forwardTo,
    recordingEnabled: p.recordingEnabled,
  };
  if (p.maxCallDurationSeconds) body["maxCallDurationSeconds"] = p.maxCallDurationSeconds;
  return zernio<{ callingEnabled?: boolean; forwardTo?: string }>(
    apiKey,
    `/v1/phone-numbers/${encodeURIComponent(numberDocId)}/whatsapp/calling`,
    { method: p.firstTime ? "POST" : "PATCH", body },
  );
}

export async function callPermission(apiKey: string, zernioAccountId: string, to: string) {
  const qs = new URLSearchParams({ accountId: zernioAccountId, to });
  return zernio<{
    permission?: { status?: "permanent" | "temporary" | "no_permission"; expiration_time?: number };
    actions?: { action_name: string; can_perform_action: boolean }[];
  }>(apiKey, `/v1/whatsapp/call-permissions?${qs.toString()}`);
}

export async function requestCallPermission(
  apiKey: string,
  zernioAccountId: string,
  to: string,
  bodyText: string,
) {
  return zernio<{ success?: boolean }>(apiKey, "/v1/whatsapp/calls", {
    method: "POST",
    body: {
      accountId: zernioAccountId,
      to,
      action: "send_call_permission_request",
      bodyText: bodyText.slice(0, 900),
    },
    idempotencyKey: newIdempotencyKey(),
  });
}

export async function startWhatsAppCall(
  apiKey: string,
  zernioAccountId: string,
  to: string,
  forwardTo?: string,
) {
  const body: Record<string, unknown> = { accountId: zernioAccountId, to };
  if (forwardTo) body["forwardTo"] = forwardTo;
  return zernio<{ callId?: string; status?: string }>(apiKey, "/v1/whatsapp/calls", {
    method: "POST",
    body,
    idempotencyKey: newIdempotencyKey(),
  });
}

// ------------------------------------------------------------------ ligação telefônica

export async function endCall(apiKey: string, callId: string) {
  return zernio(apiKey, `/v1/voice/calls/${encodeURIComponent(callId)}/end`, {
    method: "POST",
    body: {},
  });
}

export async function transferCall(apiKey: string, callId: string, to: string) {
  return zernio(apiKey, `/v1/voice/calls/${encodeURIComponent(callId)}/transfer`, {
    method: "POST",
    body: { to },
  });
}

export async function webSession(apiKey: string) {
  return zernio<{ token: string; credentialId: string; expiresAt?: string }>(
    apiKey,
    "/v1/voice/calls/web",
    {
      method: "POST",
      body: {},
    },
  );
}

export async function webDial(
  apiKey: string,
  credentialId: string,
  to: string,
  fromNumber?: string,
) {
  const body: Record<string, unknown> = { credentialId, to };
  if (fromNumber) body["fromNumber"] = fromNumber;
  return zernio<{ callId?: string; status?: string }>(apiKey, "/v1/voice/calls/web/dial", {
    method: "POST",
    body,
    idempotencyKey: newIdempotencyKey(),
  });
}

export interface ZernioCallRecord {
  _id: string;
  channel?: "pstn" | "whatsapp";
  status?: string;
  durationSeconds?: number;
  recordingEnabled?: boolean;
  transcriptionEnabled?: boolean;
  transcript?: { text: string; confidence?: number; at?: string; speaker?: string }[];
  billing?: { billableCostUSD?: number; totalCostUSD?: number; metaCostUSD?: number };
}

export async function getCall(apiKey: string, id: string) {
  const r = await zernio<{ call?: ZernioCallRecord }>(
    apiKey,
    `/v1/calls/${encodeURIComponent(id)}`,
  );
  return r.call ?? null;
}

export async function recordingUrl(apiKey: string, id: string): Promise<string | null> {
  try {
    const r = await zernio<{ url?: string }>(
      apiKey,
      `/v1/calls/${encodeURIComponent(id)}/recording?as=json`,
    );
    return r.url ?? null;
  } catch {
    return null;
  }
}

export async function recentCalls(apiKey: string, limit = 1) {
  return zernio<{ calls?: unknown[] }>(apiKey, `/v1/calls?limit=${limit}`);
}
