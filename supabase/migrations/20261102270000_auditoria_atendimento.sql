-- Auditoria das ações de atendimento (#75). Antes conversas não deixavam rastro.
-- Grava quem atribuiu, tirou o responsável, resolveu ou reabriu a conversa. Só ação de pessoa
-- (auth.uid() presente); mudança feita pelo sistema (fila, IA, gatilhos) não entra.
-- A transferência para fila já audita na própria função (conversation.transfer).
create or replace function public.tg_conversation_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid();
begin
  if _uid is null then return new; end if;
  begin
    if new.assignee_user_id is distinct from old.assignee_user_id then
      insert into public.audit_log (account_id, actor_id, action, entity, entity_id, meta)
      values (new.account_id, _uid,
              case when new.assignee_user_id is null then 'conversation.unassigned' else 'conversation.assigned' end,
              'conversations', new.id,
              jsonb_build_object('from', old.assignee_user_id, 'to', new.assignee_user_id));
    end if;
    if new.status is distinct from old.status and (new.status = 'closed' or old.status = 'closed') then
      insert into public.audit_log (account_id, actor_id, action, entity, entity_id, meta)
      values (new.account_id, _uid,
              case when new.status = 'closed' then 'conversation.closed' else 'conversation.reopened' end,
              'conversations', new.id, jsonb_build_object('from', old.status, 'to', new.status));
    end if;
  exception when others then
    raise warning 'auditoria da conversa: %', sqlerrm;
  end;
  return new;
end $$;
revoke all on function public.tg_conversation_audit() from public, anon, authenticated;

drop trigger if exists conversations_audit on public.conversations;
create trigger conversations_audit after update of assignee_user_id, status on public.conversations
  for each row execute function public.tg_conversation_audit();
