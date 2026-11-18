-- Atendimento (SAC): chamados com SLA, pesquisas CSAT/NPS, base de conhecimento, respostas rápidas
-- e o agente de IA que responde (execuções e suíte de avaliação).

create extension if not exists vector with schema extensions;

-- ───────────────────────── slug público da conta (central de ajuda) ─────────────────────────
alter table public.accounts add column if not exists slug text;

create or replace function public.slugify(_s text) returns text language sql stable as $$
  select trim(both '-' from regexp_replace(lower(extensions.unaccent(coalesce(_s, ''))), '[^a-z0-9]+', '-', 'g'));
$$;

do $$
declare r record; base text; candidate text; n int;
begin
  for r in select id, name from public.accounts where slug is null order by created_at loop
    base := left(nullif(public.slugify(r.name), ''), 40);
    if base is null then base := 'conta'; end if;
    candidate := base; n := 1;
    while exists (select 1 from public.accounts where slug = candidate) loop
      n := n + 1; candidate := base || '-' || n;
    end loop;
    update public.accounts set slug = candidate where id = r.id;
  end loop;
end $$;
create unique index if not exists accounts_slug on public.accounts (slug) where slug is not null;

-- Contas novas ganham slug sozinhas.
create or replace function public.tg_account_slug() returns trigger language plpgsql as $$
declare base text; candidate text; n int := 1;
begin
  if new.slug is not null then return new; end if;
  base := coalesce(left(nullif(public.slugify(new.name), ''), 40), 'conta');
  candidate := base;
  while exists (select 1 from public.accounts where slug = candidate) loop
    n := n + 1; candidate := base || '-' || n;
  end loop;
  new.slug := candidate;
  return new;
end $$;
drop trigger if exists accounts_slug_default on public.accounts;
create trigger accounts_slug_default before insert on public.accounts for each row execute function public.tg_account_slug();

-- ───────────────────────── horário útil ─────────────────────────
-- Horário de atendimento da conta em settings.business_hours = {"days":[1..5],"start":"09:00","end":"18:00"}.
-- Soma minutos úteis a partir de um instante (para o vencimento do SLA).
create or replace function public.add_business_minutes(_account uuid, _from timestamptz, _minutes int)
returns timestamptz language plpgsql stable security definer set search_path = public as $$
declare
  _tz text; _bh jsonb; _days int[]; _start time; _end time;
  _cur timestamp; _left int := greatest(_minutes, 0); _dow int; _day_end timestamp; _avail int; _guard int := 0;
begin
  select coalesce(timezone, 'America/Sao_Paulo'), coalesce(settings->'business_hours', '{}'::jsonb) into _tz, _bh
    from public.accounts where id = _account;
  if _tz is null then _tz := 'America/Sao_Paulo'; end if;
  _days := coalesce((select array_agg(x::int) from jsonb_array_elements_text(_bh->'days') x), array[1,2,3,4,5]);
  _start := coalesce((_bh->>'start')::time, '09:00');
  _end := coalesce((_bh->>'end')::time, '18:00');
  if _bh ? 'always' and (_bh->>'always')::boolean then
    return _from + make_interval(mins => _left);
  end if;
  _cur := _from at time zone _tz;
  while _left > 0 and _guard < 400 loop
    _guard := _guard + 1;
    _dow := extract(isodow from _cur)::int;
    if not (_dow = any(_days)) or _cur::time >= _end then
      _cur := (_cur::date + 1) + _start;
      continue;
    end if;
    if _cur::time < _start then _cur := _cur::date + _start; end if;
    _day_end := _cur::date + _end;
    _avail := floor(extract(epoch from (_day_end - _cur)) / 60)::int;
    if _avail >= _left then
      _cur := _cur + make_interval(mins => _left);
      _left := 0;
    else
      _left := _left - _avail;
      _cur := (_cur::date + 1) + _start;
    end if;
  end loop;
  return _cur at time zone _tz;
end $$;

