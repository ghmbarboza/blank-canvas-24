-- Versiona o gatilho de perfil que existia só no banco do original (criado pelo painel Cloud do
-- Lovable em 21/10, fora das migrations). Ele cria a linha em profiles no cadastro.
-- Atenção: o remix do Lovable NÃO copia gatilhos de auth.users. Por isso o app não depende dele:
-- claim_first_account / create_account_for / accept_invite também gravam o perfil (on conflict).
create or replace function public.create_auth_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', '')), ''),
    nullif(new.raw_user_meta_data->>'avatar_url', '')
  )
  on conflict (id) do nothing;
  return new;
end $$;

revoke execute on function public.create_auth_profile() from public, anon, authenticated;

drop trigger if exists nexus_create_auth_profile on auth.users;
create trigger nexus_create_auth_profile
  after insert on auth.users
  for each row execute function public.create_auth_profile();
