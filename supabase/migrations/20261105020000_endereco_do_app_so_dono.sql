-- Endereço do app só pelo dono (revisão de segurança de 05/11, R2).
-- Antes: qualquer admin chamava garantir_plataforma(_origin, true) com uma Origin forjada; no minuto
-- seguinte o cron_tick postava o x-cron-secret no servidor dele, e com esse segredo ele chamava
-- /api/public/cron e assinava tokens de ligação (serverSigningKey usava o mesmo segredo).
-- Agora:
--   1. Endereço vazio: grava (como antes). Endereço já gravado: só o DONO troca, e a troca vai
--      para o audit_log. A regra está no CORPO da função, porque o remix do Lovable não copia
--      REVOKE/GRANT. Pela service role (o app), quem confere o dono e a origem é /api/platform,
--      que também grava o audit_log com o autor.
--   2. Chave de assinatura separada do segredo do agendador: platform:signing_key, criada junto
--      com os demais segredos e devolvida pelo cron_config (só service_role) para o servidor.
--   3. "É o servidor?" é auth.role() = 'service_role' ou uma conexão que NÃO veio pelo PostgREST
--      (pg_cron, migration: session_user é o dono dos jobs/funções). NUNCA current_user: dentro de
--      SECURITY DEFINER ele é o dono da função (postgres), e a checagem antiga deixava qualquer
--      usuário logado passar. Pelo PostgREST o session_user é sempre authenticator. Lista de
--      recusa (authenticator/anon/authenticated) e não de dono, para o pg_cron não parar se o dono
--      dos jobs no Lovable Cloud tiver outro nome. Vale para cron_config, garantir_plataforma e
--      record_heartbeat (corrigidas aqui).
--   4. _platform_put/_platform_has viram SECURITY INVOKER: só funcionam de dentro de outra função
--      do banco (que roda como postgres) ou como postgres. Antes eram SECURITY DEFINER sem
--      checagem nenhuma e, no remix (que não copia REVOKE), qualquer visitante gravava no Vault
--      até o garantir_privilegios rodar.
-- O resto de garantir_plataforma e cron_config fica igual à última definição
-- (20261027150000_garantir_plataforma_array.sql e 20261027090000_pronto_para_remix.sql).

create or replace function public.cron_config() returns jsonb
language plpgsql stable security definer set search_path = public, vault as $$
declare _secret text; _base text; _signing text;
begin
  if coalesce(auth.role(), '') <> 'service_role' and session_user in ('authenticator','anon','authenticated') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select decrypted_secret into _secret from vault.decrypted_secrets where name = 'platform:cron_secret';
  select decrypted_secret into _base from vault.decrypted_secrets where name = 'platform:app_base_url';
  select decrypted_secret into _signing from vault.decrypted_secrets where name = 'platform:signing_key';
  return jsonb_build_object('secret', _secret, 'base_url', _base, 'signing_key', _signing);
end $$;
revoke all on function public.cron_config() from public, anon, authenticated;
grant execute on function public.cron_config() to service_role;

create or replace function public.garantir_plataforma(_origin text default null, _force boolean default false)
returns jsonb
language plpgsql security definer set search_path = public, vault, cron as $$
declare
  _created text[] := '{}';
  _base text;
  _origin_clean text := lower(rtrim(coalesce(_origin, ''), '/'));
  _jobs int;
  _mismatch boolean := false;
  _service boolean := coalesce(auth.role(), '') = 'service_role'
    or session_user not in ('authenticator','anon','authenticated');
  _owner_account uuid;
