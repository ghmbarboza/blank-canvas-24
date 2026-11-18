-- Reuniões: o cliente confirma, remarca ou cancela pelo link do convite; briefing da IA antes da reunião.
-- Aditiva: só colunas novas e o check de tipos de envio ampliado.
alter table public.meetings
  add column if not exists guest_confirmed_at timestamptz,
  add column if not exists briefing jsonb,
  add column if not exists briefing_at timestamptz,
  add column if not exists reschedule_count integer not null default 0,
  add column if not exists canceled_by text,
  add column if not exists cancel_reason text;

alter table public.meetings drop constraint if exists meetings_canceled_by_check;
alter table public.meetings
  add constraint meetings_canceled_by_check
  check (canceled_by is null or canceled_by in ('contact', 'team'));

alter table public.meetings drop constraint if exists meetings_cancel_reason_check;
alter table public.meetings
  add constraint meetings_cancel_reason_check
  check (cancel_reason is null or length(cancel_reason) <= 500);

alter table public.meeting_invites drop constraint if exists meeting_invites_kind_check;
alter table public.meeting_invites
  add constraint meeting_invites_kind_check
  check (kind = any (array['invite', 'reminder_24h', 'reminder_1h', 'canceled', 'rescheduled', 'no_show']));

comment on column public.meetings.guest_confirmed_at is 'Quando o contato tocou em "Confirmo presença" no lembrete.';
comment on column public.meetings.briefing is 'Briefing da IA gerado 30 min antes (contexto, pontos, perguntas).';
