-- Volta a regra do onboarding (decisão do Guilherme, 05/11/2026): no remix, o primeiro usuário
-- vira dono; os demais entram por convite do dono, em Equipe. Desfaz 20261105000000 (que foi
-- aplicada nos dois bancos e depois retirada do repositório).

drop function if exists public.install_first_owner(uuid, text);

create or replace function public.claim_first_account(_full_name text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  _uid uuid := auth.uid();
  _account uuid;
begin
  if _uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  perform public.garantir_privilegios();
  select account_id into _account from memberships where user_id = _uid and is_active limit 1;
  if _account is not null then return _account; end if;
  perform pg_advisory_xact_lock(hashtext('nexus:first-user-owner'));
  if exists (select 1 from accounts) then return null; end if;
  perform set_config('nexus.create_account_ok', '1', true);
  return public.create_account_for(_uid, 'Minha empresa', _full_name);
end $$;

create or replace function public.bootstrap_account(_name text, _full_name text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  _uid uuid := auth.uid();
begin
  if _uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if length(trim(coalesce(_name, ''))) < 2 then raise exception 'name too short' using errcode = '22023'; end if;
  if exists (select 1 from memberships where user_id = _uid and is_active) then
    raise exception 'Você já faz parte de uma central.' using errcode = 'P0001';
  end if;
  if exists (select 1 from accounts)
     and not coalesce((select multi_account from platform_settings where id), false) then
    raise exception 'Esta central já tem dono. Peça um convite a quem administra.' using errcode = 'P0001';
  end if;
  perform set_config('nexus.create_account_ok', '1', true);
  return public.create_account_for(_uid, _name, _full_name);
end $$;

create or replace function public.tg_first_user_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('nexus:first-user-owner'));
  if not exists (select 1 from accounts) then
    perform set_config('nexus.create_account_ok', '1', true);
    perform public.create_account_for(
      new.id,
      'Minha empresa',
      coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')
    );
  end if;
  return new;
exception when others then
  raise warning 'first_user_owner: %', sqlerrm;
  return new;
end $$;
revoke all on function public.tg_first_user_owner() from public, anon, authenticated;
