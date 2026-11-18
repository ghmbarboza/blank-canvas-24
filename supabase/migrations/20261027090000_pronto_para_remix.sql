-- Pronto para remix (#20).
-- Um remix do Lovable copia tabelas e funções, mas NÃO copia o Vault, os jobs do pg_cron nem roda
-- os blocos DO das migrations. Tudo o que o app precisa para funcionar sozinho nasce aqui, sob
-- demanda, no primeiro acesso do dono: public.garantir_plataforma(_origin).
-- Idempotente: pode ser chamada a cada login sem efeito colateral.

-- cron_config sem endereço fixo do app original: sem endereço gravado, o tick não dispara.
create or replace function public.cron_config() returns jsonb
language plpgsql stable security definer set search_path = public, vault as $$
declare _secret text; _base text;
begin
  if auth.role() <> 'service_role' and current_user not in ('postgres','supabase_admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select decrypted_secret into _secret from vault.decrypted_secrets where name = 'platform:cron_secret';
  select decrypted_secret into _base from vault.decrypted_secrets where name = 'platform:app_base_url';
  return jsonb_build_object('secret', _secret, 'base_url', _base);
end $$;
revoke all on function public.cron_config() from public, anon, authenticated;
grant execute on function public.cron_config() to service_role;

create or replace function public.cron_tick() returns bigint
language plpgsql security definer set search_path = public, net as $$
declare _cfg jsonb := public.cron_config(); _id bigint;
begin
  if coalesce(_cfg->>'base_url', '') = '' or coalesce(_cfg->>'secret', '') = '' then
    return null; -- remix ainda sem garantir_plataforma: não chama ninguém (nunca o app original)
  end if;
  select net.http_post(
    url := (_cfg->>'base_url') || '/api/public/cron',
    body := jsonb_build_object('at', now()),
    headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', _cfg->>'secret'),
    timeout_milliseconds := 25000
  ) into _id;
  return _id;
end $$;
revoke all on function public.cron_tick() from public, anon, authenticated;

-- Grava ou troca um segredo da plataforma no Vault.
create or replace function public._platform_put(_name text, _value text) returns void
language plpgsql security definer set search_path = public, vault as $$
declare _id uuid;
begin
  select id into _id from vault.secrets where name = _name;
  if _id is null then perform vault.create_secret(_value, _name);
  else perform vault.update_secret(_id, _value);
  end if;
end $$;
revoke all on function public._platform_put(text, text) from public, anon, authenticated;

create or replace function public._platform_has(_name text) returns boolean
language sql stable security definer set search_path = public, vault as $$
  select exists (select 1 from vault.decrypted_secrets where name = _name and coalesce(decrypted_secret, '') <> '');
$$;
revoke all on function public._platform_has(text) from public, anon, authenticated;

-- Endereço que serve de base: só https, sem caminho, e nunca a prévia do editor (exige login do Lovable).
create or replace function public._platform_origin_ok(_origin text) returns boolean
language sql immutable as $$
  select _origin ~ '^https://[a-z0-9.-]+(:[0-9]+)?$'
     and _origin !~ '(id-preview--|preview--|lovableproject\.com|localhost)';
$$;

-- Os 5 jobs que o produto precisa. Cada um só é criado se não existir.
create or replace function public._platform_jobs() returns int
language plpgsql security definer set search_path = public, cron as $$
declare _n int := 0;
begin
  if not exists (select 1 from cron.job where jobname = 'nexus-tick') then
    perform cron.schedule('nexus-tick', '* * * * *', 'select public.cron_tick()'); _n := _n + 1;
  end if;
  if not exists (select 1 from cron.job where jobname = 'support-sla-sweep') then
    perform cron.schedule('support-sla-sweep', '*/5 * * * *', 'select public.support_sla_sweep()'); _n := _n + 1;
  end if;
  if not exists (select 1 from cron.job where jobname = 'nexus-forecast-snapshot') then
    perform cron.schedule('nexus-forecast-snapshot', '0 9 * * 1', 'select public.take_forecast_snapshots()'); _n := _n + 1;
  end if;
  if not exists (select 1 from cron.job where jobname = 'nexus-weekly-reports') then
    perform cron.schedule('nexus-weekly-reports', '0 11 * * 1', 'select public.enqueue_scheduled_reports()'); _n := _n + 1;
  end if;
  if not exists (select 1 from cron.job where jobname = 'nexus-health') then
    perform cron.schedule('nexus-health', '* * * * *', 'select public.check_service_heartbeats()'); _n := _n + 1;
  end if;
  return _n;
end $$;
revoke all on function public._platform_jobs() from public, anon, authenticated;

-- Estado da instalação, por peça. Lido pelo /api/health e pelo assistente de configuração.
create or replace function public.platform_status() returns jsonb
language plpgsql stable security definer set search_path = public, vault, cron as $$
declare _base text;
begin
  select decrypted_secret into _base from vault.decrypted_secrets where name = 'platform:app_base_url';
  return jsonb_build_object(
    'app_base_url', _base,
    'cron_secret', public._platform_has('platform:cron_secret'),
    'agent_secret', public._platform_has('platform:agent_secret'),
    'email_link_secret', public._platform_has('platform:email_link_secret'),
    'meta_verify_token', public._platform_has('platform:meta_verify_token'),
    'vapid', public._platform_has('platform:vapid_public') and public._platform_has('platform:vapid_private'),
    'jobs', (select coalesce(jsonb_agg(jobname order by jobname), '[]'::jsonb) from cron.job
              where jobname in ('nexus-tick','support-sla-sweep','nexus-forecast-snapshot','nexus-weekly-reports','nexus-health')),
    'jobs_expected', 5,
    'last_tick', (select max(last_seen) from public.service_heartbeats where service = 'app-cron')
  );
end $$;
revoke all on function public.platform_status() from public, anon, authenticated;
grant execute on function public.platform_status() to service_role;

-- Garante a plataforma. Quem chama: o dono/admin de uma conta (pelo app) ou a service role.
-- _origin: o endereço público de onde o dono acessou. Grava se ainda não houver endereço.
-- Se já houver outro, só troca com _force (botão "usar este endereço" no assistente).
create or replace function public.garantir_plataforma(_origin text default null, _force boolean default false)
returns jsonb
language plpgsql security definer set search_path = public, vault, cron as $$
declare
  _created text[] := '{}';
  _base text;
  _origin_clean text := lower(rtrim(coalesce(_origin, ''), '/'));
  _jobs int;
  _mismatch boolean := false;
begin
  if auth.role() <> 'service_role' and current_user not in ('postgres','supabase_admin') then
    if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
    if not exists (select 1 from public.memberships m
                    where m.user_id = auth.uid() and m.is_active and m.role in ('owner','admin')) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  end if;

  -- segredos que a própria plataforma gera (os de terceiros ficam com o assistente)
  if not public._platform_has('platform:cron_secret') then
    perform public._platform_put('platform:cron_secret', encode(extensions.gen_random_bytes(32), 'hex'));
    _created := _created || 'cron_secret';
  end if;
  if not public._platform_has('platform:agent_secret') then
    perform public._platform_put('platform:agent_secret', encode(extensions.gen_random_bytes(32), 'hex'));
    _created := _created || 'agent_secret';
  end if;
  if not public._platform_has('platform:email_link_secret') then
    perform public._platform_put('platform:email_link_secret', encode(extensions.gen_random_bytes(32), 'hex'));
    _created := _created || 'email_link_secret';
  end if;
  if not public._platform_has('platform:meta_verify_token') then
    perform public._platform_put('platform:meta_verify_token', encode(extensions.gen_random_bytes(16), 'hex'));
    _created := _created || 'meta_verify_token';
  end if;

  select decrypted_secret into _base from vault.decrypted_secrets where name = 'platform:app_base_url';
  if public._platform_origin_ok(_origin_clean) then
    if coalesce(_base, '') = '' or (_force and _base <> _origin_clean) then
      perform public._platform_put('platform:app_base_url', _origin_clean);
      _created := _created || 'app_base_url';
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

-- Grava as chaves VAPID geradas pelo servidor (o par de chaves EC sai do WebCrypto, não do SQL).
create or replace function public.platform_set_vapid(_public text, _private text) returns boolean
language plpgsql security definer set search_path = public, vault as $$
begin
  if public._platform_has('platform:vapid_public') and public._platform_has('platform:vapid_private') then
    return false;
  end if;
  perform public._platform_put('platform:vapid_public', _public);
  perform public._platform_put('platform:vapid_private', _private);
  return true;
end $$;
revoke all on function public.platform_set_vapid(text, text) from public, anon, authenticated;
grant execute on function public.platform_set_vapid(text, text) to service_role;
