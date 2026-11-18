-- Nexus One · CRM (funis, etapas, negócios, atividades), agenda, classificação de leads por IA
-- e as funções de entrada (criar conta, aceitar convite).

-- ---------------------------------------------------------------- funis
create table if not exists public.pipelines (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  position integer not null default 0,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists pipelines_one_default_uq on public.pipelines(account_id) where is_default;

create table if not exists public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  pipeline_id uuid not null references public.pipelines(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  position integer not null default 0,
  color text not null default 'slate',
  probability smallint not null default 0 check (probability between 0 and 100),
  kind text not null default 'open' check (kind in ('open','won','lost')),
  created_at timestamptz not null default now()
);
create index if not exists pipeline_stages_pipeline_idx on public.pipeline_stages(pipeline_id, position);

create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  pipeline_id uuid not null references public.pipelines(id) on delete cascade,
  stage_id uuid not null references public.pipeline_stages(id) on delete restrict,
  contact_id uuid references public.contacts(id) on delete set null,
  title text not null check (length(trim(title)) between 1 and 160),
  value numeric(14,2) not null default 0 check (value >= 0),
  currency text not null default 'BRL',
  owner_user_id uuid references auth.users(id) on delete set null,
  source text,
  position double precision not null default 0,
  status text not null default 'open' check (status in ('open','won','lost')),
  lost_reason text,
  expected_close_date date,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists deals_board_idx on public.deals(pipeline_id, stage_id, position);
create index if not exists deals_contact_idx on public.deals(contact_id);
drop trigger if exists deals_touch on public.deals;
create trigger deals_touch before update on public.deals
  for each row execute function public.touch_updated_at();

-- Status do negócio acompanha o tipo da etapa e registra a mudança na linha do tempo.
create or replace function public.on_deal_stage_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  _kind text;
  _from text;
  _to text;
begin
  if tg_op = 'UPDATE' and new.stage_id is not distinct from old.stage_id then
    return new;
  end if;
  select kind, name into _kind, _to from pipeline_stages where id = new.stage_id;
  if _kind is null or (select pipeline_id from pipeline_stages where id = new.stage_id) <> new.pipeline_id then
    raise exception 'stage does not belong to pipeline' using errcode = '23514';
  end if;
  new.status := _kind;
  new.closed_at := case when _kind = 'open' then null else coalesce(new.closed_at, now()) end;
  if tg_op = 'UPDATE' then
    select name into _from from pipeline_stages where id = old.stage_id;
    insert into activities (account_id, contact_id, deal_id, type, title, user_id)
    values (new.account_id, new.contact_id, new.id, 'stage_change', _from || ' → ' || _to, auth.uid());
  end if;
  return new;
end $$;
revoke execute on function public.on_deal_stage_change() from public;

-- ---------------------------------------------------------------- atividades
create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete cascade,
  deal_id uuid references public.deals(id) on delete cascade,
  type text not null check (type in ('note','call','task','email','meeting','stage_change','ai')),
  title text not null,
  body text,
  due_at timestamptz,
  done_at timestamptz,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists activities_contact_idx on public.activities(contact_id, created_at desc);
create index if not exists activities_deal_idx on public.activities(deal_id, created_at desc);

drop trigger if exists deals_stage_change on public.deals;
create trigger deals_stage_change before insert or update of stage_id on public.deals
  for each row execute function public.on_deal_stage_change();

-- ---------------------------------------------------------------- agenda
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 160),
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  all_day boolean not null default false,
  location text,
  meeting_url text,
  contact_id uuid references public.contacts(id) on delete set null,
  deal_id uuid references public.deals(id) on delete set null,
  owner_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'scheduled' check (status in ('scheduled','confirmed','done','canceled','no_show')),
  color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at >= starts_at)
);
create index if not exists events_range_idx on public.events(account_id, starts_at);
drop trigger if exists events_touch on public.events;
create trigger events_touch before update on public.events
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- IA
create table if not exists public.ai_classifications (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  score smallint not null check (score between 0 and 100),
  temperature text not null check (temperature in ('hot','warm','cold')),
  intent text,
  summary text,
  next_step text,
  signals jsonb not null default '[]'::jsonb,
  model text,
  created_at timestamptz not null default now()
);
create index if not exists ai_classifications_contact_idx on public.ai_classifications(contact_id, created_at desc);

