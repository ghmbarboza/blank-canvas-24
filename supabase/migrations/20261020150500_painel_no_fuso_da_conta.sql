-- Nexus One · painel agrupa os dias no fuso da conta (antes agrupava em UTC).

create or replace function public.dashboard_stats(_account uuid, _days integer default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  _since timestamptz := now() - make_interval(days => greatest(1, least(_days, 365)));
  _tz text := coalesce((select timezone from accounts where id = _account), 'America/Sao_Paulo');
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
                      and (starts_at at time zone _tz)::date = (now() at time zone _tz)::date),
    'by_platform', (select coalesce(jsonb_object_agg(platform, n), '{}'::jsonb) from (
        select ch.platform, count(*) n from messages m
        join conversations cv on cv.id = m.conversation_id
        join channels ch on ch.id = cv.channel_id
        where m.account_id = _account and m.created_at >= _since group by ch.platform) t),
    'by_temperature', (select coalesce(jsonb_object_agg(temperature, n), '{}'::jsonb) from (
        select temperature, count(*) n from contacts
        where account_id = _account and temperature is not null group by temperature) t),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'in', i, 'out', o) order by d), '[]'::jsonb) from (
        select (created_at at time zone _tz)::date d,
               count(*) filter (where direction = 'in') i,
               count(*) filter (where direction = 'out') o
        from messages where account_id = _account and created_at >= _since group by 1) t)
  ) into _result;
  return _result;
end $$;
