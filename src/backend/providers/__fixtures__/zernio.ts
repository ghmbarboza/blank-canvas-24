// Payloads fiéis à documentação oficial da Zernio (docs.zernio.com, lida em 26/10/2026):
// webhooks/inbox (message.received/sent/failed), webhooks/calls (call.*), webhooks/phone-numbers
// e o catálogo público GET /v1/phone-numbers/countries (resposta real do BR em 26/10/2026).
// Ids e telefones são fictícios; a forma e os nomes de campo são os da documentação.
import type { ZernioEvent } from "../zernio-normalize";

const account = {
  id: "66b2e19d8c3f5a7e9d0b1c2d",
  accountId: "66b2e19d8c3f5a7e9d0b1c2d",
  profileId: "66a1f0c2a4b9d3e8f1a2b3c4",
  platform: "whatsapp",
  username: "+5511930000000",
  displayName: "Loja Exemplo",
};

/** WhatsApp com telefone e BSUID (rollout da Meta desde abril de 2026). */
export const waReceivedWithPhone: ZernioEvent = {
  id: "evt_5f8e2a1c",
  event: "message.received",
  message: {
    id: "66d4a1b2c3e4f5a6b7c8d9e1",
    conversationId: "66c3d2ae7b4f6c8d0e1f2a3b",
    platform: "whatsapp",
    platformMessageId: "wamid.HBgLNTUxMTk5OTk5MDAwMBUCABIYFjNFQjA",
    direction: "incoming",
    text: "Oi, ainda tem o plano anual?",
    attachments: [],
    sender: {
      id: "5511999990000",
      name: "Ana Souza",
      phoneNumber: "+5511999990000",
      businessScopedUserId: "BR.1234567890123456",
    },
    sentAt: "2026-10-26T14:03:11Z",
  },
  conversation: { id: "66c3d2ae7b4f6c8d0e1f2a3b", status: "active" },
  account,
  timestamp: "2026-10-26T14:03:12.104Z",
};

/** Usuário com nome de usuário do WhatsApp: a Meta não manda o telefone (#19). */
export const waReceivedUsernameOnly: ZernioEvent = {
  id: "evt_7a1b2c3d",
  event: "message.received",
  message: {
    id: "66d4a1b2c3e4f5a6b7c8d9e2",
    conversationId: "66c3d2ae7b4f6c8d0e1f2a3c",
    platform: "whatsapp",
    platformMessageId: "wamid.HBgLNTUxMTk5OTk5MDAwMRUCABIYFjNFQjE",
    direction: "incoming",
    text: null,
    attachments: [
      {
        type: "audio",
        url: "https://zernio.com/api/v1/whatsapp/media/1234567890?accountId=66b2e19d8c3f5a7e9d0b1c2d",
        mimeType: "audio/ogg",
        payload: { voice: true },
      },
    ],
    sender: {
      id: "BR.9876543210987654",
      name: "jane.shop",
      phoneNumber: null,
      businessScopedUserId: "BR.9876543210987654",
      whatsappUsername: "jane.shop",
    },
    sentAt: "2026-10-26T14:05:00Z",
  },
  conversation: { id: "66c3d2ae7b4f6c8d0e1f2a3c", status: "active" },
  account,
  timestamp: "2026-10-26T14:05:01.000Z",
};

export const igReceived: ZernioEvent = {
  id: "evt_5f8e2a1d",
  event: "message.received",
  message: {
    id: "66d4a1b2c3e4f5a6b7c8d9e3",
    conversationId: "66c3d2ae7b4f6c8d0e1f2a3d",
    platform: "instagram",
    platformMessageId: "aWdfZAG06MTpJR01lc3NhZA2VJZA",
    direction: "incoming",
    text: "Hi, is this still available?",
    attachments: [],
    sender: { id: "17841400000000000", name: "Jane", username: "jane_doe" },
    sentAt: "2026-10-26T14:06:00.123Z",
  },
  conversation: { id: "66c3d2ae7b4f6c8d0e1f2a3d", status: "active" },
  account: {
    id: "66b2e19d8c3f5a7e9d0b1c2e",
    accountId: "66b2e19d8c3f5a7e9d0b1c2e",
    platform: "instagram",
    username: "loja",
  },
};

export const waFailed: ZernioEvent = {
  id: "evt_fail_1",
  event: "message.failed",
  message: {
    id: "66d4a1b2c3e4f5a6b7c8d9e4",
    conversationId: "66c3d2ae7b4f6c8d0e1f2a3b",
    platform: "whatsapp",
    platformMessageId: "wamid.OUT1",
    direction: "outgoing",
  },
  error: { code: 131026, title: "Message undeliverable", message: "Recipient is not reachable" },
  conversation: { id: "66c3d2ae7b4f6c8d0e1f2a3b" },
  account,
};