-- ───────────────────────── políticas de SLA ─────────────────────────
create table if not exists public.sla_policies (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  priority text not null check (priority in ('low','normal','high','urgent')),
  first_response_minutes int not null check (first_response_minutes between 1 and 43200),
  resolution_minutes int not null check (resolution_minutes between 1 and 129600),
  business_hours boolean not null default true,
  created_at timestamptz not null default now(),
  unique (account_id, priority)
);
alter table public.sla_policies enable row level security;
drop policy if exists sla_policies_select on public.sla_policies;
create policy sla_policies_select on public.sla_policies for select using (public.is_member(account_id));
drop policy if exists sla_policies_write on public.sla_policies;
create policy sla_policies_write on public.sla_policies for all using (public.is_manager(account_id)) with check (public.is_manager(account_id));

-- Padrão razoável quando a conta ainda não configurou: urgente 30 min / 4 h, alta 1 h / 8 h, normal 4 h / 24 h, baixa 8 h / 72 h (úteis).
create or replace function public.sla_for(_account uuid, _priority text)
returns table (first_response_minutes int, resolution_minutes int, business_hours boolean, policy_id uuid)
language sql stable security definer set search_path = public as $$
  select coalesce(p.first_response_minutes, d.f), coalesce(p.resolution_minutes, d.r), coalesce(p.business_hours, true), p.id
  from (values ('urgent', 30, 240), ('high', 60, 480), ('normal', 240, 1440), ('low', 480, 4320)) d(prio, f, r)
  left join public.sla_policies p on p.account_id = _account and p.priority = d.prio
  where d.prio = _priority;
$$;

-- ───────────────────────── chamados ─────────────────────────
create table if not exists public.ticket_counters (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  last_number int not null default 0
);
alter table public.ticket_counters enable row level security;

-- Número sequencial por conta sem MAX()+1: a linha do contador trava na atualização.
create or replace function public.next_ticket_number(_account uuid) returns int
language plpgsql security definer set search_path = public as $$
declare _n int;
begin
  insert into public.ticket_counters (account_id, last_number) values (_account, 1)
  on conflict (account_id) do update set last_number = public.ticket_counters.last_number + 1
  returning last_number into _n;
  return _n;
end $$;
revoke all on function public.next_ticket_number(uuid) from public, anon, authenticated;

create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  number int not null,
  subject text not null check (length(trim(subject)) between 1 and 200),
  description text,
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  category text,
  status text not null default 'open' check (status in ('open','pending','waiting_customer','resolved','closed')),
  source text not null default 'manual' check (source in ('manual','conversation','email','webchat','voice','api','whatsapp','form')),
  contact_id uuid references public.contacts(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  owner_user_id uuid references auth.users(id) on delete set null,
  team text,
  sla_policy_id uuid references public.sla_policies(id) on delete set null,
  first_response_due_at timestamptz,
  resolution_due_at timestamptz,
  first_response_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  sla_warned_at timestamptz,
  sla_breached boolean not null default false,
  csat_score smallint check (csat_score between 1 and 5),
  tags text[] not null default '{}',
  custom jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, number)
);
create index if not exists tickets_account_status on public.tickets (account_id, status, created_at desc);
create index if not exists tickets_contact on public.tickets (contact_id) where contact_id is not null;
create index if not exists tickets_conversation on public.tickets (conversation_id) where conversation_id is not null;
create index if not exists tickets_due on public.tickets (resolution_due_at) where status in ('open','pending','waiting_customer');
drop trigger if exists tickets_touch on public.tickets;
create trigger tickets_touch before update on public.tickets for each row execute function public.touch_updated_at();

