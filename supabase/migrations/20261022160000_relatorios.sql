-- Relatórios, forecast e BI. Todas as agregações são security invoker: a RLS de cada tabela vale
-- (o vendedor vê os números dos negócios dele; o gestor vê a conta). Service role (jobs) passa direto.

create or replace function public.report_guard(_account uuid) returns void
language plpgsql stable as $$
begin
  if auth.role() <> 'service_role' and not public.is_member(_account) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end $$;

-- ───────────────────────── vendas ─────────────────────────
create or replace function public.report_sales(_account uuid, _from date, _to date, _pipeline uuid default null)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare _p uuid := _pipeline; _s timestamptz; _e timestamptz; _out jsonb;
begin
  perform public.report_guard(_account);
  _s := _from::timestamptz; _e := (_to + 1)::timestamptz;
  if _p is null then
    select id into _p from public.pipelines where account_id = _account order by is_default desc, position limit 1;
  end if;
  with created as (
    select d.*, st.position as stage_pos from public.deals d join public.pipeline_stages st on st.id = d.stage_id
    where d.account_id = _account and d.pipeline_id = _p and d.created_at >= _s and d.created_at < _e
  ),
  stages as (
    select st.id, st.name, st.position, st.kind, st.probability, st.color from public.pipeline_stages st
    where st.pipeline_id = _p order by st.position
  ),
  closed as (
    select d.* from public.deals d where d.account_id = _account and d.closed_at >= _s and d.closed_at < _e
      and (_pipeline is null or d.pipeline_id = _pipeline)
  )
  select jsonb_build_object(
    'pipeline_id', _p,
    'funnel', coalesce((select jsonb_agg(jsonb_build_object(
        'stage_id', s.id, 'name', s.name, 'kind', s.kind, 'probability', s.probability, 'color', s.color,
        'reached', (select count(*) from created c where (s.kind = 'open' and ((c.status = 'open' and c.stage_pos >= s.position) or c.status = 'won'
                                                     or (c.status = 'lost' and s.position = (select min(s2.position) from stages s2))))
                                                  or (s.kind = 'won' and c.status = 'won') or (s.kind = 'lost' and c.status = 'lost')),
        'current_count', (select count(*) from public.deals d where d.stage_id = s.id and d.status = 'open'),
        'current_value', (select coalesce(sum(d.value), 0) from public.deals d where d.stage_id = s.id and d.status = 'open')
      ) order by s.position) from stages s), '[]'::jsonb),
    'totals', (select jsonb_build_object(
        'created', (select count(*) from created),
        'won', count(*) filter (where status = 'won'),
        'lost', count(*) filter (where status = 'lost'),
        'won_value', coalesce(sum(value) filter (where status = 'won'), 0),
        'avg_ticket', coalesce(round(avg(value) filter (where status = 'won'), 2), 0),
        'win_rate', case when count(*) > 0 then round(100.0 * count(*) filter (where status = 'won') / count(*), 1) else null end,
        'avg_cycle_days', round(avg(extract(epoch from (closed_at - created_at)) / 86400) filter (where status = 'won'), 1))
      from closed),
    'lost_reasons', coalesce((select jsonb_agg(jsonb_build_object('reason', r, 'count', n, 'value', v) order by n desc)
        from (select coalesce(nullif(trim(lost_reason), ''), 'Sem motivo informado') r, count(*) n, coalesce(sum(value), 0) v
              from closed where status = 'lost' group by 1) x), '[]'::jsonb),
    'by_owner', coalesce((select jsonb_agg(jsonb_build_object('user_id', o, 'name', coalesce(m.display_name, pr.full_name, 'Sem dono'),
          'won', w, 'won_value', wv, 'lost', l,
          'open_value', (select coalesce(sum(d.value), 0) from public.deals d where d.account_id = _account and d.status = 'open' and d.owner_user_id is not distinct from o))
        order by wv desc)
        from (select owner_user_id o, count(*) filter (where status = 'won') w, coalesce(sum(value) filter (where status = 'won'), 0) wv,
                     count(*) filter (where status = 'lost') l from closed group by 1) x
        left join public.memberships m on m.account_id = _account and m.user_id = x.o
        left join public.profiles pr on pr.id = x.o), '[]'::jsonb),
    'by_product', coalesce((select jsonb_agg(jsonb_build_object('name', n, 'quantity', q, 'revenue', r) order by r desc)
        from (select i.name n, sum(i.quantity) q, sum(i.line_total) r from public.deal_items i
              join closed c on c.id = i.deal_id where c.status = 'won' and i.status = 'accepted' group by 1 limit 30) x), '[]'::jsonb),
    'monthly', coalesce((select jsonb_agg(jsonb_build_object('month', to_char(mo, 'YYYY-MM'),
          'created', (select count(*) from public.deals d where d.account_id = _account and date_trunc('month', d.created_at) = mo),
          'won', (select count(*) from public.deals d where d.account_id = _account and d.status = 'won' and date_trunc('month', d.closed_at) = mo),
          'won_value', (select coalesce(sum(d.value), 0) from public.deals d where d.account_id = _account and d.status = 'won' and date_trunc('month', d.closed_at) = mo))
        order by mo)
        from generate_series(date_trunc('month', now()) - interval '11 months', date_trunc('month', now()), interval '1 month') mo), '[]'::jsonb)
  ) into _out;
  return _out;
