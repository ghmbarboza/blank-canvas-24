-- Nexus One · remover um canal NÃO apaga o histórico. As conversas ficam sem canal
-- (channel_id null) e continuam visíveis para gestores; vendedores deixam de vê-las.

alter table public.conversations alter column channel_id drop not null;
alter table public.conversations drop constraint if exists conversations_channel_id_fkey;
alter table public.conversations
  add constraint conversations_channel_id_fkey
  foreign key (channel_id) references public.channels(id) on delete set null;

create or replace function public.can_see_conversation(_conversation uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from conversations cv
    where cv.id = _conversation
      and (
        public.can_see_channel(cv.channel_id)
        or (cv.assignee_user_id = auth.uid() and public.is_member(cv.account_id))
        or (cv.channel_id is null and public.is_manager(cv.account_id))
      )
  );
$$;
revoke execute on function public.can_see_conversation(uuid) from public, anon;
grant execute on function public.can_see_conversation(uuid) to authenticated, service_role;
