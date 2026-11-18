// Chaves de query da caixa de entrada. Todas começam pelo domínio e carregam o accountId.
export const inboxKeys = {
  all: (accountId: string) => ["inbox", accountId] as const,
  conversations: (accountId: string) => ["inbox", accountId, "conversations"] as const,
  conversation: (accountId: string, id: string) =>
    ["inbox", accountId, "conversation", id] as const,
  messages: (accountId: string, id: string) => ["inbox", accountId, "messages", id] as const,
  messageSearch: (accountId: string, q: string) =>
    ["inbox", accountId, "message-search", q] as const,
  channels: (accountId: string) => ["inbox", accountId, "channels"] as const,
  members: (accountId: string) => ["inbox", accountId, "members"] as const,
  contact: (accountId: string, contactId: string) => ["contacts", accountId, contactId] as const,
  identities: (accountId: string, contactId: string) =>
    ["contacts", accountId, contactId, "identities"] as const,
  contactDeals: (accountId: string, contactId: string) =>
    ["deals", accountId, "contact", contactId] as const,
  recentHistory: (accountId: string, contactId: string) =>
    ["contacts", accountId, contactId, "recent-history"] as const,
  contactEvents: (accountId: string, contactId: string) =>
    ["events", accountId, "contact", contactId] as const,
};