begin
  if not _service then
    if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
    if not exists (select 1 from public.memberships m
                    where m.user_id = auth.uid() and m.is_active and m.role in ('owner','admin')) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    select m.account_id into _owner_account from public.memberships m
     where m.user_id = auth.uid() and m.is_active and m.role = 'owner'
     order by m.created_at limit 1;
  end if;

  -- segredos que a própria plataforma gera (os de terceiros ficam com o assistente)
  if not public._platform_has('platform:cron_secret') then
    perform public._platform_put('platform:cron_secret', encode(extensions.gen_random_bytes(32), 'hex'));
    _created := array_append(_created, 'cron_secret');
  end if;
  if not public._platform_has('platform:signing_key') then
    perform public._platform_put('platform:signing_key', encode(extensions.gen_random_bytes(32), 'hex'));
    _created := array_append(_created, 'signing_key');
  end if;
  if not public._platform_has('platform:agent_secret') then
    perform public._platform_put('platform:agent_secret', encode(extensions.gen_random_bytes(32), 'hex'));
    _created := array_append(_created, 'agent_secret');
  end if;
  if not public._platform_has('platform:email_link_secret') then
    perform public._platform_put('platform:email_link_secret', encode(extensions.gen_random_bytes(32), 'hex'));
    _created := array_append(_created, 'email_link_secret');
  end if;
  if not public._platform_has('platform:meta_verify_token') then
    perform public._platform_put('platform:meta_verify_token', encode(extensions.gen_random_bytes(16), 'hex'));
    _created := array_append(_created, 'meta_verify_token');
  end if;

  select decrypted_secret into _base from vault.decrypted_secrets where name = 'platform:app_base_url';
  if public._platform_origin_ok(_origin_clean) then
    if coalesce(_base, '') = '' then
      -- endereço vazio também é só do dono (ou do servidor, que confere a origem antes): um admin
      -- com Origin forjada gravaria o servidor dele como destino do segredo do agendador
      if _service or _owner_account is not null then
        perform public._platform_put('platform:app_base_url', _origin_clean);
        _created := array_append(_created, 'app_base_url');
        _base := _origin_clean;
      end if;
    elsif _force and _base <> _origin_clean then
      -- trocar um endereço já gravado: só o dono (ou o servidor, que confere o dono antes)
      if not _service and _owner_account is null then
        raise exception 'Só o dono da conta pode trocar o endereço do app.' using errcode = '42501';
      end if;
      perform public._platform_put('platform:app_base_url', _origin_clean);
      _created := array_append(_created, 'app_base_url');
      if not _service then
        insert into public.audit_log (account_id, actor_id, action, entity, entity_id, meta)
        values (_owner_account, auth.uid(), 'platform.app_base_url_changed', 'platform', null,
                jsonb_build_object('from', _base, 'to', _origin_clean));
      end if;
      _base := _origin_clean;
    elsif _base <> _origin_clean then
      _mismatch := true;
    end if;
  end if;

  _jobs := public._platform_jobs();

  return jsonb_build_object(
    'created', to_jsonb(_created),
    'jobs_created', _jobs,
    'app_base_url', _base,
    'origin_mismatch', _mismatch,
    'origin_accepted', public._platform_origin_ok(_origin_clean)
  );
end $$;
revoke all on function public.garantir_plataforma(text, boolean) from public, anon;
grant execute on function public.garantir_plataforma(text, boolean) to authenticated, service_role;

-- Bancos que já existem (original e remixes onde esta migration roda): cria a chave de assinatura
-- agora, para o servidor parar de assinar com o segredo do agendador. Remix novo cria pelo
-- garantir_plataforma acima no primeiro acesso.
do $$
begin
  if not public._platform_has('platform:signing_key') then
    perform public._platform_put('platform:signing_key', encode(extensions.gen_random_bytes(32), 'hex'));
  end if;
end $$;

-- record_heartbeat: igual a 20261022224000_saude_heartbeats.sql, só a checagem de quem chama muda.
create or replace function public.record_heartbeat(_service text, _instance text, _meta jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and session_user in ('authenticator','anon','authenticated') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.service_heartbeats (service, instance, last_seen, meta)
  values (_service, left(coalesce(nullif(_instance, ''), 'default'), 120), now(), coalesce(_meta, '{}'::jsonb))
  on conflict (service, instance) do update set last_seen = excluded.last_seen, meta = excluded.meta;
end $$;
revoke execute on function public.record_heartbeat(text, text, jsonb) from public, anon, authenticated;

-- _platform_put/_platform_has: corpo igual a 20261027090000_pronto_para_remix.sql, agora
-- SECURITY INVOKER e com a checagem explícita (current_user aqui É quem chama: o dono das funções
-- quando vem de garantir_plataforma, platform_set_vapid, portal_secret etc.; anon/authenticated
-- quando chamado direto pelo PostgREST). Lista de recusa, e não de dono, para não depender do nome
-- do papel que é dono das funções no Lovable Cloud.
create or replace function public._platform_put(_name text, _value text) returns void
language plpgsql security invoker set search_path = public, vault as $$
declare _id uuid;
begin
  if current_user in ('anon','authenticated','authenticator') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select id into _id from vault.secrets where name = _name;
  if _id is null then perform vault.create_secret(_value, _name);
  else perform vault.update_secret(_id, _value);
  end if;
end $$;
revoke all on function public._platform_put(text, text) from public, anon, authenticated;

create or replace function public._platform_has(_name text) returns boolean
language plpgsql stable security invoker set search_path = public, vault as $$
begin
  if current_user in ('anon','authenticated','authenticator') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return exists (select 1 from vault.decrypted_secrets where name = _name and coalesce(decrypted_secret, '') <> '');
end $$;
revoke all on function public._platform_has(text) from public, anon, authenticated;
