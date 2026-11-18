-- Frente C (CRM): participantes do negócio, sugestão de forecast vinda da ata, sala do negócio e
-- linha do tempo da empresa. Tudo aditivo; leituras são security invoker (a RLS de cada tabela vale).

-- ───────────────────────── participantes do lado do cliente ─────────────────────────
create table if not exists public.deal_contacts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  deal_id uuid not null references public.deals(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  role text not null default 'influenciador' check (role in ('decisor','influenciador','usuario','outro')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (deal_id, contact_id)
);
create index if not exists deal_contacts_contact on public.deal_contacts (contact_id);

-- Negócio e contato sempre da mesma conta da linha.
create or replace function public.tg_deal_contacts_same_account() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.deals d where d.id = new.deal_id and d.account_id = new.account_id)
     or not exists (select 1 from public.contacts c where c.id = new.contact_id and c.account_id = new.account_id) then
    raise exception 'negócio ou contato de outra conta' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists deal_contacts_same_account on public.deal_contacts;
create trigger deal_contacts_same_account before insert or update on public.deal_contacts
  for each row execute function public.tg_deal_contacts_same_account();

alter table public.deal_contacts enable row level security;
drop policy if exists deal_contacts_select on public.deal_contacts;
create policy deal_contacts_select on public.deal_contacts for select
  using (public.is_member(account_id) and exists (select 1 from public.deals d where d.id = deal_id));
drop policy if exists deal_contacts_insert on public.deal_contacts;
create policy deal_contacts_insert on public.deal_contacts for insert
  with check (public.is_member(account_id) and exists (select 1 from public.deals d where d.id = deal_id));
drop policy if exists deal_contacts_update on public.deal_contacts;
create policy deal_contacts_update on public.deal_contacts for update
  using (public.is_member(account_id) and exists (select 1 from public.deals d where d.id = deal_id))
  with check (public.is_member(account_id));
drop policy if exists deal_contacts_delete on public.deal_contacts;
create policy deal_contacts_delete on public.deal_contacts for delete
  using (public.is_member(account_id) and exists (select 1 from public.deals d where d.id = deal_id));

-- ───────────────────────── sugestão de forecast (vinda da ata; nunca aplicada sozinha) ─────────────────────────
create table if not exists public.deal_forecast_suggestions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  deal_id uuid not null references public.deals(id) on delete cascade,
  meeting_id uuid references public.meetings(id) on delete set null,
  current_category text not null check (current_category in ('commit','best_case','pipeline','omitted')),
  suggested_category text not null check (suggested_category in ('commit','best_case','pipeline','omitted')),
  reasons text[] not null default '{}',
  status text not null default 'pending' check (status in ('pending','applied','ignored','superseded')),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists deal_forecast_suggestions_deal on public.deal_forecast_suggestions (deal_id, created_at desc);
create unique index if not exists deal_forecast_suggestions_one_pending
  on public.deal_forecast_suggestions (deal_id) where status = 'pending';
alter table public.deal_forecast_suggestions enable row level security;
drop policy if exists deal_forecast_suggestions_select on public.deal_forecast_suggestions;
create policy deal_forecast_suggestions_select on public.deal_forecast_suggestions for select
  using (public.is_member(account_id) and exists (select 1 from public.deals d where d.id = deal_id));
-- Quem vê o negócio decide (aplicar/ignorar); criar é só do job (service role).
drop policy if exists deal_forecast_suggestions_update on public.deal_forecast_suggestions;
create policy deal_forecast_suggestions_update on public.deal_forecast_suggestions for update
  using (public.is_member(account_id) and status = 'pending' and exists (select 1 from public.deals d where d.id = deal_id))
  with check (public.is_member(account_id) and status in ('applied','ignored'));

