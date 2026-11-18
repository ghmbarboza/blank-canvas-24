// Webhook dos formulários de lead do Google Ads (Lead Form Extensions / lead form assets).
// Formato oficial: https://developers.google.com/google-ads/webhook/docs/implementation
// { lead_id, api_version, form_id, campaign_id, adgroup_id, creative_id, gcl_id, google_key,
//   is_test, user_column_data: [{ column_id, column_name, string_value }] }

export interface GoogleLeadColumn {
  column_id?: string;
  column_name?: string;
  string_value?: string;
}

export interface GoogleLeadPayload {
  lead_id?: string;
  api_version?: string;
  form_id?: number | string;
  campaign_id?: number | string;
  adgroup_id?: number | string;
  creative_id?: number | string;
  gcl_id?: string;
  google_key?: string;
  is_test?: boolean;
  user_column_data?: GoogleLeadColumn[];
}

export interface ParsedGoogleLead {
  leadId: string;
  googleKey: string;
  isTest: boolean;
  campaignId: string | null;
  adgroupId: string | null;
  creativeId: string | null;
  formId: string | null;
  gclid: string | null;
  /** Chave do Google em minúsculas (ex.: "email", "full_name", "qual_o_seu_orcamento") → valor. */
  columns: Record<string, string>;
}

const id = (v: unknown): string | null =>
  v === undefined || v === null || v === "" ? null : String(v).slice(0, 64);

function slug(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

/** Lê e confere o corpo. Devolve null quando não tem o mínimo (lead_id e google_key). */
export function parseGoogleLead(body: unknown): ParsedGoogleLead | null {
  if (!body || typeof body !== "object") return null;
  const b = body as GoogleLeadPayload;
  if (typeof b.lead_id !== "string" || !b.lead_id.trim()) return null;
  if (typeof b.google_key !== "string" || !b.google_key) return null;
  const columns: Record<string, string> = {};
  for (const c of Array.isArray(b.user_column_data) ? b.user_column_data.slice(0, 60) : []) {
    const key = slug(c.column_id || c.column_name || "");
    const value = typeof c.string_value === "string" ? c.string_value.trim().slice(0, 2000) : "";
    if (key && value && !(key in columns)) columns[key] = value;
  }
  return {
    leadId: b.lead_id.trim().slice(0, 200),
    googleKey: b.google_key,
    isTest: b.is_test === true,
    campaignId: id(b.campaign_id),
    adgroupId: id(b.adgroup_id),
    creativeId: id(b.creative_id),
    formId: id(b.form_id),
    gclid: id(b.gcl_id),
    columns,
  };
}

// column_id padrão do Google → campo do contato na Central de CS (FormField.map).
const STANDARD: Record<string, string> = {
  full_name: "name",
  email: "email",
  work_email: "email",
  phone_number: "phone",
  work_phone: "phone",
  company_name: "company",
  job_title: "job_title",
  city: "city",
};

/** Valores do lead nas chaves do formulário da Central de CS (por chave igual ou pelo campo do contato). */
export function mapGoogleLeadToForm(
  columns: Record<string, string>,
  fields: readonly { key: string; map: string | null }[],
): Record<string, string> {
  const merged: Record<string, string> = { ...columns };
  if (!merged["full_name"] && (merged["first_name"] || merged["last_name"]))
    merged["full_name"] = [merged["first_name"], merged["last_name"]].filter(Boolean).join(" ");
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(merged)) {
    const target =
      fields.find((f) => f.key.toLowerCase() === key) ??
      (STANDARD[key] ? fields.find((f) => f.map === STANDARD[key]) : undefined);
    if (target && !(target.key in out)) out[target.key] = value;
  }
  return out;
}

export function googleLeadUtm(lead: ParsedGoogleLead): Record<string, string> {
  return {
    utm_source: "google",
    utm_medium: "paid",
    ...(lead.campaignId ? { utm_campaign: lead.campaignId } : {}),
    ...(lead.creativeId ? { utm_content: lead.creativeId } : {}),
    ...(lead.gclid ? { gclid: lead.gclid } : {}),
  };
}