-- Número, empresa do contato e vencimentos do SLA na criação.
create or replace function public.tg_ticket_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare _sla record;
begin
  new.number := public.next_ticket_number(new.account_id);
  if new.contact_id is not null then
    if not exists (select 1 from public.contacts c where c.id = new.contact_id and c.account_id = new.account_id) then
      raise exception 'contato de outra conta' using errcode = '42501';
    end if;
    if new.company_id is null then
      select company_id into new.company_id from public.contacts where id = new.contact_id;
    end if;
  end if;
  if new.conversation_id is not null and not exists (
    select 1 from public.conversations v where v.id = new.conversation_id and v.account_id = new.account_id) then
    raise exception 'conversa de outra conta' using errcode = '42501';
  end if;
  select * into _sla from public.sla_for(new.account_id, new.priority);
  new.sla_policy_id := _sla.policy_id;
  if _sla.business_hours then
    new.first_response_due_at := public.add_business_minutes(new.account_id, new.created_at, _sla.first_response_minutes);
    new.resolution_due_at := public.add_business_minutes(new.account_id, new.created_at, _sla.resolution_minutes);
  else
    new.first_response_due_at := new.created_at + make_interval(mins => _sla.first_response_minutes);
    new.resolution_due_at := new.created_at + make_interval(mins => _sla.resolution_minutes);
  end if;
  return new;
end $$;
drop trigger if exists tickets_before_insert on public.tickets;
create trigger tickets_before_insert before insert on public.tickets for each row execute function public.tg_ticket_before_insert();

-- Status: carimba resolvido/fechado e recalcula SLA quando a prioridade muda.
create or replace function public.tg_ticket_before_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare _sla record;
begin
  if new.status is distinct from old.status then
    if new.status = 'resolved' and old.status <> 'resolved' then new.resolved_at := now(); end if;
    if new.status = 'closed' then new.closed_at := coalesce(new.closed_at, now()); new.resolved_at := coalesce(new.resolved_at, now()); end if;
    if new.status in ('open','pending','waiting_customer') then new.resolved_at := null; new.closed_at := null; end if;
  end if;
  if new.priority is distinct from old.priority and new.status in ('open','pending','waiting_customer') then
    select * into _sla from public.sla_for(new.account_id, new.priority);
    new.sla_policy_id := _sla.policy_id;
    new.sla_warned_at := null;
    if _sla.business_hours then
      new.resolution_due_at := public.add_business_minutes(new.account_id, old.created_at, _sla.resolution_minutes);
      if new.first_response_at is null then
        new.first_response_due_at := public.add_business_minutes(new.account_id, old.created_at, _sla.first_response_minutes);
      end if;
    else
      new.resolution_due_at := old.created_at + make_interval(mins => _sla.resolution_minutes);
      if new.first_response_at is null then
        new.first_response_due_at := old.created_at + make_interval(mins => _sla.first_response_minutes);
      end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists tickets_before_update on public.tickets;
create trigger tickets_before_update before update on public.tickets for each row execute function public.tg_ticket_before_update();

create table if not exists public.ticket_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  kind text not null check (kind in ('created','comment','status','assign','priority','sla','csat','system')),
  body text,
  is_public boolean not null default false,
  author_user_id uuid references auth.users(id) on delete set null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists ticket_events_ticket on public.ticket_events (ticket_id, created_at);

-- Histórico automático, eventos de domínio e primeira resposta.
create or replace function public.tg_ticket_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.ticket_events (account_id, ticket_id, kind, body, author_user_id, meta)
    values (new.account_id, new.id, 'created', new.subject, new.created_by, jsonb_build_object('source', new.source, 'priority', new.priority));
    perform public.emit_event(new.account_id, 'ticket.created', 'ticket', new.id,
      jsonb_build_object('contact_id', new.contact_id, 'priority', new.priority, 'number', new.number, 'source', new.source));
    if new.owner_user_id is not null and new.owner_user_id is distinct from new.created_by then
      perform public.notify_user(new.account_id, new.owner_user_id, 'ticket_assigned',
        'Chamado #' || new.number || ' atribuído a você', new.subject, '/atendimento?chamado=' || new.id);
    end if;
    return new;
  end if;
  if new.status is distinct from old.status then
    insert into public.ticket_events (account_id, ticket_id, kind, author_user_id, meta)
    values (new.account_id, new.id, 'status', auth.uid(), jsonb_build_object('from', old.status, 'to', new.status));
    if new.status = 'resolved' then
      perform public.emit_event(new.account_id, 'ticket.resolved', 'ticket', new.id,
        jsonb_build_object('contact_id', new.contact_id, 'number', new.number));
    end if;
  end if;
  if new.owner_user_id is distinct from old.owner_user_id then
    insert into public.ticket_events (account_id, ticket_id, kind, author_user_id, meta)
    values (new.account_id, new.id, 'assign', auth.uid(), jsonb_build_object('from', old.owner_user_id, 'to', new.owner_user_id));
    if new.owner_user_id is not null and new.owner_user_id is distinct from auth.uid() then
      perform public.notify_user(new.account_id, new.owner_user_id, 'ticket_assigned',
        'Chamado #' || new.number || ' atribuído a você', new.subject, '/atendimento?chamado=' || new.id);
    end if;
  end if;
  if new.priority is distinct from old.priority then
    insert into public.ticket_events (account_id, ticket_id, kind, author_user_id, meta)
    values (new.account_id, new.id, 'priority', auth.uid(), jsonb_build_object('from', old.priority, 'to', new.priority));
  end if;
  return new;
