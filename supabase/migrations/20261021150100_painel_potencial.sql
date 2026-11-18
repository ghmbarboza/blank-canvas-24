-- Painel: potencial do funil (valor aceito + upsell/cross-sell sugeridos) ao lado do valor em aberto.

create or replace function public.dashboard_gerencial(_account uuid, _days integer default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  _d integer := greatest(1, least(coalesce(_days, 30), 365));
  _now timestamptz := now();
  _since timestamptz := now() - make_interval(days => greatest(1, least(coalesce(_days, 30), 365)));
  _prev timestamptz := now() - make_interval(days => 2 * greatest(1, least(coalesce(_days, 30), 365)));
  _tz text;
  _pipeline uuid;
  _result jsonb;
begin
  if not public.is_member(_account) then raise exception 'forbidden' using errcode = '42501'; end if;
  select coalesce(timezone, 'America/Sao_Paulo') into _tz from accounts where id = _account;
  select id into _pipeline from pipelines where account_id = _account
    order by is_default desc, position, created_at limit 1;

  with turns as (
    -- Mensagens não privadas dos dois últimos períodos, com a direção da anterior na conversa.
    select m.conversation_id, m.direction, m.sender_type, m.sender_user_id, m.created_at,
           lag(m.direction) over w as prev_dir
    from messages m
    where m.account_id = _account and m.created_at >= _prev - interval '1 day' and not m.is_private
      and m.sender_type <> 'system'
    window w as (partition by m.conversation_id order by m.created_at)
  ),
  opens as (
    select t.conversation_id, t.created_at as asked_at,
           (select min(r.created_at) from turns r
             where r.conversation_id = t.conversation_id and r.direction = 'out'
               and r.created_at > t.created_at) as answered_at
    from turns t
    where t.direction = 'in' and (t.prev_dir is null or t.prev_dir = 'out') and t.created_at >= _prev
  ),
  answers as (
    select o.*, extract(epoch from (o.answered_at - o.asked_at)) as secs,
           (select r.sender_user_id from turns r
             where r.conversation_id = o.conversation_id and r.created_at = o.answered_at
               and r.direction = 'out' limit 1) as answered_by,
           (select r.sender_type from turns r
             where r.conversation_id = o.conversation_id and r.created_at = o.answered_at
               and r.direction = 'out' limit 1) as answered_type
    from opens o
    where o.answered_at is not null
  ),
  cur_msgs as (
    select m.*, coalesce(ch.platform, 'outro') as platform
    from messages m
    join conversations cv on cv.id = m.conversation_id
    left join channels ch on ch.id = cv.channel_id
    where m.account_id = _account and m.created_at >= _since and not m.is_private
  )
  select jsonb_build_object(
    'days', _d,
    'timezone', _tz,
    'generated_at', _now,

    'kpis', jsonb_build_object(
      'messages_in', (select count(*) from messages where account_id = _account and direction = 'in' and created_at >= _since),
      'messages_in_prev', (select count(*) from messages where account_id = _account and direction = 'in' and created_at >= _prev and created_at < _since),
      'messages_out', (select count(*) from messages where account_id = _account and direction = 'out' and not is_private and created_at >= _since),
      'messages_out_prev', (select count(*) from messages where account_id = _account and direction = 'out' and not is_private and created_at >= _prev and created_at < _since),
      'conversations', (select count(distinct conversation_id) from messages where account_id = _account and created_at >= _since),
      'conversations_prev', (select count(distinct conversation_id) from messages where account_id = _account and created_at >= _prev and created_at < _since),
      'new_leads', (select count(*) from contacts where account_id = _account and created_at >= _since),
      'new_leads_prev', (select count(*) from contacts where account_id = _account and created_at >= _prev and created_at < _since),
      'hot_leads', (select count(*) from contacts where account_id = _account and temperature = 'hot'),
      'frt_avg', (select round(avg(secs)) from answers where asked_at >= _since),
      'frt_avg_prev', (select round(avg(secs)) from answers where asked_at < _since),
      'frt_median', (select round(percentile_cont(0.5) within group (order by secs)) from answers where asked_at >= _since),
      'frt_sla_pct', (select round(100.0 * count(*) filter (where secs <= 300) / nullif(count(*), 0)) from answers where asked_at >= _since),
      'ai_answered', (select count(*) from answers where asked_at >= _since and answered_type = 'ai'),
      'pipeline_value', (select coalesce(sum(value), 0) from deals where account_id = _account and status = 'open'),
      'pipeline_count', (select count(*) from deals where account_id = _account and status = 'open'),
      'pipeline_potential', (select coalesce(sum(potential_value), 0) from deals where account_id = _account and status = 'open'),
      'items_deals', (select count(distinct deal_id) from deal_items di join deals d on d.id = di.deal_id where d.account_id = _account and d.status = 'open'),
      'forecast_value', (select coalesce(sum(d.value * s.probability / 100.0), 0) from deals d
                          join pipeline_stages s on s.id = d.stage_id
                          where d.account_id = _account and d.status = 'open'),
      'won_value', (select coalesce(sum(value), 0) from deals where account_id = _account and status = 'won' and closed_at >= _since),
      'won_value_prev', (select coalesce(sum(value), 0) from deals where account_id = _account and status = 'won' and closed_at >= _prev and closed_at < _since),
      'won_count', (select count(*) from deals where account_id = _account and status = 'won' and closed_at >= _since),
      'lost_count', (select count(*) from deals where account_id = _account and status = 'lost' and closed_at >= _since),
      'open_conversations', (select count(*) from conversations where account_id = _account and status = 'open'),
      'unread', (select coalesce(sum(unread_count), 0) from conversations where account_id = _account and status = 'open'),
      'waiting', (select count(*) from conversations where account_id = _account and status = 'open'
                   and last_inbound_at is not null and last_inbound_at >= coalesce(last_message_at, last_inbound_at)),
      'oldest_waiting_at', (select min(last_inbound_at) from conversations where account_id = _account and status = 'open'
                   and last_inbound_at is not null and last_inbound_at >= coalesce(last_message_at, last_inbound_at)),
      'classified', (select count(*) from ai_classifications where account_id = _account and created_at >= _since),
      'avg_score', (select round(avg(score)) from contacts where account_id = _account and score is not null)
    ),

    'daily', (select coalesce(jsonb_agg(jsonb_build_object(
                  'day', g.day::date, 'in', coalesce(x.i, 0), 'out', coalesce(x.o, 0),
                  'leads', coalesce(l.n, 0), 'frt', f.frt) order by g.day), '[]'::jsonb)
              from generate_series(((_now at time zone _tz)::date - (_d - 1)), (_now at time zone _tz)::date, interval '1 day') as g(day)
              left join (select (created_at at time zone _tz)::date d,
                                count(*) filter (where direction = 'in') i,
                                count(*) filter (where direction = 'out') o
                         from cur_msgs group by 1) x on x.d = g.day::date
              left join (select (created_at at time zone _tz)::date d, count(*) n from contacts
                         where account_id = _account and created_at >= _since group by 1) l on l.d = g.day::date
              left join (select (asked_at at time zone _tz)::date d, round(avg(secs)) frt from answers
                         where asked_at >= _since group by 1) f on f.d = g.day::date),

    'heatmap', (select coalesce(jsonb_agg(jsonb_build_object('dow', dow, 'hour', hr, 'n', n)), '[]'::jsonb) from (
                  select extract(isodow from created_at at time zone _tz)::int dow,
                         extract(hour from created_at at time zone _tz)::int hr, count(*) n
                  from cur_msgs where direction = 'in' group by 1, 2) h),

    'channels', (select coalesce(jsonb_agg(c order by (c->>'total')::int desc), '[]'::jsonb) from (
                  select jsonb_build_object(
                    'platform', m.platform,
                    'in', count(*) filter (where m.direction = 'in'),
                    'out', count(*) filter (where m.direction = 'out'),
                    'total', count(*),
                    'conversations', count(distinct m.conversation_id),
                    'frt', (select round(avg(a.secs)) from answers a
                             join conversations cv on cv.id = a.conversation_id
                             left join channels ch on ch.id = cv.channel_id
                             where a.asked_at >= _since and coalesce(ch.platform, 'outro') = m.platform)
                  ) c
                  from cur_msgs m group by m.platform) t),

    'funnel', (select coalesce(jsonb_agg(jsonb_build_object(
                  'id', s.id, 'name', s.name, 'kind', s.kind, 'color', s.color, 'position', s.position,
                  'probability', s.probability,
                  'count', (select count(*) from deals d where d.stage_id = s.id
                             and (d.status = 'open' or (d.status <> 'open' and d.closed_at >= _since))),
                  'value', (select coalesce(sum(d.value), 0) from deals d where d.stage_id = s.id
                             and (d.status = 'open' or (d.status <> 'open' and d.closed_at >= _since)))
                ) order by s.position), '[]'::jsonb)
               from pipeline_stages s where s.pipeline_id = _pipeline),

    'team', (select coalesce(jsonb_agg(t order by (t->>'replies')::int desc, t->>'name'), '[]'::jsonb) from (
               select jsonb_build_object(
                 'user_id', mb.user_id,
                 'name', coalesce(nullif(mb.display_name, ''), nullif(p.full_name, ''), split_part(u.email, '@', 1)),
                 'avatar_url', p.avatar_url,
                 'role', mb.role,
                 'open_conversations', (select count(*) from conversations cv where cv.account_id = _account
                                         and cv.assignee_user_id = mb.user_id and cv.status = 'open'),
                 'replies', (select count(*) from cur_msgs m where m.sender_user_id = mb.user_id and m.direction = 'out'),
                 'frt', (select round(avg(a.secs)) from answers a where a.asked_at >= _since and a.answered_by = mb.user_id),
                 'won_count', (select count(*) from deals d where d.account_id = _account and d.owner_user_id = mb.user_id
                                and d.status = 'won' and d.closed_at >= _since),
                 'won_value', (select coalesce(sum(d.value), 0) from deals d where d.account_id = _account
                                and d.owner_user_id = mb.user_id and d.status = 'won' and d.closed_at >= _since)
               ) t
               from memberships mb
               join auth.users u on u.id = mb.user_id
               left join profiles p on p.id = mb.user_id
               where mb.account_id = _account and mb.is_active) x),

    'temperature', (select jsonb_build_object(
                      'hot', count(*) filter (where temperature = 'hot'),
                      'warm', count(*) filter (where temperature = 'warm'),
                      'cold', count(*) filter (where temperature = 'cold'),
                      'unclassified', count(*) filter (where temperature is null))
                    from contacts where account_id = _account)
  ) into _result;
  return _result;
end $$;

revoke execute on function public.dashboard_gerencial(uuid, integer) from public, anon;
grant execute on function public.dashboard_gerencial(uuid, integer) to authenticated;
