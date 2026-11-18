-- Correção achada na prova do remix descartável (#20): `text[] || 'literal'` faz o Postgres ler o
-- literal como array e falhar (22P02) justamente no 1º acesso de um remix, quando os segredos não
-- existem. No original eles já existiam e o caminho nunca rodou. array_append resolve.
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
    _created := array_append(_created, 'cron_secret');
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
    if coalesce(_base, '') = '' or (_force and _base <> _origin_clean) then
      perform public._platform_put('platform:app_base_url', _origin_clean);
      _created := array_append(_created, 'app_base_url');
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