end $$;
grant execute on function public.report_sales(uuid, date, date, uuid) to authenticated, service_role;

-- ───────────────────────── forecast ─────────────────────────
create table if not exists public.forecast_snapshots (
  id bigserial primary key,
  account_id uuid not null references public.accounts(id) on delete cascade,
  taken_on date not null default current_date,
  month date not null,
  user_id uuid,
  pipeline numeric(16,2) not null default 0,
  weighted numeric(16,2) not null default 0,
  commit_value numeric(16,2) not null default 0,
  best_case numeric(16,2) not null default 0,
  deals int not null default 0
);
create unique index if not exists forecast_snapshots_key on public.forecast_snapshots
  (account_id, taken_on, month, coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid));
alter table public.forecast_snapshots enable row level security;
drop policy if exists forecast_snapshots_select on public.forecast_snapshots;
create policy forecast_snapshots_select on public.forecast_snapshots for select
  using (public.is_member(account_id) and (public.is_manager(account_id) or user_id = auth.uid()));

create or replace function public.report_forecast(_account uuid, _months int default 3)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare _out jsonb; _n int := greatest(1, least(coalesce(_months, 3), 12));
begin
  perform public.report_guard(_account);
  with open_deals as (
    select d.id, d.title, d.value, d.owner_user_id, d.expected_close_date, d.updated_at, d.contact_id,
           coalesce(st.probability, 0) prob, coalesce(d.custom->>'forecast_category', 'pipeline') cat,
           date_trunc('month', d.expected_close_date)::date mo
    from public.deals d left join public.pipeline_stages st on st.id = d.stage_id
    where d.account_id = _account and d.status = 'open'
  ),
  months as (
    select generate_series(date_trunc('month', now())::date, (date_trunc('month', now()) + make_interval(months => _n - 1))::date, interval '1 month')::date mo
  )
  select jsonb_build_object(
    'months', coalesce((select jsonb_agg(jsonb_build_object('month', to_char(z.mo, 'YYYY-MM'), 'pipeline', z.p, 'weighted', z.w,
        'commit', z.c, 'best_case', z.b, 'deals', z.n,
        'won', (select coalesce(sum(d.value), 0) from public.deals d where d.account_id = _account and d.status = 'won' and date_trunc('month', d.closed_at)::date = z.mo))
      order by z.mo) from (select m.mo, coalesce(sum(o.value), 0) p, coalesce(round(sum(o.value * o.prob / 100.0), 2), 0) w,
        coalesce(sum(o.value) filter (where o.cat = 'commit'), 0) c,
        coalesce(sum(o.value) filter (where o.cat in ('commit', 'best_case')), 0) b, count(o.id) n
        from months m left join open_deals o on o.mo = m.mo group by m.mo) z), '[]'::jsonb),
    'overdue', (select jsonb_build_object('deals', count(*), 'value', coalesce(sum(value), 0)) from open_deals where expected_close_date < current_date),
    'undated', (select jsonb_build_object('deals', count(*), 'value', coalesce(sum(value), 0)) from open_deals where expected_close_date is null),
    'by_owner', coalesce((select jsonb_agg(jsonb_build_object('user_id', x.o, 'name', coalesce(m.display_name, pr.full_name, 'Sem dono'),
        'pipeline', x.p, 'weighted', x.w, 'commit', x.c, 'best_case', x.b) order by x.w desc)
      from (select owner_user_id o, sum(value) p, round(sum(value * prob / 100.0), 2) w,
                   coalesce(sum(value) filter (where cat = 'commit'), 0) c,
                   coalesce(sum(value) filter (where cat in ('commit', 'best_case')), 0) b
            from open_deals where mo is not null and mo < (date_trunc('month', now()) + make_interval(months => _n))::date group by 1) x
      left join public.memberships m on m.account_id = _account and m.user_id = x.o
      left join public.profiles pr on pr.id = x.o), '[]'::jsonb),
    'risks', coalesce((select jsonb_agg(r order by (r->>'value')::numeric desc) from (
        select jsonb_build_object('id', o.id, 'title', o.title, 'value', o.value, 'owner_user_id', o.owner_user_id,
          'expected_close_date', o.expected_close_date, 'category', o.cat,
          'flags', to_jsonb(array_remove(array[
            case when o.updated_at < now() - interval '14 days' then 'parado' end,
            case when o.expected_close_date < current_date then 'data_vencida' end,
            case when not exists (select 1 from public.activities a where a.deal_id = o.id and a.done_at is null) then 'sem_proximo_passo' end,
            case when c.temperature = 'cold' then 'cliente_frio' end,
            case when coalesce(c.score, 100) < 30 then 'score_baixo' end
          ], null))) r
        from open_deals o left join public.contacts c on c.id = o.contact_id
        where o.updated_at < now() - interval '14 days' or o.expected_close_date < current_date or c.temperature = 'cold'
           or not exists (select 1 from public.activities a where a.deal_id = o.id and a.done_at is null)
        order by o.value desc limit 25) y), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(jsonb_build_object('taken_on', t, 'weighted', w, 'commit', c, 'best_case', b) order by t)
        from (select taken_on t, sum(weighted) w, sum(commit_value) c, sum(best_case) b from public.forecast_snapshots
              where account_id = _account and month = date_trunc('month', now())::date and taken_on > current_date - 120
              group by 1) h), '[]'::jsonb)
  ) into _out;
  return _out;
