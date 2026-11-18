// Testes de contrato da Composio v3.1. As respostas abaixo foram copiadas de chamadas reais
// (26/10/2026, chave de teste, sem conta conectada) e da documentação oficial.
import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { accountFromComposioUser, composioUserId } from "@/features/agents/catalog";

import {
  errorMessage,
  mailAction,
  mailFromTrigger,
  parseConnectedAccount,
  parseExecute,
  parseLink,
  parseSession,
  parseSessionToolkits,
  parseTools,
  parseTriggerEvent,
  req,
  verifyWebhook,
} from "./composio";

const SESSION = {
  session_id: "trs_exemplo",
  mcp: { type: "http", url: "https://backend.composio.dev/tool_router/trs_exemplo/mcp" },
  tool_router_tools: ["COMPOSIO_MULTI_EXECUTE_TOOL", "COMPOSIO_SEARCH_TOOLS"],
  config: { user_id: "nexus-contract-test", manage_connections: { enabled: false } },
};
const LINK = {
  link_token: "lk_exemplo",
  redirect_url: "https://connect.composio.dev/link/lk_exemplo",
  connected_account_id: "ca_exemplo",
  experimental: { account_type: "PRIVATE" },
};
const TOOLKITS = {
  items: [
    {
      name: "Gmail",
      slug: "gmail",
      enabled: true,
      composio_managed_auth_schemes: ["OAUTH2"],
      meta: { logo: "https://logos.composio.dev/api/gmail", description: "Gmail", isNoAuth: false },
      is_no_auth: false,
      connected_account: null,
    },
    {
      name: "Slack",
      slug: "slack",
      enabled: true,
      composio_managed_auth_schemes: ["OAUTH2"],
      meta: { logo: "https://logos.composio.dev/api/slack", description: "Slack", isNoAuth: false },
      is_no_auth: false,
      connected_account: { id: "ca_x", status: "ACTIVE" },
    },
  ],
  next_cursor: null,
  total_pages: 1,
  current_page: 1,
  total_items: 2,
};
const CONNECTED = {
  user_id: "nexus-contract-test",
  id: "ca_exemplo",
  toolkit: { slug: "gmail" },
  status: "INITIALIZING",
  status_reason: null,
};
const NO_CONNECTION = {
  error: {
    message: "No active connection found for toolkit(s) 'gmail' in this session.",
    code: 4302,
    slug: "ToolRouterV2_NoActiveConnection",
    status: 400,
  },
};
const TOOLS = {
  items: [
    {
      slug: "GMAIL_SEND_EMAIL",
      name: "Send Email",
      description: "Sends an email via Gmail API",
      toolkit: { slug: "gmail", name: "gmail", logo: "https://logos.composio.dev/api/gmail" },
      input_parameters: {
        type: "object",
        title: "SendEmailRequest",
        properties: {
          recipient_email: { type: "string", title: "Recipient Email", examples: ["john@doe.com"] },
          subject: { type: "string" },
          body: { type: "string" },
        },
      },
      is_deprecated: false,
    },
    { slug: "GMAIL_OLD", name: "Old", toolkit: { slug: "gmail" }, is_deprecated: true },
  ],
};

describe("pedidos", () => {
  it("sessão sem gerenciador de conexão e sem sandbox", () => {
    expect(req.createSession("nexus-a")).toEqual({
      method: "POST",
      path: "/tool_router/session",
      body: {
        user_id: "nexus-a",
        manage_connections: { enable: false },
        workbench: { enable: false },
      },
    });
  });
  it("link, execução e gatilho nos caminhos da v3.1", () => {
    expect(req.link("trs_1", "gmail", "https://app/cb").path).toBe(
      "/tool_router/session/trs_1/link",
    );
    expect(req.execute("trs_1", "GMAIL_SEND_EMAIL", { a: 1 }).body).toEqual({
      tool_slug: "GMAIL_SEND_EMAIL",
      arguments: { a: 1 },
    });
    expect(
      req.upsertTrigger("GMAIL_NEW_GMAIL_MESSAGE", "nexus-a", "ca_1", { labelIds: "INBOX" }),
    ).toEqual({
      method: "POST",
      path: "/trigger_instances/GMAIL_NEW_GMAIL_MESSAGE/upsert",
      body: {
        user_id: "nexus-a",
        connected_account_id: "ca_1",
        trigger_config: { labelIds: "INBOX" },
      },
    });
    expect(req.createWebhook("https://app/api/public/composio").body).toMatchObject({
      enabled_events: ["composio.trigger.message"],
      version: "V3",
    });
    expect(req.tools("gmail", ["A", "B"]).path).toBe("/tools?tool_slugs=A,B&limit=100");
  });
});