create table if not exists public.llm_calls (
  id bigint generated always as identity primary key,
  account_id uuid references public.accounts(id) on delete cascade,
  purpose text not null,
  provider text not null,
  model text not null,
  input_tokens integer,
  output_tokens integer,
  latency_ms integer,
  ok boolean not null,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists llm_calls_account_idx on public.llm_calls(account_id, created_at desc);

-- ---------------------------------------------------------------- RLS
alter table public.pipelines enable row level security;
alter table public.pipeline_stages enable row level security;
alter table public.deals enable row level security;
alter table public.activities enable row level security;
alter table public.events enable row level security;
alter table public.ai_classifications enable row level security;
alter table public.llm_calls enable row level security;

drop policy if exists pipelines_select on public.pipelines;
create policy pipelines_select on public.pipelines for select to authenticated using (public.is_member(account_id));
drop policy if exists pipelines_write on public.pipelines;
create policy pipelines_write on public.pipelines for all to authenticated
  using (public.is_manager(account_id)) with check (public.is_manager(account_id));

drop policy if exists stages_select on public.pipeline_stages;
create policy stages_select on public.pipeline_stages for select to authenticated using (public.is_member(account_id));
drop policy if exists stages_write on public.pipeline_stages;
create policy stages_write on public.pipeline_stages for all to authenticated
  using (public.is_manager(account_id)) with check (public.is_manager(account_id));

drop policy if exists deals_select on public.deals;
create policy deals_select on public.deals for select to authenticated
  using (public.is_member(account_id) and (
    not public.has_role(account_id, array['seller']::public.app_role[])
    or owner_user_id is null or owner_user_id = auth.uid()));
drop policy if exists deals_insert on public.deals;
create policy deals_insert on public.deals for insert to authenticated with check (public.is_member(account_id));
drop policy if exists deals_update on public.deals;
create policy deals_update on public.deals for update to authenticated
  using (public.is_member(account_id) and (
    not public.has_role(account_id, array['seller']::public.app_role[])
    or owner_user_id is null or owner_user_id = auth.uid()))
  with check (public.is_member(account_id));
drop policy if exists deals_delete on public.deals;
create policy deals_delete on public.deals for delete to authenticated using (public.is_manager(account_id));

drop policy if exists activities_select on public.activities;
create policy activities_select on public.activities for select to authenticated using (public.is_member(account_id));
drop policy if exists activities_insert on public.activities;
create policy activities_insert on public.activities for insert to authenticated
  with check (public.is_member(account_id) and user_id = auth.uid());
drop policy if exists activities_update on public.activities;
create policy activities_update on public.activities for update to authenticated
  using (public.is_member(account_id) and (user_id = auth.uid() or public.is_manager(account_id)))
  with check (public.is_member(account_id));
drop policy if exists activities_delete on public.activities;
create policy activities_delete on public.activities for delete to authenticated
  using (user_id = auth.uid() or public.is_manager(account_id));

drop policy if exists events_select on public.events;
create policy events_select on public.events for select to authenticated using (public.is_member(account_id));
drop policy if exists events_write on public.events;
create policy events_write on public.events for all to authenticated
  using (public.is_member(account_id)) with check (public.is_member(account_id));

drop policy if exists ai_classifications_select on public.ai_classifications;
create policy ai_classifications_select on public.ai_classifications for select to authenticated
  using (public.is_member(account_id));

drop policy if exists llm_calls_select on public.llm_calls;
create policy llm_calls_select on public.llm_calls for select to authenticated
  using (public.has_role(account_id, array['owner','admin']::public.app_role[]));

-- ---------------------------------------------------------------- entrada
-- Cria a conta do usuário logado, com funil padrão. Idempotente por usuário: se já é dono
-- de alguma conta e não pediu outra, devolve a existente.
create or replace function public.bootstrap_account(_name text, _full_name text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  _uid uuid := auth.uid();
  _account uuid;
  _pipeline uuid;
begin
  if _uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if length(trim(coalesce(_name, ''))) < 2 then raise exception 'name too short' using errcode = '22023'; end if;

  insert into profiles (id, full_name) values (_uid, nullif(trim(_full_name), ''))
  on conflict (id) do update set full_name = coalesce(excluded.full_name, profiles.full_name);

  insert into accounts (name) values (trim(_name)) returning id into _account;
  insert into memberships (account_id, user_id, role, display_name)
  values (_account, _uid, 'owner', nullif(trim(_full_name), ''));

  insert into pipelines (account_id, name, is_default, position)
  values (_account, 'Vendas', true, 0) returning id into _pipeline;
  insert into pipeline_stages (account_id, pipeline_id, name, position, color, probability, kind) values
    (_account, _pipeline, 'Novo lead', 0, 'sky', 10, 'open'),
    (_account, _pipeline, 'Qualificado', 1, 'violet', 30, 'open'),
    (_account, _pipeline, 'Proposta', 2, 'amber', 60, 'open'),
    (_account, _pipeline, 'Negociação', 3, 'orange', 80, 'open'),
    (_account, _pipeline, 'Ganho', 4, 'emerald', 100, 'won'),
    (_account, _pipeline, 'Perdido', 5, 'rose', 0, 'lost');

  update profiles set last_account_id = _account where id = _uid;
  return _account;
end $$;

create or replace function public.invite_preview(_token text)
returns table (account_name text, email text, role public.app_role, expired boolean)
language sql stable security definer set search_path = public as $$
  select a.name, i.email, i.role, (i.expires_at < now() or i.accepted_at is not null)
  from invites i join accounts a on a.id = i.account_id
  where i.token = _token;
$$;

create or replace function public.accept_invite(_token text, _full_name text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  _uid uuid := auth.uid();
  _inv invites%rowtype;
  _email text;
begin
  if _uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select * into _inv from invites where token = _token for update;
  if not found or _inv.accepted_at is not null or _inv.expires_at < now() then
    raise exception 'invite invalid or expired' using errcode = '22023';
  end if;
  select email into _email from auth.users where id = _uid;
  if lower(_email) <> lower(_inv.email) then
    raise exception 'invite belongs to another email' using errcode = '42501';
  end if;
  insert into profiles (id, full_name) values (_uid, nullif(trim(_full_name), ''))
  on conflict (id) do update set full_name = coalesce(excluded.full_name, profiles.full_name);
  insert into memberships (account_id, user_id, role, display_name)
  values (_inv.account_id, _uid, _inv.role, nullif(trim(_full_name), ''))
  on conflict (account_id, user_id) do update set role = excluded.role, is_active = true;
  update invites set accepted_at = now() where id = _inv.id;
  update profiles set last_account_id = _inv.account_id where id = _uid;
  return _inv.account_id;
end $$;

create or replace function public.mark_conversation_read(_conversation uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_see_conversation(_conversation) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update conversations set unread_count = 0 where id = _conversation;
end $$;

-- Números do painel em uma chamada.
create or replace function public.dashboard_stats(_account uuid, _days integer default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  _since timestamptz := now() - make_interval(days => greatest(1, least(_days, 365)));
  _result jsonb;
begin
  if not public.is_member(_account) then raise exception 'forbidden' using errcode = '42501'; end if;
  select jsonb_build_object(
    'open_conversations', (select count(*) from conversations where account_id = _account and status = 'open'),
    'unread', (select coalesce(sum(unread_count), 0) from conversations where account_id = _account and status = 'open'),
    'messages_in', (select count(*) from messages where account_id = _account and direction = 'in' and created_at >= _since),
    'messages_out', (select count(*) from messages where account_id = _account and direction = 'out' and created_at >= _since),
    'new_leads', (select count(*) from contacts where account_id = _account and created_at >= _since),
    'hot_leads', (select count(*) from contacts where account_id = _account and temperature = 'hot'),
    'pipeline_value', (select coalesce(sum(value), 0) from deals where account_id = _account and status = 'open'),
    'won_value', (select coalesce(sum(value), 0) from deals where account_id = _account and status = 'won' and closed_at >= _since),
    'events_today', (select count(*) from events where account_id = _account
                      and starts_at::date = (now() at time zone (select timezone from accounts where id = _account))::date),
    'by_platform', (select coalesce(jsonb_object_agg(platform, n), '{}'::jsonb) from (
        select ch.platform, count(*) n from messages m
        join conversations cv on cv.id = m.conversation_id
        join channels ch on ch.id = cv.channel_id
        where m.account_id = _account and m.created_at >= _since group by ch.platform) t),
    'by_temperature', (select coalesce(jsonb_object_agg(temperature, n), '{}'::jsonb) from (
        select temperature, count(*) n from contacts
        where account_id = _account and temperature is not null group by temperature) t),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'in', i, 'out', o) order by d), '[]'::jsonb) from (
        select date_trunc('day', created_at)::date d,
               count(*) filter (where direction = 'in') i,
               count(*) filter (where direction = 'out') o
        from messages where account_id = _account and created_at >= _since group by 1) t)
  ) into _result;
  return _result;
end $$;

revoke execute on function public.bootstrap_account(text, text) from public, anon;
revoke execute on function public.invite_preview(text) from public;
revoke execute on function public.accept_invite(text, text) from public, anon;
revoke execute on function public.mark_conversation_read(uuid) from public, anon;
revoke execute on function public.dashboard_stats(uuid, integer) from public, anon;
grant execute on function public.bootstrap_account(text, text) to authenticated;
grant execute on function public.invite_preview(text) to anon, authenticated;
grant execute on function public.accept_invite(text, text) to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
grant execute on function public.dashboard_stats(uuid, integer) to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.deals;
exception when duplicate_object then null; when undefined_object then null; end $$;