-- ───────────────────────── sala do negócio: sinais para saúde e "o que a IA viu" ─────────────────────────
create or replace function public.deal_room(_deal uuid)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare _d record; _out jsonb; _contacts uuid[];
begin
  select id, account_id, contact_id, status, expected_close_date into _d from public.deals where id = _deal;
  if _d.id is null then return null; end if;
  select array_agg(x) into _contacts from (
    select _d.contact_id x where _d.contact_id is not null
    union select contact_id from public.deal_contacts where deal_id = _deal
  ) s;
  _contacts := coalesce(_contacts, '{}');
  with mt as (
    select m.id, m.title, m.status, m.scheduled_start, m.started_at, m.ended_at, m.minutes, (m.score->>'total')::int score
      from public.meetings m
     where m.deal_id = _deal or (m.deal_id is null and m.contact_id = any(_contacts))
  ),
  cl as (
    select c.id, c.direction, c.status, c.started_at, coalesce(c.billseconds, c.duration_seconds) secs, c.summary, c.sentiment
      from public.calls c where c.contact_id = any(_contacts)
  )
  select jsonb_build_object(
    'last_touch_at', greatest(
      (select max(last_interaction_at) from public.contacts where id = any(_contacts)),
      (select max(done_at) from public.activities where deal_id = _deal and done_at is not null),
      (select max(coalesce(ended_at, started_at)) from mt where started_at is not null),
      (select max(started_at) from cl where status in ('completed','in_progress'))),
    'next_activity_at', least(
      (select min(due_at) from public.activities where deal_id = _deal and done_at is null and due_at >= now()),
      (select min(scheduled_start) from mt where status = 'scheduled' and scheduled_start >= now())),
    'overdue_activities', (select count(*) from public.activities where deal_id = _deal and done_at is null and due_at < now()),
    'proposal', (select jsonb_build_object('status', p.status, 'sent_at', p.sent_at, 'first_viewed_at', p.first_viewed_at,
                                           'view_count', p.view_count, 'accepted_at', p.accepted_at)
                   from public.proposals p where p.deal_id = _deal order by p.created_at desc limit 1),
    'contact', (select jsonb_build_object('id', c.id, 'name', c.name, 'score', c.score, 'temperature', c.temperature,
                                          'ai_intent', c.ai_intent, 'ai_summary', c.ai_summary, 'ai_next_step', c.ai_next_step,
                                          'classified_at', c.classified_at)
                  from public.contacts c where c.id = _d.contact_id),
    'last_minutes', (select jsonb_build_object('meeting_id', id, 'title', title, 'at', coalesce(ended_at, started_at, scheduled_start),
                                               'summary', minutes->>'summary', 'risks', coalesce(minutes->'risks', '[]'::jsonb),
                                               'next_steps', coalesce(minutes->'next_steps', '[]'::jsonb),
                                               'objections', coalesce(minutes->'objections', '[]'::jsonb), 'score', score)
                       from mt where minutes ? 'summary' order by coalesce(ended_at, started_at, scheduled_start) desc nulls last limit 1),
    'last_call', (select jsonb_build_object('call_id', id, 'at', started_at, 'summary', summary, 'sentiment', sentiment)
                    from cl where summary is not null order by started_at desc limit 1),
    'meetings', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'status', status,
                                   'at', coalesce(started_at, scheduled_start), 'score', score) order by coalesce(started_at, scheduled_start) desc)
                          from (select * from mt order by coalesce(started_at, scheduled_start) desc nulls last limit 10) x), '[]'::jsonb),
    'calls', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'direction', direction, 'status', status, 'at', started_at,
                                'seconds', secs, 'summary', summary) order by started_at desc)
                       from (select * from cl order by started_at desc limit 10) x), '[]'::jsonb)
  ) into _out;
  return _out;
end $$;
revoke all on function public.deal_room(uuid) from public, anon;
grant execute on function public.deal_room(uuid) to authenticated, service_role;

-- ───────────────────────── linha do tempo da empresa (todos os contatos) ─────────────────────────
create or replace function public.company_timeline(_company uuid, _limit int default 60, _before timestamptz default null, _kinds text[] default null)
returns table (kind text, ref_id uuid, at timestamptz, title text, body text, meta jsonb, contact_id uuid, contact_name text)
language plpgsql stable security invoker set search_path = public as $$
declare _parts text := 'select * from public.contact_timeline_base(c.id)'; _f record;
begin
  for _f in
    select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'timeline\_part\_%' and p.pronargs = 1
     order by p.proname
  loop
    _parts := _parts || format(' union all select * from public.%I(c.id)', _f.proname);
  end loop;
  return query execute format(
    'select t.kind, t.ref_id, t.at, t.title, t.body, t.meta, c.id, c.name
       from public.contacts c cross join lateral (%s) t
      where c.company_id = $1 and t.at is not null and ($2 is null or t.at < $2)
        and ($3 is null or cardinality($3) = 0 or t.kind = any($3))
      order by t.at desc limit %s',
    _parts, greatest(1, least(coalesce(_limit, 60), 200)))
  using _company, _before, _kinds;
end $$;
revoke all on function public.company_timeline(uuid, int, timestamptz, text[]) from public, anon;
grant execute on function public.company_timeline(uuid, int, timestamptz, text[]) to authenticated;
