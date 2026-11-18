-- Telefonia (Zadarma), call center e voz com IA (ElevenLabs).
-- Zadarma cuida de todas as ligações: softphone WebRTC dela, PABX (URA, filas, ramais), gravação
-- e o trunk SIP direto para a ElevenLabs. Nada disso passa pelo LiveKit nem pela VPS.

-- ───────────────────────── ramais dos vendedores ─────────────────────────
create table if not exists public.telephony_extensions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  extension text not null check (extension ~ '^[0-9]{2,6}$'),
  sip_login text,
  mobile text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (account_id, user_id),
  unique (account_id, extension)
);
alter table public.telephony_extensions enable row level security;
drop policy if exists telephony_extensions_select on public.telephony_extensions;
create policy telephony_extensions_select on public.telephony_extensions for select using (public.is_member(account_id));
drop policy if exists telephony_extensions_write on public.telephony_extensions;
create policy telephony_extensions_write on public.telephony_extensions for all using (public.is_manager(account_id)) with check (public.is_manager(account_id));

-- ───────────────────────── filas ─────────────────────────
create table if not exists public.call_queues (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  strategy text not null default 'owner_first' check (strategy in ('owner_first','round_robin','least_recent','ring_all')),
  skills text[] not null default '{}',
  business_hours jsonb not null default '{"days":[1,2,3,4,5],"start":"08:00","end":"18:00"}'::jsonb,
  overflow text not null default 'callback' check (overflow in ('voicemail','callback','ai','none')),
  overflow_agent_id uuid,
  sla_seconds int not null default 20 check (sla_seconds between 5 and 600),
  zadarma_scenario_id text,
  created_at timestamptz not null default now()
);
alter table public.call_queues enable row level security;
drop policy if exists call_queues_select on public.call_queues;
create policy call_queues_select on public.call_queues for select using (public.is_member(account_id));
drop policy if exists call_queues_write on public.call_queues;
create policy call_queues_write on public.call_queues for all using (public.is_manager(account_id)) with check (public.is_manager(account_id));

