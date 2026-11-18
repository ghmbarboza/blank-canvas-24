-- Treino com roleplay (vendedor conversa com um cliente simulado pela IA) e biblioteca de
-- conversas (busca em transcrições de reuniões e ligações, termos monitorados, melhores momentos).

-- ───────────────────────── roleplay ─────────────────────────
create table if not exists public.roleplay_personas (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  role text,
  company text,
  profile text not null default '',
  objections text[] not null default '{}',
  difficulty text not null default 'medium' check (difficulty in ('easy','medium','hard')),
  playbook_id uuid references public.playbooks(id) on delete set null,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists roleplay_personas_account on public.roleplay_personas (account_id);
alter table public.roleplay_personas enable row level security;
drop policy if exists roleplay_personas_select on public.roleplay_personas;
create policy roleplay_personas_select on public.roleplay_personas for select using (public.is_member(account_id));
drop policy if exists roleplay_personas_write on public.roleplay_personas;
create policy roleplay_personas_write on public.roleplay_personas for all
  using (public.is_manager(account_id)) with check (public.is_manager(account_id));

create table if not exists public.roleplay_sessions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  persona_id uuid references public.roleplay_personas(id) on delete set null,
  playbook_id uuid references public.playbooks(id) on delete set null,
  scorecard_id uuid references public.scorecard_templates(id) on delete set null,
  messages jsonb not null default '[]'::jsonb,
  covered text[] not null default '{}',
  status text not null default 'active' check (status in ('active','finished')),
  score int check (score is null or score between 0 and 100),
  criteria jsonb not null default '[]'::jsonb,
  strengths text[] not null default '{}',
  improvements text[] not null default '{}',
  feedback text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists roleplay_sessions_user on public.roleplay_sessions (account_id, user_id, created_at desc);
alter table public.roleplay_sessions enable row level security;
-- O vendedor vê as próprias; o gestor vê todas. Escrita só pelo servidor (a IA conduz a sessão).
drop policy if exists roleplay_sessions_select on public.roleplay_sessions;
create policy roleplay_sessions_select on public.roleplay_sessions for select
  using (public.is_member(account_id) and (user_id = auth.uid() or public.is_manager(account_id)));
drop policy if exists roleplay_sessions_delete on public.roleplay_sessions;
create policy roleplay_sessions_delete on public.roleplay_sessions for delete
  using (user_id = auth.uid() or public.is_manager(account_id));

-- Ranking do time (gestor vê todos; vendedor vê só a própria linha).
create or replace function public.roleplay_ranking(_account uuid, _days int default 30)
returns table (user_id uuid, sessions bigint, avg_score numeric, best_score int, last_at timestamptz)
language sql stable security invoker set search_path = public as $$
  select s.user_id, count(*), round(avg(s.score)::numeric, 1), max(s.score), max(s.finished_at)
    from public.roleplay_sessions s
   where s.account_id = _account and s.status = 'finished'
     and s.finished_at >= now() - make_interval(days => greatest(1, least(_days, 365)))
   group by s.user_id
   order by avg(s.score) desc nulls last;
$$;
grant execute on function public.roleplay_ranking(uuid, int) to authenticated;

-- ───────────────────────── biblioteca de conversas ─────────────────────────
create extension if not exists pg_trgm with schema extensions;

create table if not exists public.tracked_terms (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  term text not null check (length(trim(term)) between 2 and 60),
  category text not null default 'other' check (category in ('competitor','price','cancellation','other')),
  alert boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (account_id, term)
);
alter table public.tracked_terms enable row level security;
drop policy if exists tracked_terms_select on public.tracked_terms;
create policy tracked_terms_select on public.tracked_terms for select using (public.is_member(account_id));
drop policy if exists tracked_terms_write on public.tracked_terms;
create policy tracked_terms_write on public.tracked_terms for all
  using (public.is_manager(account_id)) with check (public.is_manager(account_id));

create table if not exists public.conversation_highlights (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  source text not null check (source in ('meeting','call')),
  source_id uuid not null,
  excerpt text not null check (length(excerpt) between 1 and 2000),
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists conversation_highlights_account on public.conversation_highlights (account_id, created_at desc);
alter table public.conversation_highlights enable row level security;
drop policy if exists conversation_highlights_select on public.conversation_highlights;
create policy conversation_highlights_select on public.conversation_highlights for select using (public.is_member(account_id));
drop policy if exists conversation_highlights_insert on public.conversation_highlights;
create policy conversation_highlights_insert on public.conversation_highlights for insert
  with check (public.is_member(account_id) and created_by = auth.uid());
drop policy if exists conversation_highlights_delete on public.conversation_highlights;
create policy conversation_highlights_delete on public.conversation_highlights for delete
  using (created_by = auth.uid() or public.is_manager(account_id));

create index if not exists meeting_transcripts_text_trgm on public.meeting_transcripts using gin (text extensions.gin_trgm_ops);
create index if not exists calls_transcript_trgm on public.calls using gin (transcript extensions.gin_trgm_ops) where transcript is not null;

-- Trecho de ~240 caracteres ao redor da primeira ocorrência (sem acento nem caixa).
create or replace function public.excerpt_around(_text text, _q text, _width int default 240)
returns text language sql immutable set search_path = public, extensions as $$
  select case
    when _text is null then null
    when strpos(lower(unaccent(_text)), lower(unaccent(_q))) = 0 then left(_text, _width)
    else
      (case when strpos(lower(unaccent(_text)), lower(unaccent(_q))) > _width / 2 then '…' else '' end)
      || substr(_text, greatest(1, strpos(lower(unaccent(_text)), lower(unaccent(_q))) - _width / 2), _width)
      || (case when length(_text) > strpos(lower(unaccent(_text)), lower(unaccent(_q))) + _width / 2 then '…' else '' end)
  end;
$$;

-- Busca nas transcrições respeitando a RLS de quem chama (security invoker).
create or replace function public.conversation_search(
  _account uuid, _q text, _limit int default 50,
  _source text default null, _days int default null, _user uuid default null
)
returns table (source text, source_id uuid, at timestamptz, excerpt text, contact_id uuid, contact_name text,
               user_id uuid, title text, speaker text)
language sql stable security invoker set search_path = public, extensions as $$
  with q as (select trim(coalesce(_q, '')) as term)
  (
    select 'meeting'::text, m.id, coalesce(m.started_at, m.scheduled_start) + make_interval(secs => mt.start_ms / 1000.0),
           public.excerpt_around(mt.text, (select term from q)), m.contact_id, c.name, m.host_user_id,
           coalesce(m.title, 'Reunião'), coalesce(mt.speaker_label, case when mt.is_seller then 'Vendedor' else 'Cliente' end)
      from public.meeting_transcripts mt
      join public.meetings m on m.id = mt.meeting_id
      left join public.contacts c on c.id = m.contact_id
     where mt.account_id = _account
       and length((select term from q)) >= 2
       and unaccent(mt.text) ilike '%' || unaccent((select term from q)) || '%'
       and (_source is null or _source = 'meeting')
       and (_days is null or mt.created_at >= now() - make_interval(days => _days))
       and (_user is null or m.host_user_id = _user)
    union all
    select 'call'::text, k.id, coalesce(k.started_at, k.created_at),
           public.excerpt_around(k.transcript, (select term from q)), k.contact_id, c.name, k.user_id,
           case when k.direction = 'inbound' then 'Ligação recebida' else 'Ligação feita' end, null
      from public.calls k
      left join public.contacts c on c.id = k.contact_id
     where k.account_id = _account
       and length((select term from q)) >= 2
       and k.transcript is not null
       and unaccent(k.transcript) ilike '%' || unaccent((select term from q)) || '%'
       and (_source is null or _source = 'call')
       and (_days is null or k.created_at >= now() - make_interval(days => _days))
       and (_user is null or k.user_id = _user)
  )
  order by 3 desc
  limit greatest(1, least(coalesce(_limit, 50), 200));
$$;
grant execute on function public.conversation_search(uuid, text, int, text, int, uuid) to authenticated;

-- Menções por termo monitorado e por semana (reuniões + ligações), respeitando a RLS.
create or replace function public.term_mentions(_account uuid, _days int default 90)
returns table (term_id uuid, term text, category text, week date, mentions bigint)
language sql stable security invoker set search_path = public, extensions as $$
  with t as (select id, term, category from public.tracked_terms where account_id = _account),
  texts as (
    select mt.created_at at, mt.text body from public.meeting_transcripts mt
     where mt.account_id = _account and mt.created_at >= now() - make_interval(days => greatest(1, least(_days, 730)))
    union all
    select k.created_at, k.transcript from public.calls k
     where k.account_id = _account and k.transcript is not null
       and k.created_at >= now() - make_interval(days => greatest(1, least(_days, 730)))
  )
  select t.id, t.term, t.category, date_trunc('week', x.at)::date, count(*)
    from t join texts x on unaccent(x.body) ilike '%' || unaccent(t.term) || '%'
   group by 1, 2, 3, 4
   order by 4, 2;
$$;
grant execute on function public.term_mentions(uuid, int) to authenticated;
