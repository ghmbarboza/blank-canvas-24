// Alerta de termo monitorado: depois da ata da reunião e do processamento da ligação, procura na
// transcrição os termos com alerta ligado e avisa gestores e o dono da conversa, com link direto.
import { admin } from "@/backend/http.server";
import { findTerms } from "@/backend/library/terms";

import type { JobPayloads } from "../contract";
import { registerJob } from "../registry.server";

const CATEGORY: Record<string, string> = {
  competitor: "concorrente",
  price: "preço",
  cancellation: "cancelamento",
  other: "termo",
};

registerJob("terms.alert", async (job) => {
  const { source, source_id } = job.payload as unknown as JobPayloads["terms.alert"];
  if (!job.account_id) throw new Error("payload incompleto");
  const db = admin();
  const { data: terms } = await db
    .from("tracked_terms")
    .select("id, term, category")
    .eq("account_id", job.account_id)
    .eq("alert", true);
  if (!terms?.length) return { skipped: "nenhum termo com alerta" };

  let text = "";
  let owner: string | null = null;
  let title = "";
  let link = "";
  if (source === "meeting") {
    const [{ data: m }, { data: lines }] = await Promise.all([
      db.from("meetings").select("title, host_user_id").eq("id", source_id).maybeSingle(),
      db
        .from("meeting_transcripts")
        .select("text")
        .eq("meeting_id", source_id)
        .eq("is_seller", false)
        .order("start_ms")
        .limit(2000),
    ]);
    if (!m) return { skipped: "reunião não existe" };
    text = (lines ?? []).map((l) => l.text).join("\n");
    owner = m.host_user_id;
    title = m.title;
    link = `/reunioes/${source_id}`;
  } else {
    const { data: c } = await db
      .from("calls")
      .select("transcript, user_id, contacts(name)")
      .eq("id", source_id)
      .maybeSingle();
    if (!c) return { skipped: "ligação não existe" };
    text = typeof c.transcript === "string" ? c.transcript : JSON.stringify(c.transcript ?? "");
    owner = c.user_id;
    const contact = (c.contacts as { name?: string | null } | null)?.name;
    title = contact ? `Ligação com ${contact}` : "Ligação";
    link = `/ligacoes?chamada=${source_id}`;
  }

  const found = findTerms(text, terms);
  if (!found.length) return { found: 0 };

  const { data: managers } = await db
    .from("memberships")
    .select("user_id")
    .eq("account_id", job.account_id)
    .eq("is_active", true)
    .in("role", ["owner", "admin", "manager"]);
  const users = [...new Set([...(managers ?? []).map((m) => m.user_id), owner].filter(Boolean))];
  const summary = found
    .map(
      (t) => `"${t.term}" (${CATEGORY[t.category] ?? "termo"}${t.hits > 1 ? `, ${t.hits}×` : ""})`,
    )
    .join(", ");
  for (const user of users)
    await db.rpc("notify_user", {
      _account: job.account_id,
      _user: user as string,
      _kind: "tracked_term",
      _title: `Termo monitorado em: ${title}`,
      _body: `O cliente falou ${summary}.`,
      _link: link,
    });
  return { found: found.length, notified: users.length };
});

export const registered = true;