end $$;
grant execute on function public.report_forecast(uuid, int) to authenticated, service_role;

-- Foto semanal do forecast (pg_cron, segunda 06:00 UTC): permite ver se o número se mantém.
create or replace function public.take_forecast_snapshots() returns int
language plpgsql security definer set search_path = public as $$
declare _n int;
begin
  insert into public.forecast_snapshots (account_id, taken_on, month, user_id, pipeline, weighted, commit_value, best_case, deals)
  select d.account_id, current_date, date_trunc('month', d.expected_close_date)::date, d.owner_user_id,
         sum(d.value), round(sum(d.value * coalesce(st.probability, 0) / 100.0), 2),
         coalesce(sum(d.value) filter (where d.custom->>'forecast_category' = 'commit'), 0),
         coalesce(sum(d.value) filter (where d.custom->>'forecast_category' in ('commit', 'best_case')), 0), count(*)
  from public.deals d left join public.pipeline_stages st on st.id = d.stage_id
  where d.status = 'open' and d.expected_close_date >= date_trunc('month', now())
    and d.expected_close_date < date_trunc('month', now()) + interval '6 months'
  group by 1, 2, 3, 4
  on conflict do nothing;
  get diagnostics _n = row_count;
  return _n;
end $$;
revoke all on function public.take_forecast_snapshots() from public, anon, authenticated;
grant execute on function public.take_forecast_snapshots() to service_role;

