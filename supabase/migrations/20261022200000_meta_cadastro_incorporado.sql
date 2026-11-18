-- Cadastro incorporado da Meta (WhatsApp oficial em 1 clique): o app da Meta é da PLATAFORMA (VIA).
-- Segredos no Vault: platform:meta_app_id, platform:meta_es_config_id, platform:meta_app_secret,
-- platform:meta_verify_token (gerado aqui). Sem app id/config/secret, a tela mostra só o formulário manual.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'platform:meta_verify_token') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(24), 'hex'), 'platform:meta_verify_token');
  end if;
end $$;

create or replace function public.platform_meta() returns jsonb
language sql stable security definer set search_path = public, vault as $$
  select jsonb_build_object(
    'app_id', (select decrypted_secret from vault.decrypted_secrets where name = 'platform:meta_app_id'),
    'config_id', (select decrypted_secret from vault.decrypted_secrets where name = 'platform:meta_es_config_id'),
    'app_secret', (select decrypted_secret from vault.decrypted_secrets where name = 'platform:meta_app_secret'),
    'verify_token', (select decrypted_secret from vault.decrypted_secrets where name = 'platform:meta_verify_token')
  );
$$;
revoke all on function public.platform_meta() from public, anon, authenticated;
grant execute on function public.platform_meta() to service_role;
