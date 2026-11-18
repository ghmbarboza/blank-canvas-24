-- Frente C (relatórios): receita recorrente (MRR), verba de mídia por mês/canal (custo por lead) e o
-- painel de operação (nível de serviço, ocupação, NPS/CSAT do período e custo por conversa/ligação).
-- Leituras security invoker: a RLS de cada tabela vale (custos do usage_ledger só aparecem para gestor).

-- ───────────────────────── verba de mídia informada à mão ─────────────────────────
create table if not exists public.ad_spend (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  channel text not null check (length(trim(channel)) between 1 and 60),
  amount numeric(14,2) not null check (amount >= 0),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, month, channel)
);
drop trigger if exists ad_spend_touch on public.ad_spend;
create trigger ad_spend_touch before update on public.ad_spend for each row execute function public.touch_updated_at();
alter table public.ad_spend enable row level security;
drop policy if exists ad_spend_select on public.ad_spend;
create policy ad_spend_select on public.ad_spend for select using (public.is_manager(account_id));
drop policy if exists ad_spend_write on public.ad_spend;
create policy ad_spend_write on public.ad_spend for all using (public.is_manager(account_id)) with check (public.is_manager(account_id));

-- Mesma origem do relatório de atribuição (primeiro toque), em minúsculas para casar com o canal da verba.
create or replace function public.lead_source(_c public.contacts) returns text
language sql immutable as $$
  select lower(coalesce(nullif(_c.first_touch->>'source', ''), nullif(_c.custom->>'utm_source', ''), nullif(_c.source, ''), 'direto'));
$$;

-- ───────────────────────── MRR ─────────────────────────
-- Fonte: proposta aceita com cobrança mensal/anual (monthly_total + yearly_total/12). Negócio sem proposta
-- recorrente usa a assinatura do Asaas (payments.kind = subscription). Cada nova proposta aceita no mesmo
-- negócio vira expansão (ou redução). Churn: negócio que tinha receita e foi para perdido, ou assinatura
-- toda cancelada/estornada.
create or replace function public.report_mrr(_account uuid, _months int default 12)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare _n int := greatest(1, least(coalesce(_months, 12), 36)); _out jsonb;
begin
  perform public.report_guard(_account);
  with acc as (
    select p.deal_id::text k, p.deal_id, p.accepted_at as at, round(p.monthly_total + p.yearly_total / 12.0, 2) mrr, p.yearly_total > 0 yearly
      from public.proposals p
     where p.account_id = _account and p.status = 'accepted' and p.accepted_at is not null
       and (p.monthly_total > 0 or p.yearly_total > 0)
  ),
  subs as (
    select s.asaas_subscription_id k, s.deal_id, min(s.created_at) as at,
           (array_agg(case when s.cycle = 'YEARLY' then round(s.amount / 12.0, 2) else s.amount end order by s.created_at desc))[1] mrr,
           bool_or(s.cycle = 'YEARLY') yearly,
           case when bool_and(s.status in ('canceled','refunded')) then max(s.updated_at) end canceled_at
      from public.payments s
     where s.account_id = _account and s.kind = 'subscription' and s.asaas_subscription_id is not null
     group by 1, 2
  ),
  steps as (
    select k, deal_id, at, mrr, yearly from acc
    union all
    select coalesce(s.deal_id::text, s.k), s.deal_id, s.at, s.mrr, s.yearly from subs s
     where s.deal_id is null or not exists (select 1 from acc a where a.deal_id = s.deal_id)
  ),
  st as (select *, lag(mrr) over (partition by k order by at) prev from steps),
  streams as (
    select k, min(deal_id::text)::uuid deal_id, min(at) started_at from st group by k
  ),
  churned as (
    select s.k,
           coalesce(
             (select sb.canceled_at from subs sb where sb.k = s.k or sb.deal_id = s.deal_id order by sb.canceled_at desc nulls last limit 1),
             (select d.updated_at from public.deals d where d.id = s.deal_id and d.status = 'lost')
           ) churn_at
      from streams s
  ),
  life as (
    select s.k, s.deal_id, s.started_at, case when c.churn_at > s.started_at then c.churn_at end churn_at
      from streams s left join churned c on c.k = s.k
  ),
  months as (
    select m::date m, (m + interval '1 month') e
      from generate_series(date_trunc('month', now()) - make_interval(months => _n - 1), date_trunc('month', now()), interval '1 month') m
  ),
  series as (
    select to_char(mo.m, 'YYYY-MM') as month,
      coalesce((select sum(x.mrr) from life l cross join lateral (
          select st.mrr from st where st.k = l.k and st.at < mo.e order by st.at desc limit 1) x
        where l.churn_at is null or l.churn_at >= mo.e), 0) as mrr,
      coalesce((select sum(mrr) from st where prev is null and at >= mo.m and at < mo.e), 0) as new,
      coalesce((select sum(mrr - prev) from st where prev is not null and mrr > prev and at >= mo.m and at < mo.e), 0) as expansion,
      coalesce((select sum(prev - mrr) from st where prev is not null and mrr < prev and at >= mo.m and at < mo.e), 0) as contraction,
      coalesce((select sum(x.mrr) from life l cross join lateral (
          select st.mrr from st where st.k = l.k and st.at <= l.churn_at order by st.at desc limit 1) x
        where l.churn_at >= mo.m and l.churn_at < mo.e), 0) as churn
      from months mo
  ),
  active as (
    select l.k, l.deal_id, l.started_at, x.mrr, x.yearly, x.at
      from life l cross join lateral (select st.mrr, st.yearly, st.at from st where st.k = l.k order by st.at desc limit 1) x
     where l.churn_at is null
  ),
  renewals as (
    select a.*, (a.at + make_interval(years => (date_part('year', age(now(), a.at)))::int + 1))::date renew_on
      from active a where a.yearly
  )
  select jsonb_build_object(
    'current_mrr', coalesce((select sum(mrr) from active), 0),
    'active_customers', (select count(*) from active),
    'months', coalesce((select jsonb_agg(to_jsonb(s) order by s.month) from series s), '[]'::jsonb),
    'top', coalesce((select jsonb_agg(jsonb_build_object('deal_id', a.deal_id, 'title', coalesce(d.title, 'Assinatura sem negócio'),
                       'contact', c.name, 'mrr', a.mrr, 'since', a.started_at) order by a.mrr desc)
                     from (select * from active order by mrr desc limit 10) a
                     left join public.deals d on d.id = a.deal_id left join public.contacts c on c.id = d.contact_id), '[]'::jsonb),
    'renewals', coalesce((select jsonb_agg(jsonb_build_object('deal_id', r.deal_id, 'title', coalesce(d.title, 'Assinatura sem negócio'),
                            'contact', c.name, 'mrr', r.mrr, 'renew_on', r.renew_on) order by r.renew_on)
                          from renewals r left join public.deals d on d.id = r.deal_id left join public.contacts c on c.id = d.contact_id
                         where r.renew_on <= current_date + 90), '[]'::jsonb)
  ) into _out;
  return _out;