end $$;
drop trigger if exists tickets_after on public.tickets;
create trigger tickets_after after insert or update of status, owner_user_id, priority on public.tickets
  for each row execute function public.tg_ticket_after();

-- Comentário público do atendente marca a primeira resposta.
create or replace function public.tg_ticket_event_first_response() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'comment' and new.is_public and new.author_user_id is not null then
    update public.tickets set first_response_at = coalesce(first_response_at, new.created_at)
     where id = new.ticket_id and first_response_at is null;
  end if;
  return new;
end $$;
drop trigger if exists ticket_events_first_response on public.ticket_events;
create trigger ticket_events_first_response after insert on public.ticket_events
  for each row execute function public.tg_ticket_event_first_response();

-- Visibilidade: membros veem; vendedor vê só os seus e os sem dono.
create or replace function public.can_see_ticket(_ticket uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tickets t
    where t.id = _ticket and public.is_member(t.account_id)
      and (not public.has_role(t.account_id, array['seller']::public.app_role[])
           or t.owner_user_id is null or t.owner_user_id = auth.uid())
  );
$$;

alter table public.tickets enable row level security;
drop policy if exists tickets_select on public.tickets;
create policy tickets_select on public.tickets for select using (
  public.is_member(account_id)
  and (not public.has_role(account_id, array['seller']::public.app_role[]) or owner_user_id is null or owner_user_id = auth.uid()));
drop policy if exists tickets_insert on public.tickets;
create policy tickets_insert on public.tickets for insert with check (public.is_member(account_id));
drop policy if exists tickets_update on public.tickets;
create policy tickets_update on public.tickets for update using (
  public.is_member(account_id)
  and (not public.has_role(account_id, array['seller']::public.app_role[]) or owner_user_id is null or owner_user_id = auth.uid()))
  with check (public.is_member(account_id));
drop policy if exists tickets_delete on public.tickets;
create policy tickets_delete on public.tickets for delete using (public.is_manager(account_id));

alter table public.ticket_events enable row level security;
drop policy if exists ticket_events_select on public.ticket_events;
create policy ticket_events_select on public.ticket_events for select using (public.can_see_ticket(ticket_id));
drop policy if exists ticket_events_insert on public.ticket_events;
create policy ticket_events_insert on public.ticket_events for insert with check (
  public.can_see_ticket(ticket_id) and kind = 'comment' and author_user_id = auth.uid()
  and exists (select 1 from public.tickets t where t.id = ticket_id and t.account_id = ticket_events.account_id));

