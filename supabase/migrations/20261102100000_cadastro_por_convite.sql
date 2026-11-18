-- Revisão de lançamento (P1-2/P0-6): a tela de login oferecia "Criar conta" a qualquer visitante.
-- signup_mode() diz à tela deslogada o que mostrar, sem expor nada além disso:
--   first_owner  banco sem nenhuma central (remix novo): o primeiro cadastro vira dono
--   open         original de desenvolvimento com várias contas (platform_settings.multi_account)
--   invite_only  central já tem dono: cadastro só pelo link de convite
create or replace function public.signup_mode()
returns text language sql stable security definer set search_path = public as $$
  select case
    when not exists (select 1 from public.accounts) then 'first_owner'
    when coalesce((select multi_account from public.platform_settings limit 1), false) then 'open'
    else 'invite_only'
  end
$$;
revoke all on function public.signup_mode() from public;
grant execute on function public.signup_mode() to anon, authenticated, service_role;