-- ───────────────────────── atribuição ─────────────────────────
-- Primeiro/último toque: contacts.first_touch/last_touch (módulo de captação), com recuo para custom.utm_* e a origem.
create or replace function public.report_attribution(_account uuid, _from date, _to date)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare _s timestamptz := _from::timestamptz; _e timestamptz := (_to + 1)::timestamptz; _out jsonb;
begin
  perform public.report_guard(_account);
  with leads as (
    select c.id,
           coalesce(nullif(c.first_touch->>'source', ''), nullif(c.custom->>'utm_source', ''), nullif(c.source, ''), 'direto') first_touch,
           coalesce(nullif(c.last_touch->>'source', ''), nullif(c.first_touch->>'source', ''), nullif(c.custom->>'utm_source', ''), nullif(c.source, ''), 'direto') last_touch,
           coalesce(nullif(c.first_touch->>'campaign', ''), nullif(c.custom->>'utm_campaign', '')) campaign, c.created_at
    from public.contacts c where c.account_id = _account
  ),
  won as (
    select d.value, l.first_touch, l.last_touch, l.campaign from public.deals d join leads l on l.id = d.contact_id
    where d.account_id = _account and d.status = 'won' and d.closed_at >= _s and d.closed_at < _e
  )
  select jsonb_build_object(
    'first_touch', coalesce((select jsonb_agg(jsonb_build_object('source', s, 'leads', n,
        'revenue', (select coalesce(sum(value), 0) from won w where w.first_touch = x.s),
        'deals', (select count(*) from won w where w.first_touch = x.s)) order by n desc)
      from (select first_touch s, count(*) n from leads where created_at >= _s and created_at < _e group by 1) x), '[]'::jsonb),
    'last_touch', coalesce((select jsonb_agg(jsonb_build_object('source', s, 'revenue', r, 'deals', n) order by r desc)
      from (select last_touch s, sum(value) r, count(*) n from won group by 1) x), '[]'::jsonb),
    'campaigns', coalesce((select jsonb_agg(jsonb_build_object('campaign', cp, 'leads', n,
        'revenue', (select coalesce(sum(value), 0) from won w where w.campaign = x.cp)) order by n desc)
      from (select campaign cp, count(*) n from leads where campaign is not null and created_at >= _s and created_at < _e group by 1 limit 30) x), '[]'::jsonb)
  ) into _out;
  return _out;
end $$;
grant execute on function public.report_attribution(uuid, date, date) to authenticated, service_role;

-- ───────────────────────── atendimento, ligações e reuniões (consomem outros módulos se existirem) ─────────────────────────
create or replace function public.report_service(_account uuid, _from date, _to date)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare _out jsonb;
begin
  perform public.report_guard(_account);
  -- sac_metrics (módulo de atendimento) recebe a janela em dias até hoje.
  if to_regprocedure('public.sac_metrics(uuid,integer)') is null then return null; end if;
  execute 'select to_jsonb(public.sac_metrics($1, $2))' into _out using _account, greatest(1, current_date - _from + 1);
  return _out;
end $$;
grant execute on function public.report_service(uuid, date, date) to authenticated, service_role;

create or replace function public.has_column(_table text, _column text) returns boolean
language sql stable as $$
  select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = _table and column_name = _column);
$$;