end $$;
revoke all on function public.report_mrr(uuid, int) from public, anon;
grant execute on function public.report_mrr(uuid, int) to authenticated, service_role;

-- ───────────────────────── operação: serviço, satisfação e custos ─────────────────────────
create or replace function public.report_ops(_account uuid, _from date, _to date)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare _s timestamptz := _from::timestamptz; _e timestamptz := (_to + 1)::timestamptz; _sla int; _days int; _out jsonb;
begin
  perform public.report_guard(_account);
  select coalesce(min(sla_seconds), 20) into _sla from public.call_queues where account_id = _account;
  -- dias úteis do período (até hoje) para a ocupação estimada em 8 h por dia
  select count(*) into _days from generate_series(_from, least(_to, current_date), interval '1 day') d where extract(isodow from d) < 6;
  with calls_p as (
    select * from public.calls where account_id = _account and started_at >= _s and started_at < _e
  ),
  inbound as (select * from calls_p where direction = 'inbound' and voice_agent_id is null),
  usage as (
    select kind, coalesce(meta->>'purpose', '') purpose, cost_usd from public.usage_ledger
     where account_id = _account and created_at >= _s and created_at < _e
  ),
  leads as (
    select date_trunc('month', c.created_at)::date m, public.lead_source(c) src from public.contacts c
     where c.account_id = _account and c.created_at >= date_trunc('month', _s) and c.created_at < date_trunc('month', _to::timestamptz) + interval '1 month'
  ),
  spend as (
    select lower(trim(channel)) src, sum(amount) amount from public.ad_spend
     where account_id = _account and month >= date_trunc('month', _s)::date and month <= date_trunc('month', _to::timestamptz)::date
     group by 1
  )
  select jsonb_build_object(
    'service', jsonb_build_object(
      'sla_seconds', _sla,
      'inbound', (select count(*) from inbound),
      'answered', (select count(*) from inbound where answered_at is not null),
      'abandoned', (select count(*) from inbound where answered_at is null and status in ('missed','no_answer','canceled')),
      'service_level', (select case when count(*) = 0 then null else round(100.0 * count(*) filter (
                          where answered_at is not null and answered_at - started_at <= make_interval(secs => _sla)) / count(*)) end from inbound),
      'avg_wait_seconds', (select round(avg(extract(epoch from answered_at - started_at))) from inbound where answered_at is not null),
      'avg_talk_seconds', (select round(avg(coalesce(billseconds, duration_seconds))) from calls_p where answered_at is not null and voice_agent_id is null),
      'business_days', _days,
      'daily', coalesce((select jsonb_agg(jsonb_build_object('day', d, 'level', lvl, 'calls', n) order by d) from (
          select to_char(started_at, 'YYYY-MM-DD') d, count(*) n,
                 round(100.0 * count(*) filter (where answered_at is not null and answered_at - started_at <= make_interval(secs => _sla)) / count(*)) lvl
            from inbound group by 1) x), '[]'::jsonb),
      'agents', coalesce((select jsonb_agg(jsonb_build_object('user_id', user_id, 'name', coalesce(p.full_name, 'Sem nome'), 'calls', n,
                            'talk_minutes', round(secs / 60.0), 'occupancy', case when _days = 0 then null else round(100.0 * secs / (_days * 8 * 3600.0), 1) end)
                            order by secs desc)
          from (select user_id, count(*) n, coalesce(sum(coalesce(billseconds, duration_seconds)), 0) secs from calls_p
                 where user_id is not null and answered_at is not null and voice_agent_id is null group by 1) a
          left join public.profiles p on p.id = a.user_id), '[]'::jsonb)
    ),
    'satisfaction', jsonb_build_object(
      'csat_avg', (select round(avg(score)::numeric, 2) from public.csat_responses where account_id = _account and answered_at >= _s and answered_at < _e),
      'csat_responses', (select count(*) from public.csat_responses where account_id = _account and answered_at >= _s and answered_at < _e),
      'csat_sent', (select count(*) from public.csat_responses where account_id = _account and sent_at >= _s and sent_at < _e),
      'csat_dist', coalesce((select jsonb_object_agg(score, n) from (select score, count(*) n from public.csat_responses
                    where account_id = _account and answered_at >= _s and answered_at < _e and score is not null group by 1) x), '{}'::jsonb),
      'nps_promoters', (select count(*) from public.nps_responses where account_id = _account and answered_at >= _s and answered_at < _e and score >= 9),
      'nps_passives', (select count(*) from public.nps_responses where account_id = _account and answered_at >= _s and answered_at < _e and score between 7 and 8),
      'nps_detractors', (select count(*) from public.nps_responses where account_id = _account and answered_at >= _s and answered_at < _e and score <= 6)
    ),
    'costs', jsonb_build_object(
      'by_kind', coalesce((select jsonb_object_agg(kind, c) from (select kind, round(sum(cost_usd), 4) c from usage group by 1) x), '{}'::jsonb),
      'conversation_usd', (select round(coalesce(sum(cost_usd), 0), 4) from usage
                            where kind = 'whatsapp_template' or (kind = 'llm' and purpose not like 'call%' and purpose not like 'voice%'
                                  and purpose not like 'meeting%' and purpose <> 'embedding')),
      'call_usd', (select round(coalesce(sum(cost_usd), 0), 4) from usage
                    where kind in ('phone_min','voice_ai_min','transcription_min') or (kind = 'llm' and (purpose like 'call%' or purpose like 'voice%'))),
      'conversations', (select count(*) from public.conversations where account_id = _account and last_message_at >= _s and created_at < _e),
      'calls', (select count(*) from calls_p)
    ),
    'leads', jsonb_build_object(
      'total', (select count(*) from leads),
      'months_from', to_char(date_trunc('month', _s), 'YYYY-MM'),
      'months_to', to_char(date_trunc('month', _to::timestamptz), 'YYYY-MM'),
      'by_channel', coalesce((select jsonb_agg(jsonb_build_object('channel', src, 'leads', l, 'spend', sp) order by sp desc nulls last, l desc) from (
          select coalesce(a.src, b.src) src, coalesce(a.l, 0) l, b.amount sp
            from (select src, count(*) l from leads group by 1) a full join spend b on b.src = a.src) x), '[]'::jsonb)
    )
  ) into _out;
  return _out;
end $$;
revoke all on function public.report_ops(uuid, date, date) from public, anon;
grant execute on function public.report_ops(uuid, date, date) to authenticated, service_role;
