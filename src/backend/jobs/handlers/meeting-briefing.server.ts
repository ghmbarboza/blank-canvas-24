// Briefing da IA 30 min antes da reunião: junta contato, negócio, mensagens, ata anterior e
// playbook; guarda em meetings.briefing e avisa o anfitrião.
import { admin } from "@/backend/http.server";
import { callJson } from "@/backend/llm.server";
import {
  BRIEFING_SCHEMA,
  BRIEFING_SYSTEM,
  briefingPrompt,
  normalizeBriefing,
  type Briefing,
  type BriefingInput,
} from "@/backend/meetings/briefing";
import { formatWhen, loadPlaybook } from "@/backend/meetings.server";

import type { JobPayloads } from "../contract";
import { registerJob } from "../registry.server";

async function recentMessages(contactId: string): Promise<BriefingInput["messages"]> {
  const db = admin();
  const { data: convs } = await db
    .from("conversations")
    .select("id")
    .eq("contact_id", contactId)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(5);
  const ids = (convs ?? []).map((c) => c.id);
  if (!ids.length) return [];
  const { data } = await db
    .from("messages")
    .select("direction, body, transcript, created_at")
    .in("conversation_id", ids)
    .eq("is_private", false)
    .order("created_at", { ascending: false })
    .limit(15);
  return (data ?? [])
    .map((m) => ({ direction: m.direction, body: m.body ?? m.transcript ?? "", at: m.created_at }))
    .filter((m) => m.body.trim())
    .reverse();
}

async function previousMeeting(
  meetingId: string,
  contactId: string,
  timeZone: string,
): Promise<BriefingInput["previous"]> {
  const { data } = await admin()
    .from("meetings")
    .select("title, scheduled_start, minutes")
    .eq("contact_id", contactId)
    .neq("id", meetingId)
    .not("minutes", "is", null)
    .order("scheduled_start", { ascending: false })
    .limit(1)
    .maybeSingle();
  const min = (data?.minutes ?? null) as {
    summary?: string;
    next_steps?: { title: string }[];
  } | null;
  if (!data || !min?.summary) return null;
  return {
    title: data.title,
    at: data.scheduled_start ? formatWhen(data.scheduled_start, timeZone) : null,
    summary: min.summary,
    next_steps: (min.next_steps ?? []).map((n) => n.title).slice(0, 6),
  };
}

async function dealInfo(dealId: string | null): Promise<BriefingInput["deal"]> {
  if (!dealId) return null;
  const db = admin();
  const { data: d } = await db
    .from("deals")
    .select("title, value, status, stage_id")
    .eq("id", dealId)
    .maybeSingle();
  if (!d) return null;
  const { data: st } = await db
    .from("pipeline_stages")
    .select("name")
    .eq("id", d.stage_id)
    .maybeSingle();
  return { title: d.title, value: d.value, status: d.status, stage: st?.name ?? null };
}

registerJob("meeting.briefing", async (job) => {
  const { meeting_id } = job.payload as unknown as JobPayloads["meeting.briefing"];
  const db = admin();
  const { data: m } = await db.from("meetings").select("*").eq("id", meeting_id).maybeSingle();
  if (!m) return { skipped: "reunião não existe" };
  if (m.status !== "scheduled") return { skipped: `reunião ${m.status}` };
  if (!m.host_user_id) return { skipped: "sem anfitrião" };
  if (m.scheduled_start && new Date(m.scheduled_start).getTime() - Date.now() > 45 * 60_000)
    return { skipped: "reunião remarcada para mais tarde" };
  const { data: account } = await db
    .from("accounts")
    .select("timezone")
    .eq("id", m.account_id)
    .single();
  const tz = account?.timezone || "America/Sao_Paulo";
  const { data: contact } = m.contact_id
    ? await db
        .from("contacts")
        .select("name, company, job_title, lifecycle, score, ai_summary, ai_next_step, notes")
        .eq("id", m.contact_id)
        .maybeSingle()
    : { data: null };
  const [messages, previous, deal, playbook] = await Promise.all([
    m.contact_id ? recentMessages(m.contact_id) : Promise.resolve([]),
    m.contact_id ? previousMeeting(m.id, m.contact_id, tz) : Promise.resolve(null),
    dealInfo(m.deal_id),
    loadPlaybook(m.playbook_id),
  ]);
  const input: BriefingInput = {
    title: m.title,
    when: formatWhen(m.scheduled_start ?? new Date().toISOString(), tz),
    contact,
    deal,
    answers: (m.booking_answers ?? {}) as Record<string, unknown>,
    messages,
    previous,
    playbook: {
      name: playbook.name,
      questions: playbook.questions.map((q) => q.label),
      objections: playbook.objections.map((o) => o.label),
    },
  };
  const { data } = await callJson<Briefing>(m.account_id, "meeting_briefing", {
    system: BRIEFING_SYSTEM,
    messages: [{ role: "user", content: briefingPrompt(input) }],
    schemaName: "briefing_da_reuniao",
    schema: BRIEFING_SCHEMA as unknown as Record<string, unknown>,
    maxTokens: 1500,
  });
  const briefing = normalizeBriefing(data);
  const at = new Date().toISOString();
  await db
    .from("meetings")
    .update({ briefing: { ...briefing, generated_at: at } as never, briefing_at: at })
    .eq("id", m.id);
  await db.rpc("notify_user", {
    _account: m.account_id,
    _user: m.host_user_id,
    _kind: "meeting_briefing",
    _title: `Briefing pronto: ${m.title}`,
    _body: briefing.goal || briefing.summary.slice(0, 200),
    _link: `/reunioes/${m.id}`,
  });
  return { ok: true };
});

// Referenciado em handlers.server.ts para o módulo não ser descartado no build.
export const registered = true;