describe("respostas", () => {
  it("sessão e link", () => {
    expect(parseSession(SESSION).sessionId).toBe("trs_exemplo");
    expect(parseLink(LINK)).toEqual({
      redirectUrl: "https://connect.composio.dev/link/lk_exemplo",
      connectedAccountId: "ca_exemplo",
    });
    expect(() => parseLink({})).toThrow();
  });
  it("estado de conexão por toolkit", () => {
    const s = parseSessionToolkits(TOOLKITS);
    expect(s[0]).toMatchObject({ slug: "gmail", status: "pending", connectedAccountId: null });
    expect(s[1]).toMatchObject({ slug: "slack", status: "active", connectedAccountId: "ca_x" });
    expect(parseConnectedAccount(CONNECTED)).toMatchObject({ toolkit: "gmail", status: "pending" });
    expect(parseConnectedAccount({ ...CONNECTED, status: "ACTIVE" }).status).toBe("active");
    expect(parseConnectedAccount({ ...CONNECTED, status: "EXPIRED" }).status).toBe("expired");
  });
  it("catálogo de ações sem as obsoletas", () => {
    const t = parseTools(TOOLS);
    expect(t.map((x) => x.slug)).toEqual(["GMAIL_SEND_EMAIL"]);
    expect(t[0]?.toolkit).toBe("gmail");
  });
  it("execução: result_type manda", () => {
    expect(
      parseExecute({ result_type: "completed", data: { id: 1 }, error: null, log_id: "log_1" }),
    ).toEqual({
      ok: true,
      data: { id: 1 },
      error: null,
      logId: "log_1",
    });
    const failed = parseExecute({ result_type: "failed", data: {}, error: null, log_id: "log_2" });
    expect(failed.ok).toBe(false);
    expect(failed.error).toContain("failed");
    expect(parseExecute({ result_type: "blocked", message: "hook" }).error).toBe("hook");
  });
  it("erro em português", () => {
    expect(errorMessage(400, NO_CONNECTION)).toContain("ainda não foi conectado");
    expect(errorMessage(401, {})).toContain("chave da Composio foi recusada");
  });
});

describe("webhook", () => {
  const secret = "whsec_teste";
  const body = JSON.stringify({ id: "msg_1", type: "composio.trigger.message" });
  const ts = "1761523200";
  const sig = createHmac("sha256", secret).update(`msg_1.${ts}.${body}`).digest("base64");
  it("aceita assinatura certa dentro da janela", () => {
    expect(
      verifyWebhook(
        secret,
        { id: "msg_1", timestamp: ts, signature: `v1,${sig}` },
        body,
        Number(ts),
      ),
    ).toBe(true);
  });
  it("recusa corpo alterado, assinatura ausente e horário velho", () => {
    expect(
      verifyWebhook(
        secret,
        { id: "msg_1", timestamp: ts, signature: `v1,${sig}` },
        `${body} `,
        Number(ts),
      ),
    ).toBe(false);
    expect(
      verifyWebhook(secret, { id: "msg_1", timestamp: ts, signature: null }, body, Number(ts)),
    ).toBe(false);
    expect(
      verifyWebhook(
        secret,
        { id: "msg_1", timestamp: ts, signature: `v1,${sig}` },
        body,
        Number(ts) + 3600,
      ),
    ).toBe(false);
  });

  const GMAIL_EVENT = {
    id: "msg_abc123",
    type: "composio.trigger.message",
    metadata: {
      log_id: "log_abc123",
      trigger_slug: "GMAIL_NEW_GMAIL_MESSAGE",
      trigger_id: "ti_xyz789",
      connected_account_id: "ca_def456",
      auth_config_id: "ac_xyz789",
      user_id: "nexus-e41e66c9-f743-4ca3-af0c-7fd80775468b",
    },
    data: {
      id: "18f1",
      message_id: "18f1",
      thread_id: "18f0",
      sender: '"Ana Souza" <ana@cliente.com.br>',
      subject: "Orçamento",
      message_text: "Oi, queria um orçamento para 20 licenças.",
      label_ids: ["INBOX", "UNREAD"],
    },
    timestamp: "2026-01-15T10:30:00Z",
  };
  it("e-mail novo do Gmail vira e-mail recebido da conta certa", () => {
    const ev = parseTriggerEvent(GMAIL_EVENT)!;
    expect(accountFromComposioUser(ev.userId)).toBe("e41e66c9-f743-4ca3-af0c-7fd80775468b");
    expect(mailFromTrigger(ev)).toEqual({
      fromEmail: "ana@cliente.com.br",
      fromName: "Ana Souza",
      subject: "Orçamento",
      text: "Oi, queria um orçamento para 20 licenças.",
      messageId: "18f1",
      threadId: "18f0",
    });
  });
  it("ignora e-mail enviado e evento que não é gatilho", () => {
    const sent = parseTriggerEvent({
      ...GMAIL_EVENT,
      data: { ...GMAIL_EVENT.data, label_ids: ["SENT"] },
    })!;
    expect(mailFromTrigger(sent)).toBeNull();
    expect(parseTriggerEvent({ type: "composio.connected_account.expired" })).toBeNull();
  });
  it("user_id da Composio por conta", () => {
    expect(composioUserId("abc")).toBe("nexus-abc");
    expect(accountFromComposioUser("outra-coisa")).toBeNull();
  });
});

describe("responder e-mail pela Composio", () => {
  const base = {
    to: "ana@cliente.com.br",
    subject: "Re: Orçamento",
    text: "Segue",
    threadId: null,
    messageId: null,
  };
  it("Gmail responde na mesma thread quando tem o id", () => {
    expect(mailAction("gmail", { ...base, threadId: "18f0" })).toEqual({
      slug: "GMAIL_REPLY_TO_THREAD",
      args: { thread_id: "18f0", recipient_email: "ana@cliente.com.br", message_body: "Segue" },
    });
    expect(mailAction("gmail", base)?.slug).toBe("GMAIL_SEND_EMAIL");
  });
  it("Outlook usa 'to' (não to_email) e responde pela mensagem", () => {
    expect(mailAction("outlook", base)).toEqual({
      slug: "OUTLOOK_SEND_EMAIL",
      args: { to: "ana@cliente.com.br", subject: "Re: Orçamento", body: "Segue" },
    });
    expect(mailAction("outlook", { ...base, messageId: "AAMk" })?.args).toEqual({
      message_id: "AAMk",
      comment: "Segue",
    });
    expect(mailAction("slack", base)).toBeNull();
  });
});
