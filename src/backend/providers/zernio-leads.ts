// Lead de anúncio que a Zernio entrega (evento lead.received) → valores do formulário "Leads de
// anúncios" da Central de CS. Puro: testado sem banco. A Zernio já traz as respostas (lead.fields), então
// não há Graph API nem app da Meta do cliente no caminho.
import type { FormField } from "@/features/forms/types";

export interface ZernioLead {
  id?: string;
  leadgenId?: string;
  formId?: string;
  formName?: string | null;
  adId?: string | null;
  adsetId?: string | null;
  campaignId?: string | null;
  fields?: Record<string, unknown>;
  consents?: { checkboxKey?: string; isChecked?: boolean }[];
}

/** Marca o formulário criado pela Central de CS para receber os leads de anúncio da conta. */
export const ADS_FORM_MARKER = "zernio:lead_ads";

export const ADS_FORM_FIELDS: FormField[] = [
  { key: "nome", label: "Nome", type: "text", required: false, map: "name" },
  { key: "email", label: "E-mail", type: "email", required: false, map: "email" },
  { key: "telefone", label: "Telefone", type: "phone", required: false, map: "phone" },
  { key: "empresa", label: "Empresa", type: "text", required: false, map: "company" },
  { key: "cargo", label: "Cargo", type: "text", required: false, map: "job_title" },
  { key: "cidade", label: "Cidade", type: "text", required: false, map: "city" },
  { key: "respostas", label: "Outras respostas", type: "textarea", required: false, map: "notes" },
];

// Chaves padrão da Meta e variações comuns em formulários em português.
const ALIAS: Record<string, string> = {
  full_name: "nome",
  name: "nome",
  nome: "nome",
  nome_completo: "nome",
  first_name: "nome",
  email: "email",
  e_mail: "email",
  phone_number: "telefone",
  phone: "telefone",
  telefone: "telefone",
  whatsapp: "telefone",
  celular: "telefone",
  company_name: "empresa",
  empresa: "empresa",
  job_title: "cargo",
  cargo: "cargo",
  city: "cidade",
  cidade: "cidade",
};

const asText = (v: unknown) =>
  Array.isArray(v) ? v.map(String).join(", ") : v == null ? "" : String(v).trim();

export function adLeadValues(lead: ZernioLead): Record<string, string> {
  const out: Record<string, string> = {};
  const extra: string[] = [];
  for (const [rawKey, rawValue] of Object.entries(lead.fields ?? {})) {
    const value = asText(rawValue);
    if (!value) continue;
    const key = rawKey.toLowerCase().replace(/[^a-z0-9]+/g, "_");
    const target = ALIAS[key];
    if (target && !out[target]) out[target] = value;
    else extra.push(`${rawKey.replace(/_/g, " ")}: ${value}`);
  }
  if (lead.formName) extra.unshift(`Formulário do anúncio: ${lead.formName}`);
  if (extra.length) out["respostas"] = extra.join("\n");
  return out;
}

/** Atribuição do lead (vira UTM no contato, para o relatório de campanhas). */
export function adLeadUtm(lead: ZernioLead): Record<string, string> {
  return {
    utm_source: "facebook",
    utm_medium: "paid",
    ...(lead.campaignId ? { utm_campaign: lead.campaignId } : {}),
    ...(lead.adId ? { utm_content: lead.adId } : {}),
    ...(lead.formId ? { utm_term: lead.formId } : {}),
  };
}
