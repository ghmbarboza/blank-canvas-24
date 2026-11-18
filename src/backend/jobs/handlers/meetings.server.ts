// Jobs das reuniões: convite (e-mail com .ics + WhatsApp/SMS), lembretes e ata pela IA.
import { admin } from "@/backend/http.server";
import { callJson } from "@/backend/llm-meetings.server";
import {
  buildIcs,
  formatWhen,
  issueContactToken,
  loadPlaybook,
  manageUrl,
  meetingUrl,
} from "@/backend/meetings.server";
import {
  FORECAST_LABEL,
  currentCategory,
  suggestForecast,
} from "@/features/crm/forecast-suggestion";
import { FRAMEWORK_FIELDS } from "@/features/playbooks/types";
import { TEMPLATE_SCORECARD } from "@/features/playbooks/template";

import type { JobPayloads } from "../contract";
import { registerJob, type Job } from "../registry.server";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function emailHtml(o: {
  heading: string;
  intro: string;
  when: string;
  host: string | null;
  url: string;
  company: string;
  notice: string;
  links?: { label: string; url: string }[];
  cta?: string;
}) {
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f7f8fa;font-family:Geist,Arial,sans-serif;color:#0a1f3b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:24px;overflow:hidden">
<tr><td style="background:#0a1f3b;padding:28px 32px;color:#ffffff">
<p style="margin:0;font-size:12px;letter-spacing:2px;text-transform:uppercase;opacity:.7">${esc(o.company)}</p>
<h1 style="margin:8px 0 0;font-size:24px;line-height:1.25">${esc(o.heading)}</h1></td></tr>
<tr><td style="padding:28px 32px">
<p style="margin:0 0 16px;font-size:15px;line-height:1.6">${esc(o.intro)}</p>
<p style="margin:0 0 4px;font-size:13px;color:#5b6576">Quando</p>
<p style="margin:0 0 16px;font-size:16px;font-weight:600">${esc(o.when)}</p>
${o.host ? `<p style="margin:0 0 4px;font-size:13px;color:#5b6576">Com</p><p style="margin:0 0 20px;font-size:16px;font-weight:600">${esc(o.host)}</p>` : ""}
<a href="${esc(o.url)}" style="display:inline-block;background:#0a1f3b;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:999px;font-weight:600;font-size:15px">${esc(o.cta ?? "Entrar na reunião")}</a>
${(o.links ?? []).map((l) => `<p style="margin:14px 0 0;font-size:14px"><a href="${esc(l.url)}" style="color:#0a1f3b;font-weight:600">${esc(l.label)}</a></p>`).join("")}
<p style="margin:20px 0 0;font-size:12px;color:#5b6576;line-height:1.5">A sala abre no navegador, sem instalar nada. Se o botão não funcionar, copie: ${esc(o.url)}</p>
<p style="margin:16px 0 0;font-size:11px;color:#8a93a3;line-height:1.5">${esc(o.notice)}</p>
</td></tr></table></td></tr></table></body></html>`;
}

interface Ctx {
  meeting: Record<string, unknown> & {
    id: string;
    account_id: string;
    title: string;
    scheduled_start: string | null;
    scheduled_end: string | null;
    contact_id: string | null;
    host_user_id: string | null;
    status: string;
  };
  contact: { id: string; name: string | null; email: string | null; phone: string | null } | null;
  hostName: string | null;
  company: string;
  timeZone: string;
  notice: string;
  hasWhatsapp: boolean;
}

async function load(meetingId: string): Promise<Ctx | null> {
  const db = admin();
  const { data: meeting } = await db.from("meetings").select("*").eq("id", meetingId).maybeSingle();
  if (!meeting) return null;
  const [contact, account, host, wa] = await Promise.all([
    meeting.contact_id
      ? db
          .from("contacts")
          .select("id, name, email, phone")
          .eq("id", meeting.contact_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    db.from("accounts").select("name, timezone, settings").eq("id", meeting.account_id).single(),
    meeting.host_user_id
      ? db.from("profiles").select("full_name").eq("id", meeting.host_user_id).maybeSingle()
      : Promise.resolve({ data: null }),
    meeting.contact_id
      ? db
          .from("contact_identities")
          .select("id")
          .eq("contact_id", meeting.contact_id)
          .eq("platform", "whatsapp")
          .limit(1)
      : Promise.resolve({ data: [] }),
  ]);
  const privacy = ((account.data?.settings ?? {}) as { privacy?: { recording_notice?: string } })
    .privacy;
  return {
    meeting: meeting as Ctx["meeting"],
    contact: contact.data,
    hostName: host.data?.full_name ?? null,
    company: account.data?.name ?? "",
    timeZone: account.data?.timezone || "America/Sao_Paulo",
    notice:
      privacy?.recording_notice ??
      "A reunião pode ser gravada e transcrita para registrar o que combinamos.",
    hasWhatsapp: (wa.data ?? []).length > 0,
  };
}

type InviteKind = "invite" | "rescheduled" | "reminder_24h" | "reminder_1h";

async function sendInvite(job: Job, kind: InviteKind) {
  const p = job.payload as unknown as { meeting_id: string; start?: string };
  const ctx = await load(p.meeting_id);
  if (!ctx) return { skipped: "reunião não existe" };
  const { meeting, contact } = ctx;
  if (["canceled", "ended", "no_show"].includes(meeting.status))
    return { skipped: `reunião ${meeting.status}` };
  if (!contact) return { skipped: "sem contato" };
  // lembrete agendado para um horário que já mudou (remarcada): o lembrete novo cuida disso
  if (
    p.start &&
    meeting.scheduled_start &&
    new Date(p.start).getTime() !== new Date(meeting.scheduled_start).getTime()
  )
    return { skipped: "reunião remarcada" };
  const db = admin();
  const raw = await issueContactToken(meeting.account_id, meeting.id, contact.id);
  const url = meetingUrl(meeting.id, raw);
  // sem o segredo dos links o convite sai mesmo assim, só sem confirmar/remarcar
  const manage = await manageUrl(meeting.id, meeting.scheduled_end).catch(() => null);
  const confirmUrl =
    manage && kind === "reminder_24h" && !meeting["guest_confirmed_at"]
      ? `${manage}?acao=confirmar`
      : null;
  const links = [
    ...(confirmUrl ? [{ label: "Confirmo presença", url: confirmUrl }] : []),
    ...(manage ? [{ label: "Precisa remarcar ou cancelar?", url: manage }] : []),
  ];
  const start = new Date(meeting.scheduled_start ?? Date.now());
  const end = new Date(meeting.scheduled_end ?? start.getTime() + 30 * 60_000);
  const when = formatWhen(start.toISOString(), ctx.timeZone);
  const first = contact.name?.split(" ")[0] ?? "";
  const heading =
    kind === "invite"
      ? meeting.title
      : kind === "rescheduled"
        ? `Remarcada: ${meeting.title}`
        : kind === "reminder_24h"
          ? `Amanhã: ${meeting.title}`
          : `Em 1 hora: ${meeting.title}`;
  const intro =
    kind === "invite"
      ? `Olá${first ? `, ${first}` : ""}! Sua reunião está confirmada. Guarde o link abaixo para entrar no horário.`
      : kind === "rescheduled"
        ? `Olá${first ? `, ${first}` : ""}! Sua reunião foi remarcada. O novo horário está abaixo.`
        : `Olá${first ? `, ${first}` : ""}! Passando para lembrar da nossa reunião.`;
  const out: Record<string, string> = {};
  const queue = async (
    channel: "email" | "whatsapp" | "sms",
    address: string,
    jobKind: keyof JobPayloads,
    payload: Record<string, unknown>,
  ) => {
    const { data: jobId } = await db.rpc("enqueue_job", {
      _account: meeting.account_id,
      _kind: jobKind,
      _payload: payload as never,
      _dedupe: `${kind}:${channel}:${meeting.id}:${start.toISOString()}`,
    });
    await db.from("meeting_invites").insert({
      account_id: meeting.account_id,
      meeting_id: meeting.id,
      channel,
      kind,
      address,
      status: jobId ? "queued" : "skipped",
      job_id: (jobId as string | null) ?? null,
      ...(jobId ? {} : { error: "já enfileirado" }),
    });
    out[channel] = jobId ? "queued" : "duplicate";
  };

  if (contact.email) {
    const ics = buildIcs({
      uid: meeting.id,
      title: meeting.title,
      description: `Reunião com ${ctx.company}`,
      start,
      end,
      url,
      organizer: ctx.hostName ?? ctx.company,
    });
    const payload: JobPayloads["email.send"] & {
      attachments: { filename: string; content: string; content_type: string }[];
    } = {
      to_email: contact.email,
      to_contact_id: contact.id,
      subject: `${kind === "invite" ? "Convite" : kind === "rescheduled" ? "Remarcada" : "Lembrete"}: ${meeting.title} · ${when}`,
      html: emailHtml({
        heading,
        intro,
        when,
        host: ctx.hostName,
        url,
        company: ctx.company,
        notice: ctx.notice,
        links,
      }),
      text: `${intro}\n\nQuando: ${when}\nEntrar: ${url}\n${links.map((l) => `${l.label} ${l.url}`).join("\n")}\n\n${ctx.notice}`,
      category: "transactional",
      from_user_id: meeting.host_user_id,
      attachments: [
        {
          filename: "convite.ics",
          content: Buffer.from(ics).toString("base64"),
          content_type: "text/calendar; method=REQUEST",
        },
      ],
    };
    await queue("email", contact.email, "email.send", payload);
  }
  if (contact.phone) {
    const extra = confirmUrl
      ? `\n\nConfirmar presença: ${confirmUrl}\nPrecisa mudar? ${manage}`
      : manage
        ? `\n\nPrecisa remarcar ou cancelar? ${manage}`
        : "";
    const text =
      kind === "invite" || kind === "rescheduled"
        ? `${intro}\n\nQuando: ${when}${ctx.hostName ? `\nCom: ${ctx.hostName}` : ""}\nLink: ${url}\n\nÉ só abrir o link no horário, pelo celular ou computador.${extra}`
        : `${intro}\n\nQuando: ${when}\nLink: ${url}${extra}`;
    if (ctx.hasWhatsapp || kind === "invite" || kind === "rescheduled") {
      const wa: JobPayloads["whatsapp.send"] = {
        contact_id: contact.id,
        text,
        category: "utility",
      };
      await queue("whatsapp", contact.phone, "whatsapp.send", wa);
    }
    if (!ctx.hasWhatsapp) {
      const sms: JobPayloads["sms.send"] = {
        contact_id: contact.id,
        text: `${heading} - ${when}. Entrar: ${url}`,
      };
      await queue("sms", contact.phone, "sms.send", sms);
    }
  }
  return out;
}

registerJob("meeting.invite", (job) =>
  sendInvite(
    job,
    (job.payload as { rescheduled?: boolean }).rescheduled ? "rescheduled" : "invite",
  ),
);
registerJob("meeting.reminder", (job) => {
  const kind = (job.payload as { kind?: string }).kind === "1h" ? "reminder_1h" : "reminder_24h";
  return sendInvite(job, kind);
});

// Não compareceu: manda ao contato o link para escolher outro horário (mesma página de remarcar).
registerJob("meeting.no_show", async (job) => {
  const { meeting_id } = job.payload as unknown as JobPayloads["meeting.no_show"];
  const ctx = await load(meeting_id);
  if (!ctx) return { skipped: "reunião não existe" };
  const { meeting, contact } = ctx;
  if (meeting.status !== "no_show") return { skipped: `reunião ${meeting.status}` };
  if (!contact) return { skipped: "sem contato" };
  const db = admin();
  const manage = await manageUrl(meeting.id, meeting.scheduled_end);
  const first = contact.name?.split(" ")[0] ?? "";
  const intro = `Olá${first ? `, ${first}` : ""}! Sentimos sua falta na reunião de hoje. Sem problema: escolha outro horário que funcione melhor para você.`;
  const out: Record<string, string> = {};
  const log = async (channel: "email" | "whatsapp", address: string, jobId: unknown) => {
    await db.from("meeting_invites").insert({
      account_id: meeting.account_id,
      meeting_id: meeting.id,
      channel,
      kind: "no_show",
      address,
      status: jobId ? "queued" : "skipped",
      job_id: (jobId as string | null) ?? null,
    });
    out[channel] = jobId ? "queued" : "duplicate";
  };
  if (contact.phone) {
    const wa: JobPayloads["whatsapp.send"] = {
      contact_id: contact.id,
      text: `${intro}\n\nEscolha um novo horário: ${manage}`,
      category: "utility",
    };
    const { data: id } = await db.rpc("enqueue_job", {
      _account: meeting.account_id,
      _kind: "whatsapp.send",
      _payload: wa as never,
      _dedupe: `no_show:whatsapp:${meeting.id}:${meeting.scheduled_start}`,
    });
    await log("whatsapp", contact.phone, id);
  }
  if (contact.email) {
    const email: JobPayloads["email.send"] = {
      to_email: contact.email,
      to_contact_id: contact.id,
      subject: `Vamos remarcar? ${meeting.title}`,
      html: emailHtml({
        heading: "Vamos remarcar?",
        intro,
        when: formatWhen(meeting.scheduled_start ?? new Date().toISOString(), ctx.timeZone),
        host: ctx.hostName,
        url: manage,
        company: ctx.company,
        notice: "Se preferir, é só responder esta mensagem.",
        cta: "Escolher novo horário",
      }),
      text: `${intro}\n\nEscolha um novo horário: ${manage}`,
      category: "transactional",
      from_user_id: meeting.host_user_id,
    };
    const { data: id } = await db.rpc("enqueue_job", {
      _account: meeting.account_id,
      _kind: "email.send",
      _payload: email as never,
      _dedupe: `no_show:email:${meeting.id}:${meeting.scheduled_start}`,
    });
    await log("email", contact.email, id);
  }
  return out;
});

interface Minutes {
  summary: string;
  decisions: string[];
  objections: { objection: string; handled: boolean }[];
  next_steps: { title: string; owner: "vendedor" | "cliente"; due_in_days: number }[];
  qualification: Record<string, string>;
  risks: string[];
  interest: string[];
  follow_up: string;
  scores: { id: string; score: number; evidence: string }[];
}

// Forecast pela conversa: a ata vira uma SUGESTÃO no negócio (o vendedor aplica ou ignora).
async function suggestForecastFromMinutes(
  meeting: { id: string; account_id: string; deal_id: string | null; host_user_id: string | null },
  m: Minutes,
  total: number,
): Promise<void> {
  if (!meeting.deal_id) return;
  const db = admin();
  const { data: deal } = await db
    .from("deals")
    .select("id, title, status, custom, expected_close_date, owner_user_id")
    .eq("id", meeting.deal_id)
    .maybeSingle();
  if (!deal || deal.status !== "open") return;
  const current = currentCategory(deal.custom);
  const s = suggestForecast(
    current,
    {
      risks: m.risks,
      objections: m.objections,
      decisions: m.decisions,
      next_steps: m.next_steps,
      score: total,
    },
    deal.expected_close_date,
  );
  if (!s) return;
  // Uma sugestão aberta por negócio: a nova substitui a anterior.
  await db
    .from("deal_forecast_suggestions")
    .update({ status: "superseded" })
    .eq("deal_id", deal.id)
    .eq("status", "pending");
  const { error } = await db.from("deal_forecast_suggestions").insert({
    account_id: meeting.account_id,
    deal_id: deal.id,
    meeting_id: meeting.id,
    current_category: current,
    suggested_category: s.suggested,
    reasons: s.reasons.map((r) => r.slice(0, 300)).slice(0, 6),
  });
  if (error) {
    console.warn("[meeting.minutes] sugestão de forecast", error.message);
    return;
  }
  const to = deal.owner_user_id ?? meeting.host_user_id;
  if (to)
    await db.rpc("notify_user", {
      _account: meeting.account_id,
      _user: to,
      _kind: "forecast_suggestion",
      _title: `Forecast: ${deal.title} pode ir para ${FORECAST_LABEL[s.suggested]}`,
      ...(s.reasons[0] ? { _body: s.reasons[0] } : {}),
      _link: `/crm?negocio=${deal.id}`,
    });
}

registerJob("meeting.minutes", async (job) => {
  const { meeting_id } = job.payload as unknown as JobPayloads["meeting.minutes"];
  const db = admin();
  const { data: meeting } = await db
    .from("meetings")
    .select("*")
    .eq("id", meeting_id)
    .maybeSingle();
  if (!meeting) return { skipped: "reunião não existe" };
  const { data: lines } = await db
    .from("meeting_transcripts")
    .select("speaker_label, is_seller, text, start_ms")
    .eq("meeting_id", meeting_id)
    .order("id")
    .limit(3000);
  if (!lines || lines.length < 3) return { skipped: "transcrição curta demais para ata" };
  const playbook = await loadPlaybook(meeting.playbook_id);
  const { data: pbRow } = meeting.playbook_id
    ? await db.from("playbooks").select("scorecard_id").eq("id", meeting.playbook_id).maybeSingle()
    : { data: null };
  const { data: card } = pbRow?.scorecard_id
    ? await db
        .from("scorecard_templates")
        .select("criteria")
        .eq("id", pbRow.scorecard_id)
        .maybeSingle()
    : await db
        .from("scorecard_templates")
        .select("criteria")
        .eq("account_id", meeting.account_id)
        .order("is_default", { ascending: false })
        .limit(1)
        .maybeSingle();
  const criteria = (
    Array.isArray(card?.criteria) ? card.criteria : TEMPLATE_SCORECARD.criteria
  ) as { id: string; label: string; description?: string; weight: number }[];
  const fields = FRAMEWORK_FIELDS[playbook.framework];
  const transcript = lines
    .map(
      (l) =>
        `${l.is_seller ? "VENDEDOR" : (l.speaker_label ?? "CLIENTE").toUpperCase()}: ${l.text}`,
    )
    .join("\n")
    .slice(-60_000);

  const { data: m } = await callJson<Minutes>({
    accountId: meeting.account_id,
    purpose: "meeting_minutes",
    tier: "smart",
    maxTokens: 2500,
    system:
      "Você escreve a ata de uma reunião de vendas em português do Brasil, fiel à transcrição. Nunca invente valores, prazos ou nomes que não foram ditos. Próximos passos com dono (vendedor ou cliente) e prazo em dias. A mensagem de follow-up é curta, cordial, em nome do vendedor, para WhatsApp ou e-mail.",
    messages: [
      {
        role: "user",
        content: `Reunião: ${meeting.title}\nFramework de qualificação: ${playbook.framework} (${fields.map((f) => f.id).join(", ")})\nCritérios da nota (0 a 10 cada): ${criteria.map((c) => `${c.id}=${c.label}${c.description ? ` (${c.description})` : ""}`).join("; ")}\n\nTranscrição:\n${transcript}`,
      },
    ],
    schemaName: "ata_da_reuniao",
    schema: {
      type: "object",
      properties: {
        summary: { type: "string", description: "Resumo em até 6 linhas" },
        decisions: { type: "array", items: { type: "string" } },
        objections: {
          type: "array",
          items: {
            type: "object",
            properties: { objection: { type: "string" }, handled: { type: "boolean" } },
            required: ["objection", "handled"],
          },
        },
        next_steps: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              owner: { type: "string", enum: ["vendedor", "cliente"] },
              due_in_days: { type: "number" },
            },
            required: ["title", "owner", "due_in_days"],
          },
        },
        qualification: {
          type: "object",
          description: `Chaves: ${fields.map((f) => f.id).join(", ")}. Só o que foi dito; vazio se não apareceu.`,
          additionalProperties: { type: "string" },
        },
        risks: { type: "array", items: { type: "string" } },
        interest: {
          type: "array",
          items: { type: "string" },
          description: "Produtos ou serviços que o cliente demonstrou interesse",
        },
        follow_up: { type: "string" },
        scores: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              score: { type: "number" },
              evidence: { type: "string" },
            },
            required: ["id", "score", "evidence"],
          },
        },
      },
      required: [
        "summary",
        "decisions",
        "objections",
        "next_steps",
        "qualification",
        "risks",
        "interest",
        "follow_up",
        "scores",
      ],
    },
  });

  const totalWeight = criteria.reduce((s, c) => s + (c.weight || 1), 0) || 1;
  const scored = criteria.map((c) => {
    const s = m.scores.find((x) => x.id === c.id);
    return {
      id: c.id,
      label: c.label,
      weight: c.weight || 1,
      score: Math.max(0, Math.min(10, Number(s?.score ?? 0))),
      evidence: s?.evidence ?? "",
    };
  });
  const total = Math.round(
    (scored.reduce((sum, c) => sum + c.score * c.weight, 0) / totalWeight) * 10,
  );

  await db
    .from("meetings")
    .update({
      minutes: {
        summary: m.summary,
        decisions: m.decisions,
        objections: m.objections,
        next_steps: m.next_steps,
        qualification: m.qualification,
        risks: m.risks,
        interest: m.interest,
        follow_up: m.follow_up,
        framework: playbook.framework,
      } as never,
      score: { total, criteria: scored } as never,
    })
    .eq("id", meeting_id);

  const host = meeting.host_user_id;
  await db.from("activities").insert({
    account_id: meeting.account_id,
    contact_id: meeting.contact_id,
    deal_id: meeting.deal_id,
    type: "meeting",
    title: `Ata: ${meeting.title}`,
    body: `${m.summary}\n\nPróximos passos:\n${m.next_steps.map((n) => `• ${n.title} (${n.owner})`).join("\n")}`,
    user_id: host,
    done_at: new Date().toISOString(),
  });
  const tasks = m.next_steps
    .filter((n) => n.owner === "vendedor")
    .slice(0, 8)
    .map((n) => ({
      account_id: meeting.account_id,
      contact_id: meeting.contact_id,
      deal_id: meeting.deal_id,
      type: "task",
      title: n.title.slice(0, 200),
      user_id: host,
      due_at: new Date(
        Date.now() + Math.max(0, Math.min(60, Number(n.due_in_days) || 1)) * 86_400_000,
      ).toISOString(),
    }));
  if (tasks.length && host) await db.from("activities").insert(tasks);

  if (meeting.deal_id) {
    const { data: deal } = await db
      .from("deals")
      .select("custom")
      .eq("id", meeting.deal_id)
      .maybeSingle();
    const qual = Object.fromEntries(
      Object.entries(m.qualification ?? {}).filter(([, v]) => typeof v === "string" && v.trim()),
    );
    if (Object.keys(qual).length)
      await db
        .from("deals")
        .update({
          custom: {
            ...((deal?.custom ?? {}) as Record<string, unknown>),
            qualificacao: {
              ...qual,
              framework: playbook.framework,
              fonte: "reunião",
              atualizado_em: new Date().toISOString(),
            },
          } as never,
        })
        .eq("id", meeting.deal_id);
  }
  if (meeting.deal_id) await suggestForecastFromMinutes(meeting, m, total);
  if (meeting.contact_id && m.next_steps[0])
    await db
      .from("contacts")
      .update({ ai_next_step: m.next_steps[0].title.slice(0, 300) })
      .eq("id", meeting.contact_id);
  if (meeting.contact_id && m.interest.length) {
    // Interesse dito na reunião alimenta a oportunidade (mesma lógica da classificação).
    const { data: products } = await db
      .from("products")
      .select("id, name, keywords")
      .eq("account_id", meeting.account_id)
      .eq("active", true);
    const norm = (s: string) =>
      s
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
    const hits = (products ?? []).filter((p) =>
      m.interest.some(
        (i) =>
          norm(i).includes(norm(p.name)) ||
          (p.keywords ?? []).some((k: string) => norm(i).includes(norm(k))),
      ),
    );
    for (const p of hits)
      await db.from("contact_interests").upsert(
        {
          account_id: meeting.account_id,
          contact_id: meeting.contact_id,
          product_id: p.id,
          confidence: 75,
          source: "ai",
          evidence: "Citado na reunião",
        },
        { onConflict: "contact_id,product_id", ignoreDuplicates: true },
      );
    if (hits.length)
      await db.rpc("build_opportunity", { _contact: meeting.contact_id }).then(
        () => undefined,
        () => undefined,
      );
  }
  if (host)
    await db.rpc("notify_user", {
      _account: meeting.account_id,
      _user: host,
      _kind: "meeting_minutes",
      _title: `Ata pronta: ${meeting.title}`,
      _body: `Nota ${total}/100 · ${tasks.length} tarefa(s) criada(s)`,
      _link: `/reunioes/${meeting.id}`,
    });
  await db.rpc("enqueue_job", {
    _account: meeting.account_id,
    _kind: "terms.alert",
    _payload: { source: "meeting", source_id: meeting.id },
    _dedupe: `terms:meeting:${meeting.id}`,
  });
  return { total, tasks: tasks.length };
});

// Referenciado em handlers.server.ts para o módulo não ser descartado no build.
export const registered = true;
