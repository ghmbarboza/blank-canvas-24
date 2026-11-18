import type { Tables } from "@/integrations/supabase/types";

export type Conversation = Tables<"conversations">;
export type Message = Tables<"messages">;
/** Canal como o cliente enxerga: o webhook_token é segredo e só o servidor lê (S7, 04/11). */
export type Channel = Omit<Tables<"channels">, "webhook_token">;
/** Colunas que o cliente pode ler de channels (o banco recusa select("*") por causa do token). */
export const CHANNEL_CLIENT_COLUMNS =
  "id, account_id, provider, platform, name, external_id, handle, status, status_detail, config, owner_user_id, is_shared, ai_enabled, last_event_at, created_at, updated_at";
export type Contact = Tables<"contacts">;
export type ContactIdentity = Tables<"contact_identities">;
export type Deal = Tables<"deals">;
export type PipelineStage = Tables<"pipeline_stages">;
export type CalendarEvent = Tables<"events">;

export type ConversationStatus = "open" | "pending" | "snoozed" | "closed";

export const STATUS_LABEL: Record<ConversationStatus, string> = {
  open: "Abertas",
  pending: "Pendentes",
  snoozed: "Adiadas",
  closed: "Resolvidas",
};

export const STATUS_ORDER: ConversationStatus[] = ["open", "pending", "snoozed", "closed"];

// O pedaço do contato que a lista precisa (nome, avatar, temperatura).
export type ContactSummary = Pick<
  Contact,
  "id" | "name" | "avatar_url" | "score" | "temperature" | "phone"
>;

export interface InboxItem {
  conversation: Conversation;
  contact: ContactSummary | null;
}

export interface Member {
  userId: string;
  name: string;
  avatarUrl: string | null;
}

// Mensagem na tela: a do banco ou a otimista (ainda sem id real).
export interface ThreadMessage extends Message {
  optimistic?: boolean;
}

// Recorte por dono: todas, as minhas, as sem responsável e as que a IA está atendendo.
export type InboxScope = "all" | "mine" | "unassigned" | "ai";

export const SCOPE_LABEL: Record<InboxScope, string> = {
  all: "Todas",
  mine: "Minhas",
  unassigned: "Sem dono",
  ai: "IA atendendo",
};

export const SCOPE_ORDER: InboxScope[] = ["all", "mine", "unassigned", "ai"];

export interface InboxFilters {
  status: ConversationStatus;
  scope: InboxScope;
  unread: boolean;
  platform: string | null;
  search: string;
  /** etiqueta da conversa (#64) */
  tag: string | null;
}

export interface DealWithStages {
  deal: Deal;
  stages: PipelineStage[];
}
