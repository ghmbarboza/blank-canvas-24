-- Fase "Agenda e reuniões + Livecoach": links públicos de agendamento, Meet próprio (LiveKit),
-- transcrição, dicas do coach, playbooks cadastráveis, rubricas e conexões de agenda.

-- ───────────────────────── limite de taxa (rotas públicas) ─────────────────────────
create table if not exists public.rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  hits int not null default 0
);
alter table public.rate_limits enable row level security;

-- true = pode seguir; false = estourou o limite na janela.
create or replace function public.hit_rate_limit(_key text, _max int, _window_seconds int)
returns boolean language plpgsql security definer set search_path = public as $$
declare _r public.rate_limits;
begin
  insert into public.rate_limits (key, window_start, hits) values (_key, now(), 1)
  on conflict (key) do update set
    hits = case when public.rate_limits.window_start < now() - make_interval(secs => _window_seconds) then 1 else public.rate_limits.hits + 1 end,
    window_start = case when public.rate_limits.window_start < now() - make_interval(secs => _window_seconds) then now() else public.rate_limits.window_start end
  returning * into _r;
  return _r.hits <= _max;
end $$;
revoke all on function public.hit_rate_limit(text, int, int) from public, anon, authenticated;
grant execute on function public.hit_rate_limit(text, int, int) to service_role;