export const callReceivedWhatsApp: ZernioEvent = {
  id: "evt_call_1",
  event: "call.received",
  call: {
    id: "66f8e5f6a7b8c9d0e1f2a3b5",
    metaCallId: "wacid.ABGGFlCGg0cvAgo-sJQh43L5Pe4W",
    accountId: account.accountId,
    phoneNumberId: "1875844705851813",
    direction: "inbound",
    from: "5511999990000",
    to: "+5511930000000",
    forwardTo: "sip:+5511930000000@sip.rtc.elevenlabs.io:5061;transport=tls",
    contactId: "66e1f2a3b4c5d6e7f8a9b0c1",
    conversationId: "66c3d2ae7b4f6c8d0e1f2a3b",
    startedAt: "2026-10-26T15:00:00Z",
  },
  account,
};

export const callEndedAnswered: ZernioEvent = {
  id: "evt_call_2",
  event: "call.ended",
  call: {
    id: "66f8e5f6a7b8c9d0e1f2a3b5",
    metaCallId: "wacid.ABGGFlCGg0cvAgo-sJQh43L5Pe4W",
    accountId: account.accountId,
    phoneNumberId: "1875844705851813",
    direction: "inbound",
    from: "5511999990000",
    to: "+5511930000000",
    startedAt: "2026-10-26T15:00:00Z",
    endedAt: "2026-10-26T15:04:12Z",
    durationSeconds: 252,
    endReason: "hangup",
    hangupCause: "normal_clearing",
    sipHangupCause: null,
    isVoicemail: false,
    recordingUrl: "https://recordings.example.com/66f8e5f6.mp3?token=abc",
    recordingExpiresAt: "2026-10-26T15:14:12Z",
    billing: {
      metaCostUSD: 0,
      telnyxCostUSD: 0.0336,
      recordingCostUSD: 0.001,
      billableCostUSD: 0.0672,
      totalCostUSD: 0.0672,
    },
  },
  account,
};

export const callEndedBusyOutbound: ZernioEvent = {
  id: "evt_call_3",
  event: "call.ended",
  call: {
    id: "66e5f6a7b8c9d0e1f2a3b4c5",
    accountId: account.accountId,
    direction: "outbound",
    from: "+5511930000000",
    to: "+5521988887777",
    startedAt: "2026-10-26T16:00:00Z",
    endedAt: "2026-10-26T16:00:09Z",
    durationSeconds: 0,
    endReason: "rejected",
    sipHangupCause: "486",
    billing: { telnyxCostUSD: 0, billableCostUSD: 0, metaCostUSD: 0 },
  },
  account: { ...account, platform: "whatsapp" },
};

export const callFailed: ZernioEvent = {
  id: "evt_call_4",
  event: "call.failed",
  call: {
    id: "66e5f6a7b8c9d0e1f2a3b4c6",
    accountId: account.accountId,
    direction: "inbound",
    from: "+5521988887777",
    to: "+5511930000000",
    failedAt: "2026-10-26T16:10:00Z",
    error: { code: 403, message: "Destination rejected the SIP INVITE" },
  },
  account,
};

export const permissionAccepted: ZernioEvent = {
  id: "evt_perm_1",
  event: "call.permission_request",
  permission: {
    from: "5511999990000",
    response: "accept",
    isPermanent: false,
    expirationTimestamp: "2026-11-02T15:00:00Z",
  },
  account,
};

export const numberKycSubmitted: ZernioEvent = {
  id: "evt_num_1",
  event: "whatsapp.number.kyc_submitted",
  number: {
    id: "66d4e5f6a7b8c9d0e1f2a3b4",
    phoneNumber: null,
    country: "BR",
    profileId: account.profileId,
  },
  timestamp: "2026-10-26T17:00:00Z",
};

export const numberActivated: ZernioEvent = {
  id: "evt_num_2",
  event: "whatsapp.number.activated",
  number: {
    id: "66d4e5f6a7b8c9d0e1f2a3b4",
    phoneNumber: "+551130030000",
    country: "BR",
    profileId: account.profileId,
  },
};

export const numberSuspended: ZernioEvent = {
  id: "evt_num_3",
  event: "whatsapp.number.suspended",
  number: { id: "66d4e5f6a7b8c9d0e1f2a3b4", phoneNumber: "+551130030000", country: "BR" },
  reason: "payment_failed",
};

/** Resposta real do catálogo público para o Brasil (GET /v1/phone-numbers/countries, 26/10/2026). */
export const brazilCatalog = {
  code: "BR",
  name: "Brazil",
  tier: 4,
  monthlyCents: 500,
  needsKyc: true,
  outboundCallingAvailable: true,
  callsAvailable: true,
  whatsappAvailable: true,
  smsAvailable: false,
  types: [
    {
      numberType: "local",
      tier: 4,
      needsKyc: true,
      monthlyCents: 500,
      whatsappAvailable: true,
      smsAvailable: false,
      callsAvailable: true,
      fulfilment: "instant",
      inStock: true,
      preOrderable: false,
    },
    {
      numberType: "mobile",
      fulfilment: "request",
      tier: null,
      needsKyc: true,
      monthlyCents: 800,
      whatsappAvailable: true,
      smsAvailable: true,
      callsAvailable: true,
      inStock: false,
      preOrderable: true,
    },
  ],
  inStock: true,
  preOrderable: true,
};
