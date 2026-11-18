-- Linha do tempo 360 modular: além da base (mensagens, atividades, eventos, negócios, IA,
-- consentimento), une toda função public.timeline_part_<modulo>(uuid) que existir no banco.
-- Cada módulo (e-mail, ligações, reuniões, chamados, propostas, formulários) traz a sua parte.
create or replace function public.contact_timeline_base(_contact uuid)
returns table (kind text, ref_id uuid, at timestamptz, title text, body text, meta jsonb)
language sql stable security invoker set search_path = public as $$
    select 'message'::text, m.id, m.created_at,
           case when m.direction = 'in' then 'Mensagem recebida' else 'Mensagem enviada' end,
           coalesce(m.body, m.transcript, '[' || m.type || ']'),
           jsonb_build_object('direction', m.direction, 'type', m.type, 'conversation_id', m.conversation_id,
                              'platform', ch.platform, 'sender_type', m.sender_type, 'is_private', m.is_private)
      from public.messages m
      join public.conversations c on c.id = m.conversation_id
      left join public.channels ch on ch.id = c.channel_id
     where c.contact_id = _contact
    union all
    select 'activity', a.id, coalesce(a.done_at, a.created_at), coalesce(a.title, a.type), a.body,
           jsonb_build_object('type', a.type, 'deal_id', a.deal_id, 'due_at', a.due_at, 'done_at', a.done_at)
      from public.activities a where a.contact_id = _contact
    union all
    select 'event', e.id, e.starts_at, e.title, e.description,
           jsonb_build_object('status', e.status, 'ends_at', e.ends_at, 'meeting_url', e.meeting_url)
      from public.events e where e.contact_id = _contact
    union all
    select 'deal', d.id, d.created_at, 'Negócio: ' || d.title, null,
           jsonb_build_object('status', d.status, 'value', d.value, 'stage_id', d.stage_id)
      from public.deals d where d.contact_id = _contact
    union all
    select 'classification', ac.id, ac.created_at, 'Classificação da IA', ac.summary,
           jsonb_build_object('score', ac.score, 'temperature', ac.temperature)
      from public.ai_classifications ac where ac.contact_id = _contact
    union all
    select 'consent', cs.id, cs.created_at,
           case when cs.status = 'granted' then 'Consentimento registrado' else 'Consentimento revogado' end,
           cs.channel, jsonb_build_object('channel', cs.channel, 'basis', cs.basis, 'source', cs.source)
      from public.consents cs where cs.contact_id = _contact;
$$;
grant execute on function public.contact_timeline_base(uuid) to authenticated;

create or replace function public.contact_timeline(_contact uuid, _limit int default 60, _before timestamptz default null)
returns table (kind text, ref_id uuid, at timestamptz, title text, body text, meta jsonb)
language plpgsql stable security invoker set search_path = public as $$
declare _sql text := 'select * from public.contact_timeline_base($1)'; _f record;
begin
  for _f in
    select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'timeline\_part\_%' and p.pronargs = 1
     order by p.proname
  loop
    _sql := _sql || format(' union all select * from public.%I($1)', _f.proname);
  end loop;
  return query execute format(
    'select t.kind, t.ref_id, t.at, t.title, t.body, t.meta from (%s) t where $2 is null or t.at < $2 order by t.at desc limit %s',
    _sql, greatest(1, least(coalesce(_limit, 60), 200)))
  using _contact, _before;
end $$;
grant execute on function public.contact_timeline(uuid, int, timestamptz) to authenticated;
