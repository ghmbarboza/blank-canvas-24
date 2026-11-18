-- SDR (P5): pontuação preditiva a partir dos ganhos e perdas (regressão logística explicável,
-- treinada no servidor), horário ideal por contato aprendido pelas respostas e roteamento de lead
-- por território, segmento e rodízio. Aditivo e idempotente.

create table if not exists public.lead_score_models (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  trained_at timestamptz not null default now(),
  samples int not null default 0,
  positives int not null default 0,
  weights jsonb not null default '{}'::jsonb,
  metrics jsonb not null default '{}'::jsonb
);
alter table public.lead_score_models enable row level security;
drop policy if exists lead_score_models_select on public.lead_score_models;
create policy lead_score_models_select on public.lead_score_models for select using (public.is_member(account_id));

create table if not exists public.lead_scores (
  contact_id uuid primary key references public.contacts(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  score int check (score is null or score between 0 and 100),
  factors jsonb not null default '[]'::jsonb,
  best_hour smallint check (best_hour is null or best_hour between 0 and 23),
  best_dow smallint check (best_dow is null or best_dow between 0 and 6),
  reply_samples int not null default 0,
  scored_at timestamptz not null default now()
);
create index if not exists lead_scores_account on public.lead_scores (account_id, score desc nulls last);
alter table public.lead_scores enable row level security;
-- Mesma visibilidade do contato (a RLS de contacts vale dentro da subconsulta).
drop policy if exists lead_scores_select on public.lead_scores;
create policy lead_scores_select on public.lead_scores for select
  using (public.is_member(account_id) and exists (select 1 from public.contacts c where c.id = contact_id));

-- Atributos para o modelo. Contagens só até o fechamento do negócio (sem vazar o resultado).
create or replace function public.lead_features(_account uuid, _labeled boolean, _limit int default 5000)
returns table (contact_id uuid, label smallint, source text, has_email boolean, has_phone boolean,
               has_company boolean, company_size text, industry text, platform text, inbound int,
               outbound int, meetings int, forms int, temperature text, age_days int)
language sql stable security definer set search_path = public as $$
  with base as (
    select c.*, d.status deal_status, d.closed_at
      from public.contacts c
      left join lateral (
        select dd.status, dd.closed_at from public.deals dd
         where dd.contact_id = c.id and dd.status in ('won','lost')
         order by dd.closed_at desc nulls last limit 1) d on true
     where c.account_id = _account
       and (_labeled is false or d.status is not null)
     order by c.updated_at desc
     limit greatest(1, least(coalesce(_limit, 5000), 20000))
  )
  select b.id,
         case b.deal_status when 'won' then 1::smallint when 'lost' then 0::smallint else null end,
         coalesce(b.source, 'desconhecida'),
         b.email is not null, b.phone is not null, b.company_id is not null,
         co.size, co.industry,
         (select ch.platform from public.conversations v join public.channels ch on ch.id = v.channel_id
           where v.contact_id = b.id order by v.created_at limit 1),
         (select count(*)::int from public.messages m join public.conversations v on v.id = m.conversation_id
           where v.contact_id = b.id and m.direction = 'in' and m.created_at <= coalesce(b.closed_at, now())),
         (select count(*)::int from public.messages m join public.conversations v on v.id = m.conversation_id
           where v.contact_id = b.id and m.direction = 'out' and not m.is_private and m.created_at <= coalesce(b.closed_at, now())),
         (select count(*)::int from public.meetings mt where mt.contact_id = b.id and mt.scheduled_start <= coalesce(b.closed_at, now())),
         (select count(*)::int from public.form_submissions fs where fs.contact_id = b.id and fs.created_at <= coalesce(b.closed_at, now())),
         b.temperature,
         greatest(0, extract(day from (coalesce(b.closed_at, now()) - b.created_at))::int)
    from base b
    left join public.companies co on co.id = b.company_id;
$$;
revoke all on function public.lead_features(uuid, boolean, int) from public, anon, authenticated;
grant execute on function public.lead_features(uuid, boolean, int) to service_role;

-- Respostas do contato: mensagem recebida até 6 h depois de uma nossa, no fuso da conta.
create or replace function public.contact_reply_times(_account uuid, _days int default 180)
returns table (contact_id uuid, hour smallint, dow smallint, n int)
language sql stable security definer set search_path = public as $$
  with tz as (select coalesce(timezone, 'America/Sao_Paulo') z from public.accounts where id = _account),
  replies as (
    select v.contact_id, m.created_at
      from public.messages m
      join public.conversations v on v.id = m.conversation_id
     where m.account_id = _account and m.direction = 'in' and v.contact_id is not null
       and m.created_at >= now() - make_interval(days => greatest(1, least(coalesce(_days, 180), 730)))
       and exists (select 1 from public.messages o
                    where o.conversation_id = m.conversation_id and o.direction = 'out' and not o.is_private
                      and o.created_at < m.created_at and o.created_at > m.created_at - interval '6 hours')
  )
  select r.contact_id,
         extract(hour from (r.created_at at time zone (select z from tz)))::smallint,
         extract(dow from (r.created_at at time zone (select z from tz)))::smallint,
         count(*)::int
    from replies r
   group by 1, 2, 3;
$$;
revoke all on function public.contact_reply_times(uuid, int) from public, anon, authenticated;
grant execute on function public.contact_reply_times(uuid, int) to service_role;

-- Horário ideal para cadências (lê o que o servidor aprendeu).
create or replace function public.best_contact_hour(_contact uuid)
returns smallint language sql stable security invoker set search_path = public as $$
  select best_hour from public.lead_scores where contact_id = _contact;
$$;
grant execute on function public.best_contact_hour(uuid) to authenticated, service_role;

-- ───────────────────────── roteamento de lead ─────────────────────────
-- match = {"states":["SP"],"cities":[],"segments":["saúde"],"sources":["form"],"sizes":[]}
create table if not exists public.lead_routing_rules (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  position int not null default 0,
  is_active boolean not null default true,
  match jsonb not null default '{}'::jsonb check (jsonb_typeof(match) = 'object'),
  mode text not null default 'round_robin' check (mode in ('user','round_robin')),
  user_ids uuid[] not null default '{}',
  rr_cursor int not null default 0,
  routed_count int not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists lead_routing_rules_account on public.lead_routing_rules (account_id, position);
drop trigger if exists lead_routing_rules_touch on public.lead_routing_rules;
create trigger lead_routing_rules_touch before update on public.lead_routing_rules for each row execute function public.touch_updated_at();
alter table public.lead_routing_rules enable row level security;
drop policy if exists lead_routing_rules_select on public.lead_routing_rules;
create policy lead_routing_rules_select on public.lead_routing_rules for select using (public.is_member(account_id));
drop policy if exists lead_routing_rules_write on public.lead_routing_rules;
create policy lead_routing_rules_write on public.lead_routing_rules for all
  using (public.is_manager(account_id)) with check (public.is_manager(account_id));

-- Avança o rodízio de forma atômica e devolve o cursor usado.
create or replace function public.lead_route_bump(_rule uuid) returns int
language sql security definer set search_path = public as $$
  update public.lead_routing_rules set rr_cursor = rr_cursor + 1, routed_count = routed_count + 1
   where id = _rule returning rr_cursor - 1;
$$;
revoke all on function public.lead_route_bump(uuid) from public, anon, authenticated;
grant execute on function public.lead_route_bump(uuid) to service_role;
