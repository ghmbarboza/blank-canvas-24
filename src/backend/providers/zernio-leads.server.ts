// lead.received da Zernio: o lead do anúncio (Facebook/Instagram) entra na Central de CS pelo mesmo caminho
// de um formulário (contato, deduplicação, dono, negócio, automações). O formulário "Leads de
// anúncios" é criado na primeira vez; a pessoa pode editar o destino dele em Captação.
import { admin } from "@/backend/http.server";
import { submitForm } from "@/backend/capture.server";

import type { ZernioEvent } from "./zernio-normalize";
import { ADS_FORM_FIELDS, ADS_FORM_MARKER, adLeadUtm, adLeadValues } from "./zernio-leads";

async function adsFormId(accountId: string): Promise<string> {
  const db = admin();
  const { data: found } = await db
    .from("forms")
    .select("id, status")
    .eq("account_id", accountId)
    .eq("description", ADS_FORM_MARKER)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (found) {
    // pausado na tela vira ativo de novo: lead pago não pode ser descartado em silêncio
    if (found.status !== "active")
      await db.from("forms").update({ status: "active" }).eq("id", found.id);
    return found.id;
  }
  const { data: created, error } = await db
    .from("forms")
    .insert({
      account_id: accountId,
      name: "Leads de anúncios (Facebook e Instagram)",
      title: "Leads de anúncios",
      description: ADS_FORM_MARKER,
      fields: ADS_FORM_FIELDS as never,
      consent: { enabled: false, text: "", channels: [], required: false } as never,
      status: "active",
    })
    .select("id")
    .single();
  if (error || !created)
    throw new Error(`formulário de anúncios: ${error?.message ?? "sem linha"}`);
  return created.id;
}

export async function onLeadReceived(
  accountId: string,
  evt: ZernioEvent,
): Promise<"processed" | "ignored"> {
  const lead = evt.lead;
  const externalId = lead?.leadgenId ?? lead?.id;
  if (!lead || !externalId) return "ignored";
  const formId = await adsFormId(accountId);
  await submitForm(formId, adLeadValues(lead), {
    ip: null,
    userAgent: "zernio-lead-ads",
    referrer: null,
    pageUrl: null,
    utm: adLeadUtm(lead),
    source: "meta_ads",
    externalId: `meta:${externalId}`,
    // quem aceitou o termo do formulário do anúncio aceitou o contato
    consentGranted: true,
  });
  return "processed";
}