-- Ligações/reuniões: só usa as colunas que existirem (o módulo de telefonia/reuniões pode evoluir).
create or replace function public.report_activity_table(_table text, _account uuid, _from date, _to date)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare _out jsonb; _date text; _sql text; _dur text; _dir text; _status text;
begin
  perform public.report_guard(_account);
  if _table not in ('calls', 'meetings') or to_regclass('public.' || _table) is null then return null; end if;
  _date := case when public.has_column(_table, 'started_at') then 'started_at' else 'created_at' end;
  _dur := case when public.has_column(_table, 'duration_seconds') then 'duration_seconds' else 'null::int' end;
  _dir := case when public.has_column(_table, 'direction') then 'direction' else '''-''' end;
  _status := case when public.has_column(_table, 'status') then 'status' else '''-''' end;
  _sql := format($q$
    with t as (select %1$I::timestamptz at, %2$s::numeric dur, %3$s::text dir, %4$s::text st from public.%5$I
               where account_id = $1 and %1$I >= $2::timestamptz and %1$I < ($3 + 1)::timestamptz)
    select jsonb_build_object(
      'total', (select count(*) from t),
      'avg_minutes', (select round(avg(dur) / 60.0, 1) from t where dur > 0),
      'total_minutes', (select round(coalesce(sum(dur), 0) / 60.0, 0) from t),
      'by_direction', coalesce((select jsonb_object_agg(dir, n) from (select dir, count(*) n from t group by 1) x), '{}'::jsonb),
      'by_status', coalesce((select jsonb_object_agg(st, n) from (select st, count(*) n from t group by 1) x), '{}'::jsonb),
      'daily', coalesce((select jsonb_agg(jsonb_build_object('day', d, 'count', n) order by d)
                         from (select to_char(at, 'YYYY-MM-DD') d, count(*) n from t group by 1) x), '[]'::jsonb))
  $q$, _date, _dur, _dir, _status, _table);
  execute _sql into _out using _account, _from, _to;
  return _out;
end $$;
grant execute on function public.report_activity_table(text, uuid, date, date) to authenticated, service_role;

-- ───────────────────────── IA ─────────────────────────
create or replace function public.report_ai(_account uuid, _months int default 6)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare _out jsonb; _s timestamptz := date_trunc('month', now()) - make_interval(months => greatest(1, least(coalesce(_months, 6), 24)) - 1);
begin
  perform public.report_guard(_account);
  select jsonb_build_object(
    'llm_monthly', coalesce((select jsonb_agg(jsonb_build_object('month', m, 'calls', n, 'errors', e, 'input_tokens', i, 'output_tokens', o) order by m)
      from (select to_char(created_at, 'YYYY-MM') m, count(*) n, count(*) filter (where not ok) e,
                   coalesce(sum(input_tokens), 0) i, coalesce(sum(output_tokens), 0) o
            from public.llm_calls where account_id = _account and created_at >= _s group by 1) x), '[]'::jsonb),
    'by_purpose', coalesce((select jsonb_agg(jsonb_build_object('purpose', p, 'calls', n, 'tokens', t, 'avg_latency_ms', l) order by n desc)
      from (select purpose p, count(*) n, coalesce(sum(input_tokens + output_tokens), 0) t, round(avg(latency_ms)) l
            from public.llm_calls where account_id = _account and created_at >= _s group by 1) x), '[]'::jsonb),
    'cost_monthly', coalesce((select jsonb_agg(jsonb_build_object('month', m, 'kind', k, 'cost_usd', c, 'quantity', q) order by m, k)
      from (select to_char(created_at, 'YYYY-MM') m, kind k, round(sum(cost_usd), 4) c, sum(quantity) q
            from public.usage_ledger where account_id = _account and created_at >= _s group by 1, 2) x), '[]'::jsonb),
    'resolution', (select jsonb_build_object('with_ai', count(*), 'without_human', count(*) filter (where not human),
          'rate', case when count(*) > 0 then round(100.0 * count(*) filter (where not human) / count(*), 1) end)
      from (select c.id, exists (select 1 from public.messages m2 where m2.conversation_id = c.id and m2.sender_type = 'user' and m2.created_at >= _s) human
            from public.conversations c
            where c.account_id = _account and exists (select 1 from public.messages m where m.conversation_id = c.id and m.sender_type = 'ai' and m.created_at >= _s)) z)
  ) into _out;
  return _out;
end $$;
grant execute on function public.report_ai(uuid, int) to authenticated, service_role;

