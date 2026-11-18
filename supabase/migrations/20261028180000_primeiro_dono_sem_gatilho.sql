-- O remix do Lovable NÃO copia gatilhos de auth.users (provado em 28/10 num remix descartável:
-- nem o nexus_first_user_owner nem o gatilho do perfil chegaram). A regra "primeiro usuário vira
-- dono" precisa morar numa função do schema public, que viaja no remix.
-- claim_first_account: chamada ao entrar sem central; se o banco ainda não tem nenhuma conta,
-- quem chama vira dono (atômico: dois ao mesmo tempo, só um ganha). Senão devolve null e a
-- pessoa só entra por convite.

create or replace function public.claim_first_account(_full_name text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  _uid uuid := auth.uid();
  _account uuid;
begin
  if _uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select account_id into _account from memberships where user_id = _uid and is_active limit 1;
  if _account is not null then return _account; end if;
  perform pg_advisory_xact_lock(hashtext('nexus:first-user-owner'));
  if exists (select 1 from accounts) then return null; end if;
  perform set_config('nexus.create_account_ok', '1', true);
  return public.create_account_for(_uid, 'Minha empresa', _full_name);
end $$;
grant execute on function public.claim_first_account(text) to authenticated;
