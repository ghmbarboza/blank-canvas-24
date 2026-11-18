// Supervisor da equipe de IA (varredura periódica, a cada 5 min por conta): marca IA calada sem
// dono e conversa travada (SQL), cliente irritado e promessa indevida (regra óbvia + modelo, só
// com o agente Supervisor ligado), dá dono a quem está sem e avisa o gestor uma vez por sinal.
import { admin } from "@/backend/http.server";

import { openFlag } from "./flags.server";
import { callJson } from "@/backend/llm.server";

import { handOffToHuman } from "./orchestrator.server";
import {
  acceptFlags,
  FLAG_LABEL,
  obviousFlags,
  SUPERVISOR_INTERVAL_MS,
  SUPERVISOR_MAX_CONVERSATIONS,
  SUPERVISOR_SCHEMA,
  supervisorPrompt,
  type FlagOut,
  type Snippet,
} from "./supervisor-logic";
import { notifyManagers } from "./tools.server";

const lastRun = new Map<string, number>();

async function recentSnippets(accountId: string): Promise<Snippet[]> {
  const db = admin();
  const since = new Date(Date.now() - 15 * 60_000).toISOString();
  const { data: recent } = await db
    .from("messages")
    .select("conversation_id")
    .eq("account_id", accountId)
    .eq("sender_type", "ai")
    .gte("created_at", since)
    .limit(200);
  const ids = [...new Set((recent ?? []).map((m) => m.conversation_id))].slice(
    0,
    SUPERVISOR_MAX_CONVERSATIONS,
  );
  if (!ids.length) return [];
  const { data: msgs } = await db
    .from("messages")
    .select("conversation_id, direction, sender_type, body, transcript, created_at")
    .in("conversation_id", ids)
    .eq("is_private", false)
    .gte("created_at", new Date(Date.now() - 6 * 3600_000).toISOString())
    .order("created_at")
    .limit(400);
  return ids.map((id) => ({
    conversation_id: id,
    messages: (msgs ?? [])
      .filter((m) => m.conversation_id === id && (m.body || m.transcript))
      .map((m) => ({
        from: (m.direction === "in"
          ? "cliente"
          : m.sender_type === "ai"
            ? "ia"
            : "atendente") as Snippet["messages"][number]["from"],
        text: (m.body ?? m.transcript ?? "").slice(0, 600),
      })),
  }));
}

async function raise(
  accountId: string,
  f: FlagOut & { assignee?: string | null },
): Promise<boolean> {
  const db = admin();
  let created = false;
  let id: string | null = null;
  try {
    ({ created, id } = await openFlag({
      account_id: accountId,
      conversation_id: f.conversation_id,
      kind: f.kind,
      detail: f.detail.slice(0, 600),
      evidence: f.evidence.slice(0, 1000) || null,
      assigned_user_id: f.assignee ?? null,
    }));
  } catch (err) {
    console.error("[supervisor] sinal", err instanceof Error ? err.message : err);
    return false;
  }
  if (created && id) {
    await notifyManagers(
      accountId,
      `${FLAG_LABEL[f.kind]}`,
      f.detail,
      `/inbox/${f.conversation_id}`,
    );
    await db
      .from("supervisor_flags")
      .update({ notified_at: new Date().toISOString() })
      .eq("id", id);
  }
  return created;
}

export async function superviseAccount(accountId: string, useModel: boolean) {
  const db = admin();
  await db.rpc("agents_mark_answered", { _account: accountId });
  // conversas fechadas ou respondidas encerram o sinal
  const { data: open } = await db
    .from("supervisor_flags")
    .select("id, conversation_id, kind, conversations(status, assignee_user_id)")
    .eq("account_id", accountId)
    .eq("status", "open")
    .limit(500);
  for (const f of open ?? []) {
    const c = f.conversations as unknown as {
      status: string;
      assignee_user_id: string | null;
    } | null;
    if (!c || c.status === "closed" || (f.kind === "silent_no_owner" && c.assignee_user_id))
      await db
        .from("supervisor_flags")
        .update({ status: "resolved", resolved_at: new Date().toISOString() })
        .eq("id", f.id);
  }

  let raised = 0;
  const { data: cands } = await db.rpc("agents_supervisor_candidates", {
    _account: accountId,
    _silent_minutes: 10,
  });
  for (const c of (cands ?? []) as {
    conversation_id: string;
    kind: "silent_no_owner" | "stuck";
    detail: string;
    assignee: string | null;
  }[]) {
    let assignee = c.assignee;
    if (c.kind === "silent_no_owner") {
      // escalar não pode calar: a conversa ganha dono e prazo agora
      const { data: conv } = await db
        .from("conversations")
        .select("contact_id")
        .eq("id", c.conversation_id)
        .maybeSingle();
      assignee = await handOffToHuman({
        accountId,
        conversationId: c.conversation_id,
        agentId: null,
        currentAssignee: null,
        contactId: conv?.contact_id ?? null,
        reason: "o supervisor achou a conversa sem dono",
        summary: c.detail,
        slaMinutes: 10,
      });
    }
    if (
      await raise(accountId, {
        conversation_id: c.conversation_id,
        kind: c.kind,
        detail: c.detail,
        evidence: "",
        assignee,
      })
    )
      raised += 1;
  }

  const snippets = await recentSnippets(accountId);
  const found: FlagOut[] = snippets.flatMap(obviousFlags);
  if (useModel && snippets.length) {
    try {
      const p = supervisorPrompt(snippets);
      const { data } = await callJson<unknown>(accountId, "agent_supervisor", {
        system: p.system,
        messages: [{ role: "user", content: p.user }],
        schemaName: "sinais",
        schema: SUPERVISOR_SCHEMA,
        maxTokens: 1200,
      });
      found.push(...acceptFlags(data, snippets));
    } catch (err) {
      console.error("[supervisor] modelo", err instanceof Error ? err.message : err);
    }
  }
  const seen = new Set<string>();
  for (const f of found) {
    const k = `${f.conversation_id}:${f.kind}`;
    if (seen.has(k)) continue;
    seen.add(k);
    if (await raise(accountId, f)) raised += 1;
  }
  return { raised, candidates: (cands ?? []).length, reviewed: snippets.length };
}

/** Tarefa periódica: contas com equipe de IA (qualquer agente ativo), no máximo a cada 5 min. */
export async function superviseAll() {
  const { data } = await admin()
    .from("ai_agents")
    .select("account_id, role")
    .eq("status", "active");
  const accounts = new Map<string, boolean>();
  for (const a of data ?? [])
    accounts.set(a.account_id, (accounts.get(a.account_id) ?? false) || a.role === "supervisor");
  for (const [accountId, useModel] of accounts) {
    if (Date.now() - (lastRun.get(accountId) ?? 0) < SUPERVISOR_INTERVAL_MS) continue;
    lastRun.set(accountId, Date.now());
    try {
      await superviseAccount(accountId, useModel);
    } catch (err) {
      console.error("[supervisor] conta", accountId, err);
    }
  }
}