-- ───────────────────────── construtor de relatório ─────────────────────────
create table if not exists public.saved_reports (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  config jsonb not null,
  chart text not null default 'bar' check (chart in ('bar','line','pie','table')),
  is_shared boolean not null default true,
  schedule text not null default 'none' check (schedule in ('none','weekly')),
  recipients text[] not null default '{}',
  last_sent_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists saved_reports_touch on public.saved_reports;
create trigger saved_reports_touch before update on public.saved_reports for each row execute function public.touch_updated_at();
alter table public.saved_reports enable row level security;
drop policy if exists saved_reports_select on public.saved_reports;
create policy saved_reports_select on public.saved_reports for select using (public.is_member(account_id) and (is_shared or created_by = auth.uid()));
drop policy if exists saved_reports_insert on public.saved_reports;
create policy saved_reports_insert on public.saved_reports for insert with check (public.is_member(account_id) and created_by = auth.uid());
drop policy if exists saved_reports_update on public.saved_reports;
create policy saved_reports_update on public.saved_reports for update
  using (public.is_member(account_id) and (created_by = auth.uid() or public.is_manager(account_id))) with check (public.is_member(account_id));
drop policy if exists saved_reports_delete on public.saved_reports;
create policy saved_reports_delete on public.saved_reports for delete using (created_by = auth.uid() or public.is_manager(account_id));

-- Relatório livre por lista branca: entidade, agrupamento, métrica e filtros de igualdade.
-- Nada do config vira SQL cru; tudo passa por mapas fixos, e os valores vão como parâmetros.
create or replace function public.run_report(_account uuid, _config jsonb)
returns table (key text, label text, value numeric)
language plpgsql stable security invoker set search_path = public as $$
declare
  _entity text := _config->>'entity';
  _group text := coalesce(_config->>'group_by', 'none');
  _metric text := coalesce(_config->>'metric', 'count');
  _datef text := coalesce(_config->>'date_field', 'created_at');
  _from date := nullif(_config->>'from', '')::date;
  _to date := nullif(_config->>'to', '')::date;
  _table text; _gexpr text; _mexpr text; _where text := 'account_id = $1'; _labels text := 'null::text';
  _fkeys text[] := '{}'; _fvals text[] := '{}'; f jsonb; _col text; i int := 0;
begin
  perform public.report_guard(_account);
  _table := case _entity when 'contacts' then 'contacts' when 'deals' then 'deals' when 'activities' then 'activities' end;
  if _table is null then raise exception 'entidade inválida' using errcode = '22023'; end if;

  _gexpr := case _entity || ':' || _group
    when 'contacts:source' then 'coalesce(source, ''—'')'
    when 'contacts:lifecycle' then 'lifecycle'
    when 'contacts:temperature' then 'coalesce(temperature, ''sem'')'
    when 'contacts:owner_user_id' then 'coalesce(owner_user_id::text, ''—'')'
    when 'contacts:city' then 'coalesce(city, ''—'')'
    when 'contacts:company_id' then 'coalesce(company_id::text, ''—'')'
    when 'deals:status' then 'status'
    when 'deals:stage_id' then 'stage_id::text'
    when 'deals:pipeline_id' then 'pipeline_id::text'
    when 'deals:owner_user_id' then 'coalesce(owner_user_id::text, ''—'')'
    when 'deals:source' then 'coalesce(source, ''—'')'
    when 'deals:lost_reason' then 'coalesce(nullif(lost_reason, ''''), ''—'')'
    when 'activities:type' then 'type'
    when 'activities:user_id' then 'coalesce(user_id::text, ''—'')'
    when 'activities:done' then 'case when done_at is null then ''pendente'' else ''feita'' end'
    else null end;
  if _group = 'month' then _gexpr := format('to_char(%I, ''YYYY-MM'')', case when _entity = 'deals' and _datef = 'closed_at' then 'closed_at' else 'created_at' end); end if;
  if _group = 'week' then _gexpr := format('to_char(date_trunc(''week'', %I), ''YYYY-MM-DD'')', case when _entity = 'deals' and _datef = 'closed_at' then 'closed_at' else 'created_at' end); end if;
  if _group = 'none' then _gexpr := '''Total'''; end if;
  if _gexpr is null then raise exception 'agrupamento inválido' using errcode = '22023'; end if;

  _mexpr := case _metric
    when 'count' then 'count(*)::numeric'
    when 'sum_value' then case when _entity = 'deals' then 'coalesce(sum(value), 0)' end
    when 'avg_value' then case when _entity = 'deals' then 'round(avg(value), 2)' end
    when 'avg_score' then case when _entity = 'contacts' then 'round(avg(score), 1)' end
    else null end;
  if _mexpr is null then raise exception 'métrica inválida' using errcode = '22023'; end if;

  if _datef not in ('created_at', 'closed_at', 'done_at', 'due_at') or (_datef = 'closed_at' and _entity <> 'deals')
     or (_datef in ('done_at', 'due_at') and _entity <> 'activities') then _datef := 'created_at'; end if;
  if _from is not null then _where := _where || format(' and %I >= $2::timestamptz', _datef); end if;
  if _to is not null then _where := _where || format(' and %I < ($3 + 1)::timestamptz', _datef); end if;

  for f in select * from jsonb_array_elements(coalesce(_config->'filters', '[]'::jsonb)) loop
    _col := case _entity || ':' || (f->>'field')
      when 'contacts:source' then 'source' when 'contacts:lifecycle' then 'lifecycle' when 'contacts:temperature' then 'temperature'
      when 'contacts:owner_user_id' then 'owner_user_id' when 'contacts:city' then 'city'
      when 'deals:status' then 'status' when 'deals:pipeline_id' then 'pipeline_id' when 'deals:stage_id' then 'stage_id'
      when 'deals:owner_user_id' then 'owner_user_id' when 'deals:source' then 'source'
      when 'activities:type' then 'type' when 'activities:user_id' then 'user_id'
      else null end;
    if _col is null or coalesce(f->>'value', '') = '' then continue; end if;
    i := i + 1;
    exit when i > 8;
    _fvals := _fvals || (f->>'value');
    _where := _where || format(' and %I::text = ($4)[%s]', _col, i);
  end loop;

  if _group in ('owner_user_id', 'user_id') then
    _labels := 'coalesce((select coalesce(m.display_name, p.full_name) from public.memberships m left join public.profiles p on p.id = m.user_id where m.account_id = $1 and m.user_id::text = g.k), ''Sem dono'')';
  elsif _group = 'stage_id' then _labels := '(select name from public.pipeline_stages where id::text = g.k)';
  elsif _group = 'pipeline_id' then _labels := '(select name from public.pipelines where id::text = g.k)';
  elsif _group = 'company_id' then _labels := 'coalesce((select name from public.companies where id::text = g.k), ''Sem empresa'')';
  end if;

  return query execute format(
    'select g.k, coalesce(%s, g.k), g.v from (select %s as k, %s as v from public.%I where %s group by 1) g order by %s limit 200',
    _labels, _gexpr, _mexpr, _table, _where, case when _group in ('month', 'week') then 'g.k' else 'g.v desc nulls last' end)
  using _account, _from, _to, _fvals;
end $$;
grant execute on function public.run_report(uuid, jsonb) to authenticated, service_role;

-- Relatórios agendados: segunda de manhã vira job report.send por relatório.
create or replace function public.enqueue_scheduled_reports() returns int
language plpgsql security definer set search_path = public as $$
declare _n int;
begin
  insert into public.jobs (account_id, kind, payload, dedupe_key)
  select r.account_id, 'report.send', jsonb_build_object('report_id', r.id), 'report:' || r.id || ':' || to_char(now(), 'IYYY-IW')
  from public.saved_reports r where r.schedule = 'weekly' and cardinality(r.recipients) > 0
  on conflict do nothing;
  get diagnostics _n = row_count;
  return _n;
end $$;
revoke all on function public.enqueue_scheduled_reports() from public, anon, authenticated;
grant execute on function public.enqueue_scheduled_reports() to service_role;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'nexus-forecast-snapshot') then
    perform cron.schedule('nexus-forecast-snapshot', '0 9 * * 1', 'select public.take_forecast_snapshots()');
  end if;
  if not exists (select 1 from cron.job where jobname = 'nexus-weekly-reports') then
    perform cron.schedule('nexus-weekly-reports', '0 11 * * 1', 'select public.enqueue_scheduled_reports()');
  end if;
end $$;
