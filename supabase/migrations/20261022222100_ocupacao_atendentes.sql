-- Frente B: ocupação dos atendentes no painel de ligações.
-- Não há registro de tempo logado; a base é a janela do expediente da conta (settings.business_hours)
-- já decorrida hoje. A tela diz isso no rótulo. Aditivo: mesma assinatura, só acrescenta campos.
create or replace function public.call_center_stats(_account uuid)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare
  _tz text; _start timestamptz; _sla int; _bh jsonb; _days int[];
  _bh_start time; _bh_end time; _local timestamp; _window int := 0;
begin
  if not public.is_member(_account) then raise exception 'forbidden' using errcode = '42501'; end if;
  select coalesce(timezone, 'America/Sao_Paulo'), coalesce(settings->'business_hours', '{}'::jsonb)
    into _tz, _bh from public.accounts where id = _account;
  _tz := coalesce(_tz, 'America/Sao_Paulo');
  _start := (date_trunc('day', now() at time zone _tz)) at time zone _tz;
  select coalesce(min(sla_seconds), 20) into _sla from public.call_queues where account_id = _account;

  -- Janela do expediente já decorrida hoje, em segundos (0 fora dos dias de trabalho).
  _days := coalesce((select array_agg(x::int) from jsonb_array_elements_text(_bh->'days') x), array[1,2,3,4,5]);
  _bh_start := coalesce((_bh->>'start')::time, '09:00');
  _bh_end := coalesce((_bh->>'end')::time, '18:00');
  _local := now() at time zone _tz;
  if coalesce((_bh->>'always')::boolean, false) then
    _window := extract(epoch from (_local - date_trunc('day', _local)))::int;
  elsif extract(isodow from _local)::int = any(_days) and _bh_end > _bh_start then
    _window := greatest(0, least(
      extract(epoch from (_local::time - _bh_start))::int,
      extract(epoch from (_bh_end - _bh_start))::int));
  end if;

  return (
    with today as (select * from public.calls where account_id = _account and started_at >= _start),
    inbound as (select * from today where direction = 'inbound' and voice_agent_id is null),
    per_agent as (
      select user_id, count(*)::int as calls,
             coalesce(sum(coalesce(billseconds, duration_seconds, 0)), 0)::int as talk_seconds
        from today
       where user_id is not null and voice_agent_id is null and answered_at is not null
       group by user_id
    )
    select jsonb_build_object(
      'waiting', (select count(*) from public.calls where account_id = _account and direction = 'inbound' and status = 'ringing' and started_at > now() - interval '15 minutes'),
      'in_progress', (select count(*) from public.calls where account_id = _account and status = 'in_progress' and started_at > now() - interval '3 hours'),
      'today_total', (select count(*) from today),
      'today_inbound', (select count(*) from inbound),
      'today_outbound', (select count(*) from today where direction = 'outbound'),
      'today_ai', (select count(*) from today where voice_agent_id is not null),
      'answered', (select count(*) from inbound where answered_at is not null),
      'abandoned', (select count(*) from inbound where answered_at is null and status in ('missed','no_answer','canceled')),
      'avg_wait_seconds', (select coalesce(round(avg(extract(epoch from answered_at - started_at))), 0) from inbound where answered_at is not null),
      'avg_talk_seconds', (select coalesce(round(avg(coalesce(billseconds, duration_seconds))), 0) from today where answered_at is not null),
      'service_level', (select case when count(*) = 0 then null else round(100.0 * count(*) filter (where answered_at is not null and answered_at - started_at <= make_interval(secs => _sla)) / count(*)) end from inbound),
      'sla_seconds', _sla,
      'occupancy_basis', 'business_hours',
      'window_seconds', _window,
      'agents_with_extension', (select count(*) from public.telephony_extensions where account_id = _account and is_active),
      'agents', coalesce((select jsonb_agg(jsonb_build_object('user_id', user_id, 'calls', calls, 'talk_seconds', talk_seconds) order by talk_seconds desc) from per_agent), '[]'::jsonb)
    )
  );
end $$;
grant execute on function public.call_center_stats(uuid) to authenticated;
