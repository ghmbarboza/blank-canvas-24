-- Alerta ativo de SLA da conversa (#63). Antes o prazo só aparecia no painel ao vivo.
-- 1) conversa parada na fila (ninguém pegou) depois do prazo → gestores, uma vez por item;
-- 2) conversa com dono e cliente sem resposta além do prazo da fila → o dono, uma vez por mensagem
--    do cliente (marca o last_inbound_at avisado no metadata do item).
-- Só olha as últimas 24 h: a primeira execução não despeja aviso de item antigo.
-- Usa os mesmos tipos de aviso dos chamados (sla_breached / sla_warning), que a tela já conhece.
alter table public.work_items add column if not exists sla_alerted_at timestamptz;

create or replace function public.conversation_sla_sweep() returns integer
language plpgsql security definer set search_path = public as $$
declare w record; c record; n int := 0; _u uuid;
begin
  for w in
    select wi.* from public.work_items wi
     where wi.kind = 'conversation' and wi.status in ('queued','reserved')
       and wi.sla_due_at < now() and wi.sla_due_at > now() - interval '24 hours'
       and wi.sla_alerted_at is null
       and (wi.scheduled_at is null or wi.scheduled_at <= now())
     order by wi.sla_due_at limit 200
  loop
    update public.work_items set sla_alerted_at = now() where id = w.id;
    perform public.emit_event(w.account_id, 'conversation.sla_breached', 'conversation', w.source_id,
      jsonb_build_object('work_item_id', w.id, 'due', w.sla_due_at));
    for _u in select m.user_id from public.memberships m
               where m.account_id = w.account_id and m.is_active and m.role in ('owner','admin','manager')
               limit 20 loop
      perform public.notify_user(w.account_id, _u, 'sla_breached',
        'Conversa esperando na fila: ' || coalesce(w.subject, 'sem nome'),
        'Passou do prazo e ninguém pegou. ' || coalesce(left(w.summary, 200), ''),
        '/inbox/' || w.source_id);
    end loop;
    n := n + 1;
  end loop;

  for c in
    select cv.id, cv.account_id, cv.title, cv.last_inbound_at, cv.last_message_preview, wi.id as wid,
           wi.assigned_user_id, coalesce(q.sla_seconds, 20) as sla
      from public.work_items wi
      join public.conversations cv on cv.id = wi.source_id
      left join public.call_queues q on q.id = wi.queue_id
     where wi.kind = 'conversation' and wi.status = 'assigned' and wi.assigned_user_id is not null
       and cv.status = 'open' and cv.last_inbound_at > now() - interval '24 hours'
       and cv.last_inbound_at < now() - make_interval(secs => greatest(coalesce(q.sla_seconds, 20), 300))
       and (wi.metadata->>'reply_alert_for') is distinct from cv.last_inbound_at::text
       and not exists (select 1 from public.messages m
                        where m.conversation_id = cv.id and m.direction = 'out' and not m.is_private and m.sender_type <> 'system'
                          and m.created_at >= cv.last_inbound_at)
     limit 200
  loop
    update public.work_items
       set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('reply_alert_for', c.last_inbound_at::text)
     where id = c.wid;
    perform public.notify_user(c.account_id, c.assigned_user_id, 'sla_warning',
      'Cliente esperando sua resposta: ' || coalesce(c.title, 'conversa'),
      coalesce(left(c.last_message_preview, 200), ''), '/inbox/' || c.id);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.conversation_sla_sweep() from public, anon, authenticated;
grant execute on function public.conversation_sla_sweep() to service_role;

do $$ begin
  perform cron.unschedule('conversation-sla-sweep') where exists (select 1 from cron.job where jobname = 'conversation-sla-sweep');
  perform cron.schedule('conversation-sla-sweep', '* * * * *', 'select public.conversation_sla_sweep()');
end $$;
