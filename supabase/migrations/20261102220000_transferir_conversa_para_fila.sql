-- Transferir conversa para uma fila direto da Caixa de entrada (#62).
-- Porta única e atômica: tira o responsável, garante que a conversa precisa de humano, põe o item
-- na fila escolhida (habilidade e nível da fila, sem preferência pelo antigo dono) e deixa a nota
-- interna com o motivo. Quem não vê a conversa (RLS de conversations) não transfere.
create or replace function public.transfer_conversation_to_queue(
  _conversation uuid, _queue uuid, _note text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare c public.conversations; q public.call_queues; w public.work_items; _uid uuid := auth.uid();
  _who text; _platform text;
begin
  if _uid is null then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into c from public.conversations where id = _conversation for update;
  if c.id is null or not public.can_see_conversation(c.id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into q from public.call_queues where id = _queue and account_id = c.account_id;
  if q.id is null then raise exception 'Fila não encontrada' using errcode = 'P0001'; end if;
  if not q.is_active then raise exception 'Fila desativada' using errcode = 'P0001'; end if;
  if c.status = 'closed' then raise exception 'Conversa encerrada: reabra antes de transferir' using errcode = 'P0001'; end if;

  -- o gatilho da fila única cria ou devolve o item à fila a partir destes campos
  update public.conversations
     set assignee_user_id = null, status = 'open',
         ai_handoff_at = coalesce(ai_handoff_at, now()),
         ai_handoff_reason = coalesce(ai_handoff_reason, 'transferida para a fila ' || q.name)
   where id = c.id;

  select * into w from public.work_items where source_table = 'conversations' and source_id = c.id
     and status in ('queued','reserved','assigned','wrap_up') limit 1 for update;
  if w.id is null then
    select platform into _platform from public.channels where id = c.channel_id;
    _platform := coalesce(_platform, 'chat');
    insert into public.work_items (account_id, kind, channel, capacity_class, source_table, source_id,
           contact_id, queue_id, priority, required_skill, required_level, sla_due_at, customer_value,
           subject, summary)
    values (c.account_id, 'conversation', _platform, public.cc_capacity_class(_platform), 'conversations', c.id,
           c.contact_id, q.id, 50, q.skills[1], coalesce(q.required_level, 1),
           now() + make_interval(secs => greatest(coalesce(q.sla_seconds, 20), 300)),
           case when c.contact_id is null then 0 else public.cc_customer_value(c.account_id, c.contact_id) end,
           coalesce(c.title, 'Conversa'), left(c.last_message_preview, 300))
    returning * into w;
  else
    update public.work_items
       set queue_id = q.id, required_skill = q.skills[1], required_level = coalesce(q.required_level, 1),
           status = 'queued', assigned_user_id = null, assigned_at = null,
           reserved_user_id = null, reserved_until = null,
           preferred_user_id = null, preferred_until = null,
           declined_by = case when w.assigned_user_id is null then declined_by
                              else array_append(declined_by, w.assigned_user_id) end
     where id = w.id
     returning * into w;
  end if;

  select coalesce(display_name, 'Alguém da equipe') into _who from public.memberships
   where account_id = c.account_id and user_id = _uid;
  insert into public.messages (account_id, conversation_id, direction, sender_type, sender_user_id,
         type, is_private, body, status)
  values (c.account_id, c.id, 'out', 'user', _uid, 'note', true,
         format('%s transferiu para a fila %s.%s', coalesce(_who, 'Alguém da equipe'), q.name,
                case when nullif(trim(_note), '') is null then '' else ' Motivo: ' || left(trim(_note), 1000) end),
         'sent');
  perform public.audit(c.account_id, 'conversation.transfer', 'conversations', c.id,
    jsonb_build_object('queue_id', q.id, 'work_item_id', w.id));
  return w.id;
end $$;
revoke all on function public.transfer_conversation_to_queue(uuid, uuid, text) from public, anon;
grant execute on function public.transfer_conversation_to_queue(uuid, uuid, text) to authenticated, service_role;