-- Abre chamado de qualquer origem (tela, IA de voz, e-mail, webchat). Membro ou serviço.
create or replace function public.create_ticket(
  _account uuid, _subject text, _description text default null, _contact uuid default null,
  _conversation uuid default null, _priority text default 'normal', _source text default 'manual',
  _category text default null, _owner uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare _id uuid;
begin
  if auth.role() <> 'service_role' and not public.is_member(_account) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.tickets (account_id, subject, description, contact_id, conversation_id, priority, source, category, owner_user_id, created_by)
  values (_account, left(trim(_subject), 200), _description, _contact, _conversation, coalesce(_priority, 'normal'),
          coalesce(_source, 'manual'), _category, _owner, auth.uid())
  returning id into _id;
  return _id;
end $$;
revoke all on function public.create_ticket(uuid, text, text, uuid, uuid, text, text, text, uuid) from public, anon;
grant execute on function public.create_ticket(uuid, text, text, uuid, uuid, text, text, text, uuid) to authenticated, service_role;

do $$ begin
  alter publication supabase_realtime add table public.tickets;
exception when duplicate_object then null; when undefined_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.ticket_events;
exception when duplicate_object then null; when undefined_object then null; end $$;

-- ───────────────────────── CSAT e NPS ─────────────────────────
create table if not exists public.csat_responses (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  ticket_id uuid references public.tickets(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  token text not null unique default encode(extensions.gen_random_bytes(18), 'hex'),
  score smallint check (score between 1 and 5),
  comment text,
  channel text,
  sent_at timestamptz not null default now(),
  answered_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists csat_one_per_ticket on public.csat_responses (ticket_id) where ticket_id is not null;
alter table public.csat_responses enable row level security;
drop policy if exists csat_select on public.csat_responses;
create policy csat_select on public.csat_responses for select using (public.is_member(account_id));

create table if not exists public.nps_surveys (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  question text not null default 'De 0 a 10, quanto você recomendaria a gente para um amigo?',
  segment_id uuid references public.segments(id) on delete set null,
  channel text not null default 'email' check (channel in ('email','whatsapp')),
  status text not null default 'draft' check (status in ('draft','sending','sent','closed')),
  sent_count int not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
alter table public.nps_surveys enable row level security;
drop policy if exists nps_surveys_select on public.nps_surveys;
create policy nps_surveys_select on public.nps_surveys for select using (public.is_member(account_id));
drop policy if exists nps_surveys_write on public.nps_surveys;
create policy nps_surveys_write on public.nps_surveys for all using (public.is_manager(account_id)) with check (public.is_manager(account_id));

create table if not exists public.nps_responses (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  survey_id uuid not null references public.nps_surveys(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  token text not null unique default encode(extensions.gen_random_bytes(18), 'hex'),
  score smallint check (score between 0 and 10),
  comment text,
  sent_at timestamptz not null default now(),
  answered_at timestamptz,
  unique (survey_id, contact_id)
);
alter table public.nps_responses enable row level security;
drop policy if exists nps_responses_select on public.nps_responses;
create policy nps_responses_select on public.nps_responses for select using (public.is_member(account_id));

-- ───────────────────────── base de conhecimento ─────────────────────────
create table if not exists public.kb_articles (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 200),
  slug text not null,
  category text,
  body_md text not null default '',
  visibility text not null default 'public' check (visibility in ('public','internal')),
  status text not null default 'draft' check (status in ('draft','published')),
  views int not null default 0,
  helpful_yes int not null default 0,
  helpful_no int not null default 0,
  embedding extensions.vector(1536),
  embedded_at timestamptz,
  search tsvector generated always as (
    setweight(to_tsvector('portuguese', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('portuguese', coalesce(category, '')), 'B') ||
    setweight(to_tsvector('portuguese', coalesce(body_md, '')), 'C')
  ) stored,
  author_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, slug)
);
create index if not exists kb_articles_search on public.kb_articles using gin (search);
drop trigger if exists kb_articles_touch on public.kb_articles;
create trigger kb_articles_touch before update on public.kb_articles for each row execute function public.touch_updated_at();

-- Texto mudou: o embedding antigo deixa de valer (o tick refaz).
create or replace function public.tg_kb_reset_embedding() returns trigger language plpgsql as $$
begin
  if new.title is distinct from old.title or new.body_md is distinct from old.body_md then
    new.embedding := null; new.embedded_at := null;
  end if;
  return new;
end $$;
drop trigger if exists kb_articles_reset_embedding on public.kb_articles;
create trigger kb_articles_reset_embedding before update on public.kb_articles for each row execute function public.tg_kb_reset_embedding();

alter table public.kb_articles enable row level security;
drop policy if exists kb_select on public.kb_articles;
create policy kb_select on public.kb_articles for select using (public.is_member(account_id));
drop policy if exists kb_write on public.kb_articles;
create policy kb_write on public.kb_articles for all using (public.is_member(account_id)) with check (public.is_member(account_id));

-- Busca híbrida: semântica quando há embedding, texto (português) sempre.
create or replace function public.kb_search(
  _account uuid, _query text, _embedding extensions.vector default null, _limit int default 5, _public_only boolean default false
) returns table (id uuid, title text, slug text, category text, body_md text, visibility text, score real)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if auth.role() <> 'service_role' and not public.is_member(_account) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  with q as (select websearch_to_tsquery('portuguese', coalesce(_query, '')) tsq),
  base as (
    select a.id, a.title, a.slug, a.category, a.body_md, a.visibility,
           (coalesce(ts_rank(a.search, q.tsq), 0)
            + case when _embedding is not null and a.embedding is not null then (1 - (a.embedding <=> _embedding)) else 0 end)::real as score,
           a.search @@ q.tsq as text_hit,
           (_embedding is not null and a.embedding is not null and (a.embedding <=> _embedding) < 0.6) as vec_hit
      from public.kb_articles a, q
     where a.account_id = _account and a.status = 'published'
       and (not _public_only or a.visibility = 'public')
  )
  select b.id, b.title, b.slug, b.category, b.body_md, b.visibility, b.score
    from base b where b.text_hit or b.vec_hit
   order by b.score desc limit greatest(1, least(_limit, 20));
end $$;
revoke all on function public.kb_search(uuid, text, extensions.vector, int, boolean) from public, anon;
grant execute on function public.kb_search(uuid, text, extensions.vector, int, boolean) to authenticated, service_role;

-- ───────────────────────── respostas rápidas ─────────────────────────
create table if not exists public.quick_replies (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  shortcut text not null check (shortcut ~ '^[a-z0-9][a-z0-9_-]{0,30}$'),
  title text not null check (length(trim(title)) between 1 and 80),
  body text not null check (length(body) between 1 and 4000),
  is_shared boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (account_id, shortcut)
);
alter table public.quick_replies enable row level security;
drop policy if exists quick_replies_select on public.quick_replies;
create policy quick_replies_select on public.quick_replies for select using (public.is_member(account_id) and (is_shared or created_by = auth.uid()));
drop policy if exists quick_replies_insert on public.quick_replies;
create policy quick_replies_insert on public.quick_replies for insert with check (public.is_member(account_id) and created_by = auth.uid());
drop policy if exists quick_replies_update on public.quick_replies;
create policy quick_replies_update on public.quick_replies for update using (created_by = auth.uid() or public.is_manager(account_id)) with check (public.is_member(account_id));
drop policy if exists quick_replies_delete on public.quick_replies;
create policy quick_replies_delete on public.quick_replies for delete using (created_by = auth.uid() or public.is_manager(account_id));

-- ───────────────────────── agente de IA que responde ─────────────────────────
alter table public.conversations add column if not exists ai_handoff_at timestamptz;
alter table public.conversations add column if not exists ai_handoff_reason text;

create table if not exists public.ai_agent_runs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  trigger_message_id uuid references public.messages(id) on delete set null,
  status text not null default 'queued' check (status in ('queued','replied','handoff','skipped','error')),
  reply_message_id uuid references public.messages(id) on delete set null,
  reason text,
  confidence real,
  sources jsonb not null default '[]'::jsonb,
  latency_ms int,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists ai_agent_runs_conversation on public.ai_agent_runs (conversation_id, created_at desc);
alter table public.ai_agent_runs enable row level security;
drop policy if exists ai_agent_runs_select on public.ai_agent_runs;
create policy ai_agent_runs_select on public.ai_agent_runs for select using (public.is_member(account_id));

create table if not exists public.ai_eval_cases (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  question text not null check (length(trim(question)) between 1 and 2000),
  expected text,
  must_handoff boolean not null default false,
  tags text[] not null default '{}',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.ai_eval_cases enable row level security;
drop policy if exists ai_eval_cases_select on public.ai_eval_cases;
create policy ai_eval_cases_select on public.ai_eval_cases for select using (public.is_member(account_id));
drop policy if exists ai_eval_cases_write on public.ai_eval_cases;
create policy ai_eval_cases_write on public.ai_eval_cases for all using (public.is_manager(account_id)) with check (public.is_manager(account_id));

create table if not exists public.ai_eval_runs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  started_by uuid references auth.users(id) on delete set null,
  total int not null default 0,
  passed int not null default 0,
  accept_rate real,
  results jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.ai_eval_runs enable row level security;
drop policy if exists ai_eval_runs_select on public.ai_eval_runs;
create policy ai_eval_runs_select on public.ai_eval_runs for select using (public.is_member(account_id));

-- ───────────────────────── métricas do SAC ─────────────────────────
create or replace function public.sac_metrics(_account uuid, _days int default 30)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare _since timestamptz := now() - make_interval(days => greatest(1, least(_days, 365)));
begin
  if not public.is_member(_account) then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'open', (select count(*) from public.tickets where account_id = _account and status in ('open','pending','waiting_customer')),
    'created', (select count(*) from public.tickets where account_id = _account and created_at >= _since),
    'resolved', (select count(*) from public.tickets where account_id = _account and resolved_at >= _since),
    'breached_open', (select count(*) from public.tickets where account_id = _account and status in ('open','pending','waiting_customer')
                        and (resolution_due_at < now() or (first_response_at is null and first_response_due_at < now()))),
    'first_response_minutes_avg', (select round(avg(extract(epoch from (first_response_at - created_at)) / 60)::numeric, 1)
                                     from public.tickets where account_id = _account and first_response_at is not null and created_at >= _since),
    'resolution_hours_avg', (select round(avg(extract(epoch from (resolved_at - created_at)) / 3600)::numeric, 1)
                               from public.tickets where account_id = _account and resolved_at is not null and created_at >= _since),
    'sla_met_pct', (select round(100.0 * count(*) filter (where resolved_at <= resolution_due_at) / nullif(count(*), 0), 1)
                      from public.tickets where account_id = _account and resolved_at >= _since),
    'csat_avg', (select round(avg(score)::numeric, 2) from public.csat_responses where account_id = _account and answered_at >= _since),
    'csat_responses', (select count(*) from public.csat_responses where account_id = _account and answered_at >= _since),
    'csat_sent', (select count(*) from public.csat_responses where account_id = _account and sent_at >= _since),
    'nps', (select round(100.0 * (count(*) filter (where score >= 9) - count(*) filter (where score <= 6)) / nullif(count(*), 0), 0)
              from public.nps_responses where account_id = _account and answered_at >= _since),
    'nps_responses', (select count(*) from public.nps_responses where account_id = _account and answered_at >= _since),
    'ai_replied', (select count(*) from public.ai_agent_runs where account_id = _account and status = 'replied' and created_at >= _since),
    'ai_handoff', (select count(*) from public.ai_agent_runs where account_id = _account and status = 'handoff' and created_at >= _since),
    'by_status', coalesce((select jsonb_object_agg(status, n) from (
        select status, count(*) n from public.tickets where account_id = _account and created_at >= _since group by status) s), '{}'::jsonb),
    'by_priority', coalesce((select jsonb_object_agg(priority, n) from (
        select priority, count(*) n from public.tickets where account_id = _account and status in ('open','pending','waiting_customer') group by priority) s), '{}'::jsonb)
  );
end $$;
grant execute on function public.sac_metrics(uuid, int) to authenticated;

-- ───────────────────────── linha do tempo ─────────────────────────
create or replace function public.timeline_part_support(_contact uuid)
returns table (kind text, ref_id uuid, at timestamptz, title text, body text, meta jsonb)
language sql stable security invoker set search_path = public as $$
  select 'ticket'::text, t.id, t.created_at, 'Chamado #' || t.number || ': ' || t.subject, t.description,
         jsonb_build_object('status', t.status, 'priority', t.priority, 'source', t.source, 'csat', t.csat_score)
    from public.tickets t where t.contact_id = _contact
  union all
  select 'ticket', c.id, c.answered_at, 'Avaliou o atendimento: ' || c.score || '/5', c.comment,
         jsonb_build_object('csat', c.score, 'ticket_id', c.ticket_id)
    from public.csat_responses c where c.contact_id = _contact and c.answered_at is not null
  union all
  select 'ticket', n.id, n.answered_at, 'NPS: ' || n.score || '/10', n.comment, jsonb_build_object('nps', n.score)
    from public.nps_responses n where n.contact_id = _contact and n.answered_at is not null;
$$;
grant execute on function public.timeline_part_support(uuid) to authenticated;

-- Funções de serviço chamadas pelas rotas.
grant execute on function public.add_business_minutes(uuid, timestamptz, int) to service_role;
grant execute on function public.sla_for(uuid, text) to service_role, authenticated;
grant execute on function public.next_ticket_number(uuid) to service_role;

-- ───────────────────────── vigia do SLA (pg_cron a cada 5 min) ─────────────────────────
-- Aviso quando falta 20% do prazo (ou 30 min) e estouro: notifica o dono (ou os gestores) e emite evento.
create or replace function public.support_sla_sweep() returns int
language plpgsql security definer set search_path = public as $$
declare t record; n int := 0; _u uuid;
begin
  for t in
    select * from public.tickets
     where status in ('open','pending')
       and sla_breached = false
       and (resolution_due_at < now()
            or (first_response_at is null and first_response_due_at < now())
            or (sla_warned_at is null and resolution_due_at - greatest(interval '30 minutes', (resolution_due_at - created_at) * 0.2) < now()))
     limit 500
  loop
    if t.resolution_due_at < now() or (t.first_response_at is null and t.first_response_due_at < now()) then
      update public.tickets set sla_breached = true, sla_warned_at = coalesce(sla_warned_at, now()) where id = t.id;
      insert into public.ticket_events (account_id, ticket_id, kind, body, meta)
      values (t.account_id, t.id, 'sla', 'Prazo do SLA estourado', jsonb_build_object('due', t.resolution_due_at));
      perform public.emit_event(t.account_id, 'ticket.sla_breached', 'ticket', t.id, jsonb_build_object('number', t.number, 'priority', t.priority));
      for _u in select coalesce(t.owner_user_id, m.user_id) from public.memberships m
                 where m.account_id = t.account_id and m.is_active
                   and (t.owner_user_id is not null or m.role in ('owner','admin','manager'))
                 limit case when t.owner_user_id is not null then 1 else 20 end loop
        perform public.notify_user(t.account_id, _u, 'sla_breached', 'SLA estourado: chamado #' || t.number, t.subject, '/atendimento?chamado=' || t.id);
      end loop;
    else
      update public.tickets set sla_warned_at = now() where id = t.id;
      perform public.emit_event(t.account_id, 'ticket.sla_warning', 'ticket', t.id, jsonb_build_object('number', t.number, 'due', t.resolution_due_at));
      if t.owner_user_id is not null then
        perform public.notify_user(t.account_id, t.owner_user_id, 'sla_warning', 'Chamado #' || t.number || ' vence em breve', t.subject, '/atendimento?chamado=' || t.id);
      end if;
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.support_sla_sweep() from public, anon, authenticated;
grant execute on function public.support_sla_sweep() to service_role;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'support-sla-sweep') then
    perform cron.schedule('support-sla-sweep', '*/5 * * * *', 'select public.support_sla_sweep()');
  end if;
end $$;