-- ───────────────────────── playbooks e rubricas ─────────────────────────
create table if not exists public.playbooks (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  description text,
  pipeline_id uuid references public.pipelines(id) on delete set null,
  stage_id uuid references public.pipeline_stages(id) on delete set null,
  framework text not null default 'BANT' check (framework in ('BANT','MEDDIC','SPIN','GPCT','custom')),
  phases jsonb not null default '[]'::jsonb,          -- [{id, name, items:[{id,label,required,keywords[]}]}]
  questions jsonb not null default '[]'::jsonb,       -- [{id, label, field}]  (perguntas de qualificação)
  objections jsonb not null default '[]'::jsonb,      -- [{id, label, triggers[], answer, proof}]
  competitors jsonb not null default '[]'::jsonb,     -- [{id, name, triggers[], arguments[]}]
  closing_signals jsonb not null default '[]'::jsonb, -- [{id, label, triggers[], proposal}]
  forbidden_phrases jsonb not null default '[]'::jsonb, -- ["garanto resultado", ...]
  scorecard_id uuid,
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists playbooks_account on public.playbooks (account_id, is_active);
drop trigger if exists playbooks_touch on public.playbooks;
create trigger playbooks_touch before update on public.playbooks for each row execute function public.touch_updated_at();
alter table public.playbooks enable row level security;
drop policy if exists playbooks_select on public.playbooks;
create policy playbooks_select on public.playbooks for select using (public.is_member(account_id));
drop policy if exists playbooks_write on public.playbooks;
create policy playbooks_write on public.playbooks for all using (public.is_manager(account_id)) with check (public.is_manager(account_id));

create table if not exists public.scorecard_templates (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  criteria jsonb not null default '[]'::jsonb, -- [{id, label, description, weight}]
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists scorecard_templates_touch on public.scorecard_templates;
create trigger scorecard_templates_touch before update on public.scorecard_templates for each row execute function public.touch_updated_at();
alter table public.scorecard_templates enable row level security;
drop policy if exists scorecard_select on public.scorecard_templates;
create policy scorecard_select on public.scorecard_templates for select using (public.is_member(account_id));
drop policy if exists scorecard_write on public.scorecard_templates;
create policy scorecard_write on public.scorecard_templates for all using (public.is_manager(account_id)) with check (public.is_manager(account_id));
do $$ begin
  alter table public.playbooks add constraint playbooks_scorecard_fk foreign key (scorecard_id) references public.scorecard_templates(id) on delete set null;
exception when duplicate_object then null; end $$;

-- ───────────────────────── páginas públicas de agendamento ─────────────────────────
create table if not exists public.booking_pages (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,59}$'),
  title text not null check (length(trim(title)) between 1 and 120),
  description text,
  duration_min int not null default 30 check (duration_min between 10 and 240),
  buffer_min int not null default 10 check (buffer_min between 0 and 120),
  step_min int not null default 30 check (step_min in (10, 15, 20, 30, 45, 60)),
  min_notice_min int not null default 120 check (min_notice_min between 0 and 20160),
  window_days int not null default 21 check (window_days between 1 and 120),
  -- {"1":[{"start":"09:00","end":"12:00"},...], ... "0" = domingo}
  availability jsonb not null default '{"1":[{"start":"09:00","end":"18:00"}],"2":[{"start":"09:00","end":"18:00"}],"3":[{"start":"09:00","end":"18:00"}],"4":[{"start":"09:00","end":"18:00"}],"5":[{"start":"09:00","end":"18:00"}]}'::jsonb,
  mode text not null default 'owner' check (mode in ('owner','round_robin')),
  owner_user_id uuid references auth.users(id) on delete set null,
  members jsonb not null default '[]'::jsonb, -- round-robin: [{user_id, weight}]
  questions jsonb not null default '[]'::jsonb, -- [{id, label, type:text|long_text|select, required, options[]}]
  location text not null default 'nexus_meet' check (location in ('nexus_meet','phone','in_person','custom')),
  location_detail text,
  playbook_id uuid references public.playbooks(id) on delete set null,
  create_deal boolean not null default false,
  confirmation_message text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists booking_pages_account on public.booking_pages (account_id);
drop trigger if exists booking_pages_touch on public.booking_pages;
create trigger booking_pages_touch before update on public.booking_pages for each row execute function public.touch_updated_at();
alter table public.booking_pages enable row level security;
drop policy if exists booking_pages_select on public.booking_pages;
create policy booking_pages_select on public.booking_pages for select using (public.is_member(account_id));
drop policy if exists booking_pages_insert on public.booking_pages;
create policy booking_pages_insert on public.booking_pages for insert with check (
  public.is_member(account_id) and (public.is_manager(account_id) or owner_user_id = auth.uid())
);
drop policy if exists booking_pages_update on public.booking_pages;
create policy booking_pages_update on public.booking_pages for update
  using (public.is_manager(account_id) or (public.is_member(account_id) and owner_user_id = auth.uid()))
  with check (public.is_member(account_id));
drop policy if exists booking_pages_delete on public.booking_pages;
create policy booking_pages_delete on public.booking_pages for delete
  using (public.is_manager(account_id) or (public.is_member(account_id) and owner_user_id = auth.uid()));

-- ───────────────────────── reuniões (Meet próprio) ─────────────────────────
create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  event_id uuid references public.events(id) on delete set null,
  booking_page_id uuid references public.booking_pages(id) on delete set null,
  room_name text not null unique,
  title text not null default 'Reunião',
  host_user_id uuid references auth.users(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  deal_id uuid references public.deals(id) on delete set null,
  playbook_id uuid references public.playbooks(id) on delete set null,
  status text not null default 'scheduled' check (status in ('scheduled','live','ended','canceled','no_show')),
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  require_admit boolean not null default false,
  record boolean not null default true,
  recording_url text,
  egress_id text,
  minutes jsonb,   -- {summary, decisions[], objections[], next_steps[{title, owner, due}], bant{}, risks[], follow_up}
  score jsonb,     -- {total, criteria:[{id,label,score,evidence}]}
  booking_answers jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists meetings_account on public.meetings (account_id, scheduled_start desc);
create index if not exists meetings_contact on public.meetings (contact_id) where contact_id is not null;
create index if not exists meetings_event on public.meetings (event_id) where event_id is not null;
drop trigger if exists meetings_touch on public.meetings;
create trigger meetings_touch before update on public.meetings for each row execute function public.touch_updated_at();

create or replace function public.can_see_meeting(_meeting uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.meetings m
    where m.id = _meeting and public.is_member(m.account_id)
      and (not public.has_role(m.account_id, array['seller']::public.app_role[])
           or m.host_user_id = auth.uid() or m.host_user_id is null)
  );
$$;
grant execute on function public.can_see_meeting(uuid) to authenticated;

alter table public.meetings enable row level security;
drop policy if exists meetings_select on public.meetings;
create policy meetings_select on public.meetings for select using (public.can_see_meeting(id));
drop policy if exists meetings_insert on public.meetings;
create policy meetings_insert on public.meetings for insert with check (public.is_member(account_id) and (host_user_id = auth.uid() or public.is_manager(account_id)));
drop policy if exists meetings_update on public.meetings;
create policy meetings_update on public.meetings for update
  using (public.is_member(account_id) and (host_user_id = auth.uid() or public.is_manager(account_id)))
  with check (public.is_member(account_id));
drop policy if exists meetings_delete on public.meetings;
create policy meetings_delete on public.meetings for delete using (public.is_manager(account_id));

create table if not exists public.meeting_participants (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  kind text not null check (kind in ('host','member','contact','guest')),
  user_id uuid references auth.users(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  name text,
  email text,
  identity text not null,
  token_hash text unique,
  token_expires_at timestamptz,
  admitted boolean not null default true,
  joined_at timestamptz,
  left_at timestamptz,
  created_at timestamptz not null default now(),
  unique (meeting_id, identity)
);
alter table public.meeting_participants enable row level security;
drop policy if exists meeting_participants_select on public.meeting_participants;
create policy meeting_participants_select on public.meeting_participants for select using (public.can_see_meeting(meeting_id));

create table if not exists public.meeting_transcripts (
  id bigserial primary key,
  account_id uuid not null references public.accounts(id) on delete cascade,
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  participant_identity text,
  speaker_label text,
  is_seller boolean not null default false,
  text text not null,
  start_ms int,
  end_ms int,
  created_at timestamptz not null default now()
);
create index if not exists meeting_transcripts_meeting on public.meeting_transcripts (meeting_id, id);
alter table public.meeting_transcripts enable row level security;
drop policy if exists meeting_transcripts_select on public.meeting_transcripts;
create policy meeting_transcripts_select on public.meeting_transcripts for select using (public.can_see_meeting(meeting_id));

create table if not exists public.meeting_invites (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  channel text not null check (channel in ('email','whatsapp','sms')),
  kind text not null default 'invite' check (kind in ('invite','reminder_24h','reminder_1h','canceled')),
  address text,
  status text not null default 'queued' check (status in ('queued','sent','failed','skipped')),
  job_id uuid,
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists meeting_invites_meeting on public.meeting_invites (meeting_id);
alter table public.meeting_invites enable row level security;
drop policy if exists meeting_invites_select on public.meeting_invites;
create policy meeting_invites_select on public.meeting_invites for select using (public.can_see_meeting(meeting_id));

create table if not exists public.coach_tips (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  kind text not null check (kind in ('checklist','objection','battlecard','closing','compliance','pace','question')),
  title text not null,
  body text,
  playbook_item text,
  source text not null default 'keyword' check (source in ('keyword','llm')),
  dismissed boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists coach_tips_meeting on public.coach_tips (meeting_id, created_at);
alter table public.coach_tips enable row level security;
-- Dica é do vendedor que conduz a reunião (e dos gestores, para revisão). O convidado nunca vê.
drop policy if exists coach_tips_select on public.coach_tips;
create policy coach_tips_select on public.coach_tips for select using (
  exists (select 1 from public.meetings m where m.id = meeting_id
          and (m.host_user_id = auth.uid() or public.is_manager(m.account_id)) and public.is_member(m.account_id))
);
drop policy if exists coach_tips_update on public.coach_tips;
create policy coach_tips_update on public.coach_tips for update using (
  exists (select 1 from public.meetings m where m.id = meeting_id and m.host_user_id = auth.uid())
) with check (
  exists (select 1 from public.meetings m where m.id = meeting_id and m.host_user_id = auth.uid())
);

do $$ begin
  alter publication supabase_realtime add table public.coach_tips;
exception when duplicate_object then null; when undefined_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.meeting_transcripts;
exception when duplicate_object then null; when undefined_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.meeting_participants;
exception when duplicate_object then null; when undefined_object then null; end $$;

-- ───────────────────────── conexões de agenda (Google/Outlook) ─────────────────────────
create table if not exists public.calendar_connections (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('google','microsoft')),
  email text,
  status text not null default 'pending' check (status in ('pending','connected','error','revoked')),
  scopes text[] not null default '{}',
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (account_id, user_id, provider)
);
alter table public.calendar_connections enable row level security;
drop policy if exists calendar_connections_select on public.calendar_connections;
create policy calendar_connections_select on public.calendar_connections for select using (user_id = auth.uid() or public.is_manager(account_id));
drop policy if exists calendar_connections_delete on public.calendar_connections;
create policy calendar_connections_delete on public.calendar_connections for delete using (user_id = auth.uid());

-- ───────────────────────── segredo do agente (worker do livecoach) ─────────────────────────
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'platform:agent_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'platform:agent_secret');
  end if;
end $$;

create or replace function public.agent_secret() returns text
language sql stable security definer set search_path = public, vault as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'platform:agent_secret';
$$;
revoke all on function public.agent_secret() from public, anon, authenticated;
grant execute on function public.agent_secret() to service_role;

-- ───────────────────────── linha do tempo: reuniões ─────────────────────────
create or replace function public.timeline_part_meetings(_contact uuid)
returns table (kind text, ref_id uuid, at timestamptz, title text, body text, meta jsonb)
language sql stable security invoker set search_path = public as $$
  select 'meeting'::text, m.id, coalesce(m.started_at, m.scheduled_start, m.created_at),
         case m.status when 'ended' then 'Reunião realizada: ' when 'canceled' then 'Reunião cancelada: '
                       when 'no_show' then 'Não compareceu: ' when 'live' then 'Em reunião agora: ' else 'Reunião marcada: ' end || m.title,
         m.minutes->>'summary',
         jsonb_build_object('status', m.status, 'meeting_id', m.id,
           'duration_seconds', case when m.started_at is not null and m.ended_at is not null then extract(epoch from m.ended_at - m.started_at)::int end,
           'score', m.score->'total', 'recording', m.recording_url is not null)
  from public.meetings m where m.contact_id = _contact;
$$;
grant execute on function public.timeline_part_meetings(uuid) to authenticated;
