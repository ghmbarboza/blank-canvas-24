-- Nexus One · endurecimento. No Supabase o anon recebe EXECUTE por default privileges,
-- então revogar de PUBLIC não basta: revoga-se de anon explicitamente.

alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;

revoke execute on function public.is_member(uuid) from anon;
revoke execute on function public.has_role(uuid, public.app_role[]) from anon;
revoke execute on function public.is_manager(uuid) from anon;
revoke execute on function public.can_see_channel(uuid) from anon;
revoke execute on function public.can_see_conversation(uuid) from anon;
revoke execute on function public.on_message_inserted() from anon, authenticated;
revoke execute on function public.on_deal_stage_change() from anon, authenticated;
revoke execute on function public.touch_updated_at() from anon;
-- invite_preview continua aberta a anon de propósito: a tela de convite abre antes do login
-- e a função só devolve o nome da conta para quem tem o token.
