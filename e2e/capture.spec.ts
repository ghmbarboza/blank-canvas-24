import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

// Só roda com opt-in explícito e conta marcada como teste/demo. Nunca envia mensagem externa.
test.skip(
  process.env["E2E_MUTATIONS"] !== "1",
  "Defina E2E_MUTATIONS=1 para a jornada com dados de teste",
);

test("captação persiste responsável, negócio e consentimento sem duplicar no retry", async ({
  request,
}) => {
  const db = createClient(process.env["E2E_SUPABASE_URL"]!, process.env["E2E_SUPABASE_KEY"]!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: loginError } = await db.auth.signInWithPassword({
    email: process.env["E2E_EMAIL"]!,
    password: process.env["E2E_PASSWORD"]!,
  });
  expect(loginError).toBeNull();
  const accountId = process.env["E2E_ACCOUNT_ID"]!;
  const { data: account, error: accountError } = await db
    .from("accounts")
    .select("name")
    .eq("id", accountId)
    .single();
  expect(accountError).toBeNull();
  expect(account?.name).toMatch(/teste|demo/i);
  const { data: user } = await db.auth.getUser();
  const { data: pipeline } = await db
    .from("pipelines")
    .select("id")
    .eq("account_id", accountId)
    .order("is_default", { ascending: false })
    .limit(1)
    .single();
  expect(pipeline?.id).toBeTruthy();
  let formId: string | null = null;
  let contactId: string | null = null;
  const stamp = crypto.randomUUID();
  try {
    const { data: form, error } = await db
      .from("forms")
      .insert({
        account_id: accountId,
        name: `E2E captação ${stamp}`,
        status: "active",
        fields: [
          { key: "name", label: "Nome", type: "text", required: true, map: "name" },
          { key: "email", label: "E-mail", type: "email", required: true, map: "email" },
        ],
        consent: {
          enabled: true,
          required: true,
          channels: ["whatsapp"],
          text: "Aceito contato de teste.",
        },
        destination: {
          owner_mode: "user",
          users: [user.user!.id],
          create_deal: true,
          pipeline_id: pipeline!.id,
          tags: ["auditoria-e2e"],
        },
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    formId = form!.id;
    const body = {
      formId,
      values: { name: `Auditoria ${stamp}`, email: `${stamp}@example.invalid` },
      consent: true,
      visitorId: stamp,
      startedAt: Date.now() - 5000,
    };
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await request.post("/api/public/forms/submit", { data: body });
      expect(result.status(), await result.text()).toBe(200);
    }
    const { data: contact } = await db
      .from("contacts")
      .select("id,owner_user_id,tags")
      .eq("account_id", accountId)
      .eq("email", body.values.email)
      .single();
    expect(contact).toBeTruthy();
    contactId = contact!.id;
    expect(contact!.owner_user_id).toBe(user.user!.id);
    expect(contact!.tags).toContain("auditoria-e2e");
    const { data: deals } = await db
      .from("deals")
      .select("id,owner_user_id")
      .eq("contact_id", contactId);
    expect(deals).toHaveLength(1);
    expect(deals![0]!.owner_user_id).toBe(user.user!.id);
    const { data: submissions } = await db
      .from("form_submissions")
      .select("id,processed_at")
      .eq("form_id", formId);
    expect(submissions).toHaveLength(1);
    expect(submissions![0]!.processed_at).toBeTruthy();
    const { data: consents } = await db
      .from("consents")
      .select("channel,status")
      .eq("contact_id", contactId);
    expect(consents).toEqual([{ channel: "whatsapp", status: "granted" }]);
  } finally {
    // Recupera o contato mesmo se uma assertiva anterior à leitura falhar.
    if (!contactId) {
      const { data } = await db
        .from("contacts")
        .select("id")
        .eq("account_id", accountId)
        .eq("email", `${stamp}@example.invalid`)
        .maybeSingle();
      contactId = data?.id ?? null;
    }
    if (contactId) {
      await db.from("deals").delete().eq("account_id", accountId).eq("contact_id", contactId);
      await db.from("contacts").delete().eq("account_id", accountId).eq("id", contactId);
    }
    if (formId) await db.from("forms").delete().eq("account_id", accountId).eq("id", formId);
    await db.auth.signOut();
  }
});
