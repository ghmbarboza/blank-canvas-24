-- Call center: painel de parede (ao vivo), indicadores clássicos (TMA, TME, FCR, abandono,
-- ocupação) por fila, atendente e agente de IA, regras de discagem configuráveis pelo cliente
-- (padrão desligado) e importação da lista do Não Me Perturbe. Aditivo e idempotente.

-- Prefixo de discagem por campanha (o número de saída já é voice_campaigns.phone_number_id).
alter table public.voice_campaigns add column if not exists dial_prefix text;
do $$ begin
  alter table public.voice_campaigns add constraint voice_campaigns_dial_prefix_chk
    check (dial_prefix is null or dial_prefix ~ '^[0-9]{1,8}$');
exception when duplicate_object then null; end $$;

-- ───────────────────────── painel ao vivo ─────────────────────────
create or replace function public.cc_live(_account uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare _tz text; _t0 timestamptz; s public.call_center_settings;
begin
  if not public.is_member(_account) then raise exception 'forbidden' using errcode = '42501'; end if;
  select coalesce(timezone, 'America/Sao_Paulo') into _tz from public.accounts where id = _account;
  _tz := coalesce(_tz, 'America/Sao_Paulo');
  _t0 := (date_trunc('day', now() at time zone _tz)) at time zone _tz;
  s := public.cc_settings(_account);
  return (
    with open_items as (
      select * from public.work_items
       where account_id = _account and status in ('queued','reserved')
         and (scheduled_at is null or scheduled_at <= now())),
    by_channel as (
      select channel, count(*)::int as waiting,
             max(extract(epoch from now() - created_at))::int as oldest_wait_seconds,
             count(*) filter (where sla_due_at < now())::int as breached,
             count(*) filter (where sla_due_at >= now() and public.cc_at_risk(sla_due_at, s.sla_risk_seconds))::int as at_risk
        from open_items group by channel),
    ag as (
      select qa.user_id, coalesce(nullif(m.display_name, ''), nullif(pr.full_name, ''), 'Atendente') as name,
             p.status as chosen, p.pause_reason, p.since, p.wrap_up_until,
             public.cc_agent_load(_account, qa.user_id) as load,
             (select e.extension from public.telephony_extensions e
               where e.account_id = _account and e.user_id = qa.user_id and e.is_active limit 1) as extension,
             (select count(*) from public.work_items w where w.account_id = _account and w.assigned_user_id = qa.user_id
                 and w.status = 'assigned' and w.capacity_class = 'voice')::int as voice,
             (select count(*) from public.work_items w where w.account_id = _account and w.assigned_user_id = qa.user_id
                 and w.status = 'assigned' and w.capacity_class = 'chat')::int as chat,
             (select count(*) from public.work_items w where w.account_id = _account and w.assigned_user_id = qa.user_id
                 and w.status = 'assigned' and w.capacity_class in ('email','task'))::int as other,
             (select jsonb_build_object('id', w.id, 'kind', w.kind, 'subject', w.subject, 'since', w.assigned_at,
                                        'source_id', w.source_id)
                from public.work_items w where w.account_id = _account and w.assigned_user_id = qa.user_id
                 and w.status = 'assigned' and w.capacity_class = 'voice' order by w.assigned_at desc limit 1) as current_voice
        from public.queue_agents qa
        left join public.agent_presence p on p.account_id = qa.account_id and p.user_id = qa.user_id
        left join public.memberships m on m.account_id = qa.account_id and m.user_id = qa.user_id
        left join public.profiles pr on pr.id = qa.user_id
       where qa.account_id = _account and qa.is_active),
    st as (
      select ag.*, case when chosen is null or chosen = 'offline' then 'offline'
                        when chosen = 'paused' then 'paused'
                        when wrap_up_until > now() then 'wrap_up'
                        when load > 0 then 'busy' else 'available' end as state
        from ag),
    today as (select * from public.work_items where account_id = _account and created_at >= _t0),
    ai_conv as (select v.id, v.ai_handoff_at from public.conversations v
                 where v.account_id = _account and v.ai_enabled and not v.is_group and v.last_inbound_at >= _t0),
    ai_calls as (select c.id from public.calls c where c.account_id = _account and c.voice_agent_id is not null
                   and c.started_at >= _t0 and c.answered_at is not null),
    ai_calls_handoff as (select distinct (w.metadata->>'from_call_id') as call_id from today w
                          where w.metadata ? 'from_call_id')
    select jsonb_build_object(
      'generated_at', now(),
      'waiting_total', (select count(*) from open_items),
      'longest_wait_seconds', coalesce((select max(oldest_wait_seconds) from by_channel), 0),
      'callbacks_pending', (select count(*) from public.work_items where account_id = _account and kind = 'callback'
                             and status in ('queued','reserved')),
      'queue', coalesce((select jsonb_agg(to_jsonb(b) order by b.waiting desc) from by_channel b), '[]'::jsonb),
      'agents', coalesce((select jsonb_agg(jsonb_build_object(
                    'user_id', user_id, 'name', name, 'state', state, 'pause_reason', pause_reason, 'since', since,
                    'wrap_up_until', wrap_up_until, 'load', round(load, 2), 'extension', extension,
                    'voice', voice, 'chat', chat, 'other', other, 'current_voice', current_voice)
                  order by state, name) from st), '[]'::jsonb),
      'agent_states', jsonb_build_object(
          'available', (select count(*) from st where state = 'available'),
          'busy', (select count(*) from st where state = 'busy'),
          'wrap_up', (select count(*) from st where state = 'wrap_up'),
          'paused', (select count(*) from st where state = 'paused'),
          'offline', (select count(*) from st where state = 'offline')),
      'today', jsonb_build_object(
          'offered', (select count(*) from today where kind in ('call','conversation','ticket','handoff')),
          'answered', (select count(*) from today where assigned_at is not null and kind <> 'cadence_task'),
          'abandoned', (select count(*) from today where status = 'abandoned'),
          'abandon_rate', (select case when count(*) filter (where kind = 'call') = 0 then null
                                  else round(100.0 * count(*) filter (where kind = 'call' and status = 'abandoned')
                                             / count(*) filter (where kind = 'call')) end from today),
          'sla_met_pct', (select case when count(*) = 0 then null
                                  else round(100.0 * count(*) filter (where assigned_at is not null and assigned_at <= sla_due_at) / count(*)) end
                            from today where sla_due_at is not null and (assigned_at is not null or sla_due_at < now())),
          'tme_seconds', (select round(avg(extract(epoch from assigned_at - created_at))) from today where assigned_at is not null),
          'tma_seconds', (select round(avg(extract(epoch from coalesce(wrap_confirmed_at, closed_at, ended_at) - assigned_at)))
                            from today where status = 'done' and assigned_at is not null),
          'resolved', (select count(*) from today where status = 'done' and assigned_at is not null),
          'ai_touched', (select count(*) from ai_conv) + (select count(*) from ai_calls),
          'ai_resolved', (select count(*) from ai_conv where ai_handoff_at is null)
                         + (select count(*) from ai_calls c where c.id::text not in (select call_id from ai_calls_handoff where call_id is not null)),
          'ai_resolution_pct', (select case when t = 0 then null else round(100.0 * r / t) end from (
              select (select count(*) from ai_conv) + (select count(*) from ai_calls) as t,
                     (select count(*) from ai_conv where ai_handoff_at is null)
                     + (select count(*) from ai_calls c where c.id::text not in (select call_id from ai_calls_handoff where call_id is not null)) as r) x)
      )
    )
  );
end $$;
revoke all on function public.cc_live(uuid) from public, anon;
grant execute on function public.cc_live(uuid) to authenticated;

-- ───────────────────────── indicadores do período ─────────────────────────
-- TME: chegada → atendimento. TMA: atendimento → fim do pós-atendimento. FCR: concluído sem novo
-- contato do mesmo cliente em 7 dias. Abandono: ligação que desistiu antes de ser atendida.
-- Ocupação: tempo atendendo (ponderado pela capacidade do canal) / tempo disponível na presença.
create or replace function public.cc_indicators(_account uuid, _from timestamptz, _to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_member(_account) then raise exception 'forbidden' using errcode = '42501'; end if;
  if _to <= _from or _to - _from > interval '93 days' then
    raise exception 'Período inválido (até 93 dias)' using errcode = 'P0001';
  end if;
  return (
    with items as (
      select w.*,
             (w.status = 'done' and w.contact_id is not null and not exists (
                select 1 from public.work_items y
                 where y.account_id = _account and y.contact_id = w.contact_id and y.id <> w.id
                   and y.kind in ('call','conversation','ticket','callback')
                   and y.created_at > w.created_at
                   and y.created_at <= coalesce(w.closed_at, w.created_at) + interval '7 days')) as fcr_ok,
             1.0 / nullif(case w.capacity_class when 'voice' then qa.cap_voice when 'chat' then qa.cap_chat
                                 when 'email' then qa.cap_email else qa.cap_task end, 0) as weight
        from public.work_items w
        left join public.queue_agents qa on qa.account_id = w.account_id and qa.user_id = w.assigned_user_id
       where w.account_id = _account and w.created_at >= _from and w.created_at < _to and w.kind <> 'cadence_task'),
    g as (
      select grouping(queue_id) as gq, grouping(assigned_user_id) as gu, queue_id, assigned_user_id,
             count(*)::int as offered,
             count(*) filter (where assigned_at is not null)::int as answered,
             count(*) filter (where status = 'abandoned')::int as abandoned,
             round(avg(extract(epoch from assigned_at - created_at)) filter (where assigned_at is not null)) as tme_seconds,
             round(avg(extract(epoch from coalesce(wrap_confirmed_at, closed_at, ended_at) - assigned_at))
                   filter (where status = 'done' and assigned_at is not null)) as tma_seconds,
             case when count(*) filter (where status = 'done' and contact_id is not null) = 0 then null
                  else round(100.0 * count(*) filter (where fcr_ok) / count(*) filter (where status = 'done' and contact_id is not null)) end as fcr_pct,
             case when count(*) filter (where kind = 'call') = 0 then null
                  else round(100.0 * count(*) filter (where kind = 'call' and status = 'abandoned') / count(*) filter (where kind = 'call')) end as abandon_pct,
             case when count(*) filter (where sla_due_at is not null and (assigned_at is not null or sla_due_at < now())) = 0 then null
                  else round(100.0 * count(*) filter (where assigned_at is not null and assigned_at <= sla_due_at)
                             / count(*) filter (where sla_due_at is not null and (assigned_at is not null or sla_due_at < now()))) end as sla_met_pct,
             coalesce(sum(extract(epoch from least(coalesce(ended_at, closed_at, now()), _to) - greatest(assigned_at, _from)) * coalesce(weight, 1))
                      filter (where assigned_at is not null), 0) as handle_seconds
        from items
       group by grouping sets ((), (queue_id), (assigned_user_id))),
    logged as (
      select l.user_id, sum(extract(epoch from least(coalesce(l.ended_at, now()), _to) - greatest(l.started_at, _from))) as secs
        from public.agent_presence_log l
       where l.account_id = _account and l.status = 'available'
         and l.started_at < _to and coalesce(l.ended_at, now()) > _from
       group by l.user_id),
    ai as (
      select c.voice_agent_id, count(*)::int as calls,
             count(*) filter (where c.answered_at is not null)::int as answered,
             round(avg(coalesce(c.billseconds, c.duration_seconds)) filter (where c.answered_at is not null)) as tma_seconds,
             count(*) filter (where exists (select 1 from public.work_items w where w.account_id = _account
                                               and w.metadata->>'from_call_id' = c.id::text))::int as transferred
        from public.calls c
       where c.account_id = _account and c.voice_agent_id is not null and c.started_at >= _from and c.started_at < _to
       group by c.voice_agent_id)
    select jsonb_build_object(
      'from', _from, 'to', _to,
      'total', (select to_jsonb(x) - 'gq' - 'gu' - 'queue_id' - 'assigned_user_id' from g x where gq = 1 and gu = 1),
      'by_queue', coalesce((select jsonb_agg((to_jsonb(x) - 'gq' - 'gu' - 'assigned_user_id')
                                || jsonb_build_object('name', coalesce(q.name, 'Sem fila')) order by x.offered desc)
                              from g x left join public.call_queues q on q.id = x.queue_id
                             where x.gq = 0), '[]'::jsonb),
      'by_agent', coalesce((select jsonb_agg((to_jsonb(x) - 'gq' - 'gu' - 'queue_id')
                                || jsonb_build_object(
                                     'name', coalesce(nullif(m.display_name, ''), nullif(pr.full_name, ''), 'Atendente'),
                                     'logged_seconds', round(coalesce(lg.secs, 0)),
                                     'occupancy_pct', case when coalesce(lg.secs, 0) < 60 then null
                                                           else least(100, round(100.0 * x.handle_seconds / lg.secs)) end)
                                order by x.answered desc)
                              from g x
                              left join public.memberships m on m.account_id = _account and m.user_id = x.assigned_user_id
                              left join public.profiles pr on pr.id = x.assigned_user_id
                              left join logged lg on lg.user_id = x.assigned_user_id
                             where x.gu = 0 and x.assigned_user_id is not null), '[]'::jsonb),
      'by_ai_agent', coalesce((select jsonb_agg(to_jsonb(a) || jsonb_build_object(
                                   'name', coalesce(v.name, 'Agente de voz'),
                                   'resolution_pct', case when a.answered = 0 then null
                                                          else round(100.0 * greatest(a.answered - a.transferred, 0) / a.answered) end)
                                 order by a.calls desc)
                                from ai a left join public.voice_agents v on v.id = a.voice_agent_id), '[]'::jsonb)
    )
  );
end $$;
revoke all on function public.cc_indicators(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.cc_indicators(uuid, timestamptz, timestamptz) to authenticated;

-- ───────────────────────── Não Me Perturbe ─────────────────────────
-- Importa a lista do NMP (ou qualquer lista de não contatar) como supressão de voz da conta.
create or replace function public.import_dnc_numbers(_account uuid, _numbers text[], _source text default 'nao_me_perturbe')
returns jsonb language plpgsql security definer set search_path = public as $$
declare _n int; _valid text[];
begin
  if not public.is_manager(_account) then raise exception 'forbidden' using errcode = '42501'; end if;
  if coalesce(array_length(_numbers, 1), 0) > 5000 then
    raise exception 'Envie até 5.000 números por vez' using errcode = 'P0001';
  end if;
  select array_agg(distinct d) into _valid
    from (select regexp_replace(x, '\D', '', 'g') as d from unnest(coalesce(_numbers, '{}')) x) t
   where length(d) between 10 and 15;
  insert into public.suppressions (account_id, channel, address, reason, source, created_by)
  select _account, 'voice', d, 'dnc', left(coalesce(nullif(trim(_source), ''), 'nao_me_perturbe'), 40), auth.uid()
    from unnest(coalesce(_valid, '{}')) d
  on conflict (account_id, channel, address) do nothing;
  get diagnostics _n = row_count;
  return jsonb_build_object('received', coalesce(array_length(_numbers, 1), 0),
                            'valid', coalesce(array_length(_valid, 1), 0), 'added', _n);
end $$;
revoke all on function public.import_dnc_numbers(uuid, text[], text) from public, anon;
grant execute on function public.import_dnc_numbers(uuid, text[], text) to authenticated;

-- Tentativas de ligação de saída para um número no período (regra "teto por número").
create or replace function public.cc_attempts_for(_account uuid, _phone text, _days int)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from public.calls
   where account_id = _account and direction = 'outbound'
     and started_at >= now() - make_interval(days => greatest(coalesce(_days, 1), 1))
     and to_number like '%' || right(regexp_replace(coalesce(_phone, ''), '\D', '', 'g'), 8);
$$;
revoke all on function public.cc_attempts_for(uuid, text, int) from public, anon, authenticated;
grant execute on function public.cc_attempts_for(uuid, text, int) to service_role;

-- ───────────────────────── teste da configuração ─────────────────────────
-- "Testar" do assistente: para cada fila ativa, quantas pessoas da equipe têm a habilidade exigida.
create or replace function public.cc_self_test(_account uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_member(_account) then raise exception 'forbidden' using errcode = '42501'; end if;
  return (
    with team as (select * from public.queue_agents where account_id = _account and is_active),
    qs as (
      select q.id, q.name, q.channels, q.skills[1] as skill, q.required_level,
             (select count(*) from team t
               where public.cc_has_skill(_account, t.user_id, q.skills[1], q.required_level))::int as eligible,
             (select count(*) from team t
               where public.cc_has_skill(_account, t.user_id, q.skills[1], q.required_level)
                 and public.cc_user_available(_account, t.user_id))::int as available_now
        from public.call_queues q where q.account_id = _account and q.is_active)
    select jsonb_build_object(
      'team', (select count(*) from team),
      'team_with_skills', (select count(*) from team t where exists (
          select 1 from public.agent_skills k where k.account_id = _account and k.user_id = t.user_id)),
      'queues', coalesce((select jsonb_agg(to_jsonb(qs) order by qs.name) from qs), '[]'::jsonb),
      'ok', (select count(*) from team) > 0
            and exists (select 1 from team t where exists (select 1 from public.agent_skills k
                         where k.account_id = _account and k.user_id = t.user_id))
            and exists (select 1 from qs where eligible > 0)
    )
  );
end $$;
revoke all on function public.cc_self_test(uuid) from public, anon;
grant execute on function public.cc_self_test(uuid) to authenticated;