create table if not exists public.queue_members (
  queue_id uuid not null references public.call_queues(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  skills text[] not null default '{}',
  priority int not null default 1 check (priority between 1 and 10),
  is_active boolean not null default true,
  primary key (queue_id, user_id)
);
alter table public.queue_members enable row level security;
drop policy if exists queue_members_select on public.queue_members;
create policy queue_members_select on public.queue_members for select using (public.is_member(account_id));
drop policy if exists queue_members_write on public.queue_members;
create policy queue_members_write on public.queue_members for all using (public.is_manager(account_id)) with check (public.is_manager(account_id));

-- ───────────────────────── agentes de voz (ElevenLabs) ─────────────────────────
create table if not exists public.voice_agents (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  purpose text not null default 'sdr' check (purpose in ('sac','sdr','confirmation','collection','custom')),
  objective text,
  prompt text not null default '',
  first_message text,
  voice_id text,
  model_id text not null default 'eleven_v4_turbo',
  language text not null default 'pt',
  knowledge text,
  tools text[] not null default array['crm_lookup','slots','book','create_ticket','send_whatsapp']::text[],
  transfer_number text,
  phone_number_id uuid,
  elevenlabs_agent_id text,
  status text not null default 'draft' check (status in ('draft','syncing','published','error')),
  last_sync_error text,
  sync_diff jsonb not null default '[]'::jsonb,
  synced_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists voice_agents_touch on public.voice_agents;
create trigger voice_agents_touch before update on public.voice_agents for each row execute function public.touch_updated_at();
alter table public.voice_agents enable row level security;
drop policy if exists voice_agents_select on public.voice_agents;
create policy voice_agents_select on public.voice_agents for select using (public.is_member(account_id));
drop policy if exists voice_agents_write on public.voice_agents;
create policy voice_agents_write on public.voice_agents for all using (public.is_manager(account_id)) with check (public.is_manager(account_id));

-- ───────────────────────── números ─────────────────────────
create table if not exists public.phone_numbers (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  number text not null check (number ~ '^\+[1-9][0-9]{7,14}$'),
  label text,
  provider text not null default 'zadarma' check (provider in ('zadarma')),
  usage text[] not null default array['inbound','outbound']::text[],
  sip_id text,
  owner_user_id uuid references auth.users(id) on delete set null,
  queue_id uuid references public.call_queues(id) on delete set null,
  voice_agent_id uuid references public.voice_agents(id) on delete set null,
  elevenlabs_phone_id text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, number),
  check (usage <@ array['inbound','outbound','ai']::text[])
);
drop trigger if exists phone_numbers_touch on public.phone_numbers;
create trigger phone_numbers_touch before update on public.phone_numbers for each row execute function public.touch_updated_at();
alter table public.phone_numbers enable row level security;
drop policy if exists phone_numbers_select on public.phone_numbers;
create policy phone_numbers_select on public.phone_numbers for select using (public.is_member(account_id));
drop policy if exists phone_numbers_write on public.phone_numbers;
create policy phone_numbers_write on public.phone_numbers for all using (public.is_manager(account_id)) with check (public.is_manager(account_id));

do $$ begin
  alter table public.voice_agents add constraint voice_agents_phone_fk foreign key (phone_number_id) references public.phone_numbers(id) on delete set null;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.call_queues add constraint call_queues_overflow_agent_fk foreign key (overflow_agent_id) references public.voice_agents(id) on delete set null;
exception when duplicate_object then null; end $$;

-- ───────────────────────── URA ─────────────────────────
create table if not exists public.ivr_menus (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  phone_number_id uuid references public.phone_numbers(id) on delete set null,
  greeting text not null default 'Olá! Para falar com vendas, digite 1. Para suporte, digite 2.',
  tree jsonb not null default '{"options":[]}'::jsonb,
  is_active boolean not null default true,
  zadarma_ivr_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists ivr_menus_touch on public.ivr_menus;
create trigger ivr_menus_touch before update on public.ivr_menus for each row execute function public.touch_updated_at();
alter table public.ivr_menus enable row level security;
drop policy if exists ivr_menus_select on public.ivr_menus;
create policy ivr_menus_select on public.ivr_menus for select using (public.is_member(account_id));
drop policy if exists ivr_menus_write on public.ivr_menus;
create policy ivr_menus_write on public.ivr_menus for all using (public.is_manager(account_id)) with check (public.is_manager(account_id));

-- ───────────────────────── campanhas de voz ─────────────────────────
create table if not exists public.voice_campaigns (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  voice_agent_id uuid references public.voice_agents(id) on delete set null,
  phone_number_id uuid references public.phone_numbers(id) on delete set null,
  segment_id uuid references public.segments(id) on delete set null,
  status text not null default 'draft' check (status in ('draft','scheduled','running','paused','completed','canceled')),
  window_start time not null default '09:00',
  window_end time not null default '18:00',
  days int[] not null default array[1,2,3,4,5],
  timezone text not null default 'America/Sao_Paulo',
  max_concurrency int not null default 3 check (max_concurrency between 1 and 50),
  max_attempts int not null default 2 check (max_attempts between 1 and 5),
  retry_minutes int not null default 120 check (retry_minutes between 15 and 4320),
  starts_at timestamptz,
  use_batch boolean not null default false,
  el_batch_id text,
  context jsonb not null default '{}'::jsonb,
  stats jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists voice_campaigns_touch on public.voice_campaigns;
create trigger voice_campaigns_touch before update on public.voice_campaigns for each row execute function public.touch_updated_at();
alter table public.voice_campaigns enable row level security;
drop policy if exists voice_campaigns_select on public.voice_campaigns;
create policy voice_campaigns_select on public.voice_campaigns for select using (public.is_member(account_id));
drop policy if exists voice_campaigns_write on public.voice_campaigns;
create policy voice_campaigns_write on public.voice_campaigns for all using (public.is_manager(account_id)) with check (public.is_manager(account_id));

create table if not exists public.voice_campaign_targets (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  campaign_id uuid not null references public.voice_campaigns(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  phone text not null,
  status text not null default 'pending' check (status in ('pending','calling','done','failed','skipped','dnc')),
  attempts int not null default 0,
  last_attempt_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  call_id uuid,
  result text,
  created_at timestamptz not null default now(),
  unique (campaign_id, contact_id)
);
create index if not exists voice_campaign_targets_due on public.voice_campaign_targets (campaign_id, next_attempt_at) where status = 'pending';
alter table public.voice_campaign_targets enable row level security;
drop policy if exists voice_campaign_targets_select on public.voice_campaign_targets;
create policy voice_campaign_targets_select on public.voice_campaign_targets for select using (public.is_member(account_id));
drop policy if exists voice_campaign_targets_write on public.voice_campaign_targets;
create policy voice_campaign_targets_write on public.voice_campaign_targets for all using (public.is_manager(account_id)) with check (public.is_manager(account_id));

-- ───────────────────────── ligações ─────────────────────────
create table if not exists public.calls (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  direction text not null check (direction in ('inbound','outbound')),
  from_number text,
  to_number text,
  contact_id uuid references public.contacts(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  voice_agent_id uuid references public.voice_agents(id) on delete set null,
  queue_id uuid references public.call_queues(id) on delete set null,
  phone_number_id uuid references public.phone_numbers(id) on delete set null,
  campaign_id uuid references public.voice_campaigns(id) on delete set null,
  status text not null default 'ringing' check (status in ('ringing','in_progress','completed','missed','no_answer','busy','failed','voicemail','canceled')),
  started_at timestamptz not null default now(),
  answered_at timestamptz,
  ended_at timestamptz,
  duration_seconds int,
  billseconds int,
  disposition text,
  disposition_reason text,
  hangup_cause text,
  pbx_call_id text,
  el_conversation_id text,
  recording_path text,
  recording_status text not null default 'none' check (recording_status in ('none','pending','stored','failed','expired')),
  transcript text,
  transcript_segments jsonb not null default '[]'::jsonb,
  summary text,
  sentiment text check (sentiment is null or sentiment in ('positive','neutral','negative')),
  score int check (score is null or score between 0 and 100),
  scorecard jsonb,
  data_collection jsonb,
  cost_usd numeric(10,4),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists calls_account_created on public.calls (account_id, created_at desc);
create index if not exists calls_contact on public.calls (contact_id, created_at desc) where contact_id is not null;
create unique index if not exists calls_pbx on public.calls (account_id, pbx_call_id) where pbx_call_id is not null;
create unique index if not exists calls_el_conversation on public.calls (el_conversation_id) where el_conversation_id is not null;
create index if not exists calls_short_outbound on public.calls (account_id, to_number, started_at) where direction = 'outbound';
drop trigger if exists calls_touch on public.calls;
create trigger calls_touch before update on public.calls for each row execute function public.touch_updated_at();
alter table public.calls enable row level security;
drop policy if exists calls_select on public.calls;
create policy calls_select on public.calls for select using (
  public.is_member(account_id) and (
    not public.has_role(account_id, array['seller']::public.app_role[])
    or user_id = auth.uid()
    or exists (select 1 from public.contacts c where c.id = calls.contact_id and (c.owner_user_id is null or c.owner_user_id = auth.uid()))
  )
);
drop policy if exists calls_update on public.calls;
create policy calls_update on public.calls for update
  using (public.is_member(account_id) and (public.is_manager(account_id) or user_id = auth.uid()))
  with check (public.is_member(account_id));
do $$ begin
  alter publication supabase_realtime add table public.calls;
exception when duplicate_object then null; when undefined_object then null; end $$;

do $$ begin
  alter table public.voice_campaign_targets add constraint voice_campaign_targets_call_fk foreign key (call_id) references public.calls(id) on delete set null;
exception when duplicate_object then null; end $$;

-- ───────────────────────── discador (preview / power / progressive) ─────────────────────────
create table if not exists public.dialer_sessions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null default 'preview' check (mode in ('preview','power','progressive')),
  name text,
  segment_id uuid references public.segments(id) on delete set null,
  contact_ids uuid[] not null default '{}',
  position int not null default 0,
  status text not null default 'active' check (status in ('active','paused','finished')),
  stats jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists dialer_sessions_touch on public.dialer_sessions;
create trigger dialer_sessions_touch before update on public.dialer_sessions for each row execute function public.touch_updated_at();
alter table public.dialer_sessions enable row level security;
drop policy if exists dialer_sessions_own on public.dialer_sessions;
create policy dialer_sessions_own on public.dialer_sessions for all
  using (public.is_member(account_id) and (user_id = auth.uid() or public.is_manager(account_id)))
  with check (public.is_member(account_id) and user_id = auth.uid());

-- ───────────────────────── gravações (bucket privado; acesso só por URL assinada) ─────────────────────────
insert into storage.buckets (id, name, public) values ('call-recordings', 'call-recordings', false)
on conflict (id) do nothing;

-- ───────────────────────── painel ao vivo da fila ─────────────────────────
create or replace function public.call_center_stats(_account uuid)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare _tz text; _start timestamptz; _sla int;
begin
  if not public.is_member(_account) then raise exception 'forbidden' using errcode = '42501'; end if;
  select timezone into _tz from public.accounts where id = _account;
  _start := (date_trunc('day', now() at time zone coalesce(_tz, 'America/Sao_Paulo'))) at time zone coalesce(_tz, 'America/Sao_Paulo');
  select coalesce(min(sla_seconds), 20) into _sla from public.call_queues where account_id = _account;
  return (
    with today as (select * from public.calls where account_id = _account and started_at >= _start),
    inbound as (select * from today where direction = 'inbound' and voice_agent_id is null)
    select jsonb_build_object(
      'waiting', (select count(*) from public.calls where account_id = _account and direction = 'inbound' and status = 'ringing' and started_at > now() - interval '15 minutes'),
      'in_progress', (select count(*) from public.calls where account_id = _account and status = 'in_progress' and started_at > now() - interval '3 hours'),
      'today_total', (select count(*) from today),
      'today_inbound', (select count(*) from inbound),
      'today_outbound', (select count(*) from today where direction = 'outbound'),
      'today_ai', (select count(*) from today where voice_agent_id is not null),
      'answered', (select count(*) from inbound where answered_at is not null),
      'abandoned', (select count(*) from inbound where answered_at is null and status in ('missed','no_answer','canceled')),
      'avg_wait_seconds', (select coalesce(round(avg(extract(epoch from answered_at - started_at))), 0) from inbound where answered_at is not null),
      'avg_talk_seconds', (select coalesce(round(avg(coalesce(billseconds, duration_seconds))), 0) from today where answered_at is not null),
      'service_level', (select case when count(*) = 0 then null else round(100.0 * count(*) filter (where answered_at is not null and answered_at - started_at <= make_interval(secs => _sla)) / count(*)) end from inbound),
      'sla_seconds', _sla
    )
  );
end $$;
grant execute on function public.call_center_stats(uuid) to authenticated;

-- ───────────────────────── linha do tempo: ligações ─────────────────────────
create or replace function public.timeline_part_calls(_contact uuid)
returns table (kind text, ref_id uuid, at timestamptz, title text, body text, meta jsonb)
language sql stable security invoker set search_path = public as $$
  select 'call'::text, c.id, c.started_at,
         case when c.voice_agent_id is not null then 'Ligação da IA de voz'
              when c.direction = 'inbound' then 'Ligação recebida' else 'Ligação feita' end
           || case when c.answered_at is null and c.status <> 'in_progress' then ' (não atendida)' else '' end,
         coalesce(c.summary, c.disposition_reason),
         jsonb_build_object('direction', c.direction, 'status', c.status, 'duration_seconds', coalesce(c.billseconds, c.duration_seconds),
                            'has_recording', c.recording_status = 'stored', 'sentiment', c.sentiment, 'score', c.score, 'user_id', c.user_id)
    from public.calls c
   where c.contact_id = _contact;
$$;
grant execute on function public.timeline_part_calls(uuid) to authenticated;
