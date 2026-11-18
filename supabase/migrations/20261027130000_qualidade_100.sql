-- Qualidade em 100% das interações (P8): formulário cadastrável, nota da IA com trecho como prova,
-- calibração do gestor e contestação do atendente. Aditivo e idempotente.

-- ───────────────────────── configuração por conta ─────────────────────────
create table if not exists public.quality_settings (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  enabled boolean not null default true,
  monthly_budget_usd numeric(10,2) not null default 20 check (monthly_budget_usd between 0 and 100000),
  daily_max int not null default 500 check (daily_max between 0 and 100000),
  model_anthropic text not null default 'claude-haiku-5-5' check (length(model_anthropic) between 1 and 80),
  model_openai text not null default 'gpt-5.4-mini' check (length(model_openai) between 1 and 80),
  idle_hours int not null default 12 check (idle_hours between 1 and 168),
  min_messages int not null default 2 check (min_messages between 1 and 50),
  include_ai boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.quality_settings enable row level security;
drop policy if exists quality_settings_select on public.quality_settings;
create policy quality_settings_select on public.quality_settings for select using (public.is_member(account_id));
drop policy if exists quality_settings_write on public.quality_settings;
create policy quality_settings_write on public.quality_settings for all
  using (public.is_manager(account_id)) with check (public.is_manager(account_id));

-- ───────────────────────── formulários de qualidade ─────────────────────────
-- criteria = [{id, label, description, weight (1-10), eliminatory (bool)}]
create table if not exists public.quality_forms (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  description text,
  channels text[] not null default array['call','chat','email']::text[]
    check (channels <@ array['call','chat','email']::text[] and cardinality(channels) > 0),
  include_ai boolean not null default true,
  is_active boolean not null default true,
  criteria jsonb not null default '[]'::jsonb check (jsonb_typeof(criteria) = 'array'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists quality_forms_account on public.quality_forms (account_id, is_active);
drop trigger if exists quality_forms_touch on public.quality_forms;
create trigger quality_forms_touch before update on public.quality_forms for each row execute function public.touch_updated_at();
alter table public.quality_forms enable row level security;
drop policy if exists quality_forms_select on public.quality_forms;
create policy quality_forms_select on public.quality_forms for select using (public.is_member(account_id));
drop policy if exists quality_forms_write on public.quality_forms;
create policy quality_forms_write on public.quality_forms for all
  using (public.is_manager(account_id)) with check (public.is_manager(account_id));

-- ───────────────────────── avaliações ─────────────────────────
-- items = [{criterion_id, label, weight, eliminatory, score (0-100), passed, evidence, comment}]
create table if not exists public.quality_evaluations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  form_id uuid references public.quality_forms(id) on delete set null,
  form_name text,
  source text not null check (source in ('conversation','call')),
  source_id uuid not null,
  channel text not null check (channel in ('call','chat','email')),
  interaction_start timestamptz,
  interaction_end timestamptz not null,
  agent_user_id uuid references auth.users(id) on delete set null,
  is_ai boolean not null default false,
  contact_id uuid references public.contacts(id) on delete set null,
  status text not null default 'done' check (status in ('done','error','skipped')),
  score numeric(5,1) check (score is null or score between 0 and 100),
  ai_score numeric(5,1) check (ai_score is null or ai_score between 0 and 100),
  eliminated boolean not null default false,
  items jsonb not null default '[]'::jsonb,
  summary text,
  model text,
  cost_usd numeric(10,5) not null default 0,
  error text,
  revised boolean not null default false,
  created_at timestamptz not null default now(),
  unique (account_id, source, source_id, interaction_end)
);
create index if not exists quality_evaluations_account on public.quality_evaluations (account_id, created_at desc);
create index if not exists quality_evaluations_agent on public.quality_evaluations (account_id, agent_user_id, created_at desc);
create index if not exists quality_evaluations_source on public.quality_evaluations (source, source_id, interaction_end desc);
alter table public.quality_evaluations enable row level security;
-- Gestor vê todas; o atendente vê as próprias. Escrita só pelo servidor.
drop policy if exists quality_evaluations_select on public.quality_evaluations;
create policy quality_evaluations_select on public.quality_evaluations for select
  using (public.is_member(account_id) and (public.is_manager(account_id) or agent_user_id = auth.uid()));

create table if not exists public.quality_calibrations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  evaluation_id uuid not null references public.quality_evaluations(id) on delete cascade,
  reviewer_user_id uuid not null references auth.users(id) on delete cascade,
  items jsonb not null default '[]'::jsonb,
  score numeric(5,1),
  agreement numeric(5,1) check (agreement is null or agreement between 0 and 100),
  notes text,
  created_at timestamptz not null default now(),
  unique (evaluation_id, reviewer_user_id)
);
create index if not exists quality_calibrations_account on public.quality_calibrations (account_id, created_at desc);
alter table public.quality_calibrations enable row level security;
drop policy if exists quality_calibrations_select on public.quality_calibrations;
create policy quality_calibrations_select on public.quality_calibrations for select using (public.is_manager(account_id));

create table if not exists public.quality_disputes (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  evaluation_id uuid not null references public.quality_evaluations(id) on delete cascade,
  agent_user_id uuid not null references auth.users(id) on delete cascade,
  criterion_id text,
  reason text not null check (length(trim(reason)) between 3 and 2000),
  status text not null default 'open' check (status in ('open','accepted','rejected')),
  decision_note text,
  new_score numeric(5,1) check (new_score is null or new_score between 0 and 100),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists quality_disputes_one_open on public.quality_disputes (evaluation_id) where status = 'open';
create index if not exists quality_disputes_account on public.quality_disputes (account_id, status, created_at desc);
alter table public.quality_disputes enable row level security;
drop policy if exists quality_disputes_select on public.quality_disputes;
create policy quality_disputes_select on public.quality_disputes for select
  using (public.is_member(account_id) and (public.is_manager(account_id) or agent_user_id = auth.uid()));

-- ───────────────────────── fila do avaliador ─────────────────────────
-- Interações terminadas e ainda sem nota. Conversa: fechada ou parada há idle_hours, com mensagens
-- novas desde a última avaliação. Ligação: concluída e transcrita. Só contas com formulário ativo.
create or replace function public.quality_pending(_limit int default 30)
returns table (account_id uuid, source text, source_id uuid, interaction_start timestamptz, interaction_end timestamptz)
language sql stable security definer set search_path = public as $$
  with accs as (
    select a.id, coalesce(s.idle_hours, 12) idle, coalesce(s.min_messages, 2) min_msgs
      from public.accounts a
      left join public.quality_settings s on s.account_id = a.id
     where coalesce(s.enabled, true)
       and exists (select 1 from public.quality_forms f where f.account_id = a.id and f.is_active)
  ),
  conv as (
    select c.account_id, 'conversation'::text src, c.id sid,
           (select max(e.interaction_end) from public.quality_evaluations e
             where e.source = 'conversation' and e.source_id = c.id) prev_end,
           c.last_message_at last_at, x.min_msgs
      from public.conversations c
      join accs x on x.id = c.account_id
     where not c.is_group
       and c.last_message_at is not null
       and c.last_message_at > now() - interval '7 days'
       and (c.status = 'closed' or c.last_message_at < now() - make_interval(hours => x.idle))
  ),
  conv_ready as (
    select v.account_id, v.src, v.sid, v.prev_end, v.last_at
      from conv v
     where v.last_at > coalesce(v.prev_end, '-infinity'::timestamptz)
       and (select count(*) from public.messages m
             where m.conversation_id = v.sid and not m.is_private
               and m.created_at > coalesce(v.prev_end, '-infinity'::timestamptz)) >= v.min_msgs
       and exists (select 1 from public.messages m
             where m.conversation_id = v.sid and not m.is_private and m.direction = 'out'
               and m.created_at > coalesce(v.prev_end, '-infinity'::timestamptz))
  ),
  calls_ready as (
    select k.account_id, 'call'::text src, k.id sid, k.started_at st, coalesce(k.ended_at, k.updated_at) en
      from public.calls k
      join accs x on x.id = k.account_id
     where k.status = 'completed' and k.transcript is not null and length(k.transcript) >= 40
       and k.created_at > now() - interval '7 days'
       and not exists (select 1 from public.quality_evaluations e where e.source = 'call' and e.source_id = k.id)
  )
  select * from (
    select account_id, src, sid, prev_end, last_at from conv_ready
    union all
    select account_id, src, sid, st, en from calls_ready
  ) u
  limit greatest(1, least(coalesce(_limit, 30), 200));
$$;
revoke all on function public.quality_pending(int) from public, anon, authenticated;
grant execute on function public.quality_pending(int) to service_role;

-- Gasto do avaliador no mês e avaliações de hoje (teto de custo por conta).
create or replace function public.quality_spend(_account uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'month_usd', coalesce((select sum(cost_usd) from public.quality_evaluations
                            where account_id = _account and created_at >= date_trunc('month', now())), 0),
    'today', (select count(*) from public.quality_evaluations
               where account_id = _account and created_at >= date_trunc('day', now()) and status <> 'skipped')
  )
  where auth.role() = 'service_role' or public.is_member(_account);
$$;
grant execute on function public.quality_spend(uuid) to authenticated, service_role;

-- Painel: média, eliminadas, por canal, por atendente, critérios que mais derrubam, concordância.
create or replace function public.quality_overview(_account uuid, _days int default 30)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare _since timestamptz := now() - make_interval(days => greatest(1, least(coalesce(_days, 30), 365)));
begin
  if not public.is_member(_account) then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'evaluated', (select count(*) from public.quality_evaluations where account_id = _account and status = 'done' and created_at >= _since),
    'avg_score', (select round(avg(score), 1) from public.quality_evaluations where account_id = _account and status = 'done' and created_at >= _since),
    'eliminated', (select count(*) from public.quality_evaluations where account_id = _account and status = 'done' and eliminated and created_at >= _since),
    'errors', (select count(*) from public.quality_evaluations where account_id = _account and status = 'error' and created_at >= _since),
    'skipped', (select count(*) from public.quality_evaluations where account_id = _account and status = 'skipped' and created_at >= _since),
    'cost_usd', (select coalesce(sum(cost_usd), 0) from public.quality_evaluations where account_id = _account and created_at >= _since),
    'by_channel', coalesce((select jsonb_object_agg(channel, jsonb_build_object('n', n, 'avg', a)) from (
        select channel, count(*) n, round(avg(score), 1) a from public.quality_evaluations
         where account_id = _account and status = 'done' and created_at >= _since group by channel) s), '{}'::jsonb),
    'by_agent', coalesce((select jsonb_agg(jsonb_build_object('user_id', agent_user_id, 'is_ai', is_ai, 'n', n, 'avg', a, 'eliminated', el) order by a nulls last) from (
        select agent_user_id, is_ai, count(*) n, round(avg(score), 1) a, count(*) filter (where eliminated) el
          from public.quality_evaluations
         where account_id = _account and status = 'done' and created_at >= _since
         group by agent_user_id, is_ai) s), '[]'::jsonb),
    'weak', coalesce((select jsonb_agg(w order by (w->>'fails')::int desc, (w->>'avg')::numeric) from (
        select jsonb_build_object('criterion_id', i->>'criterion_id', 'label', max(i->>'label'),
                 'fails', count(*) filter (where (i->>'passed')::boolean is false),
                 'avg', round(avg((i->>'score')::numeric), 1), 'n', count(*)) w
          from public.quality_evaluations e, jsonb_array_elements(e.items) i
         where e.account_id = _account and e.status = 'done' and e.created_at >= _since
         group by i->>'criterion_id' limit 50) z), '[]'::jsonb),
    'agreement', (select round(avg(agreement), 1) from public.quality_calibrations where account_id = _account and created_at >= _since),
    'calibrations', (select count(*) from public.quality_calibrations where account_id = _account and created_at >= _since),
    'disputes_open', (select count(*) from public.quality_disputes where account_id = _account and status = 'open')
  );
end $$;
grant execute on function public.quality_overview(uuid, int) to authenticated;

-- Trechos que mais derrubam um critério (para virar cenário de treino).
create or replace function public.quality_weak_evidence(_account uuid, _criterion text, _days int default 30, _limit int default 5)
returns table (evaluation_id uuid, evidence text, comment text, score numeric)
language sql stable security invoker set search_path = public as $$
  select e.id, i->>'evidence', i->>'comment', (i->>'score')::numeric
    from public.quality_evaluations e, jsonb_array_elements(e.items) i
   where e.account_id = _account and e.status = 'done'
     and e.created_at >= now() - make_interval(days => greatest(1, least(coalesce(_days, 30), 365)))
     and i->>'criterion_id' = _criterion and (i->>'passed')::boolean is false
     and coalesce(i->>'evidence', '') <> ''
   order by (i->>'score')::numeric nulls first, e.created_at desc
   limit greatest(1, least(coalesce(_limit, 5), 20));
$$;
grant execute on function public.quality_weak_evidence(uuid, text, int, int) to authenticated;
