-- Revisão de segurança de 04/11 (S9 e o selo "chave cadastrada").
--
-- 1) secret_keys: as rotas do servidor (/api/integrations, /api/gestao) chamam com service_role,
--    onde auth.uid() é nulo e has_role() dava falso: a função recusava e o selo "chave cadastrada"
--    saía sempre falso. service_role passa; o usuário logado continua precisando ser dono/admin.
-- 2) S9: sla_for, add_business_minutes e dev_schema_types eram executáveis por visitante.
--    As duas primeiras só são chamadas por funções SECURITY DEFINER (gatilhos de chamado e
--    sla_for_ticket), que rodam como dono: ninguém de fora precisa do EXECUTE. dev_schema_types
--    é ferramenta de desenvolvimento: só service_role (scripts/gen-types.ts usa a service key).
--    Além do grant, as duas de SLA passam a conferir o vínculo quando chamadas por um usuário.
-- S7 (channels.webhook_token) fica em 20261104180100. Tudo isso entra em garantir_privilegios(),
-- porque o remix não copia REVOKE/GRANT.

-- 1) secret_keys ------------------------------------------------------------------------------
create or replace function public.secret_keys(_account uuid, _scope text, _scope_id uuid)
returns setof text language plpgsql stable security definer set search_path = public, vault as $$
begin
  if auth.role() is distinct from 'service_role'
     and not public.has_role(_account, array['owner','admin']::public.app_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select split_part(s.name, ':', 3) from vault.secrets s
    where s.name like _scope || ':' || _scope_id::text || ':%';
end $$;

-- 2) SLA: só a própria conta (ou o banco/servidor) ---------------------------------------------
create or replace function public.sla_for(_account uuid, _priority text)
returns table(first_response_minutes integer, resolution_minutes integer, business_hours boolean, policy_id uuid)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.role() in ('anon', 'authenticated') and not public.is_member(_account) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select coalesce(p.first_response_minutes, d.f), coalesce(p.resolution_minutes, d.r),
           coalesce(p.business_hours, true), p.id
      from (values ('urgent', 30, 240), ('high', 60, 480), ('normal', 240, 1440), ('low', 480, 4320)) d(prio, f, r)
      left join public.sla_policies p on p.account_id = _account and p.priority = d.prio
     where d.prio = _priority;
end $$;

do $$ declare d text; begin
  d := pg_get_functiondef('public.add_business_minutes(uuid, timestamptz, integer)'::regprocedure);
  if position('is_member(_account)' in d) = 0 then
    d := regexp_replace(d, E'\nbegin\n',
      E'\nbegin\n  if auth.role() in (''anon'', ''authenticated'') and not public.is_member(_account) then\n    raise exception ''forbidden'' using errcode = ''42501'';\n  end if;\n');
    execute d;
  end if;
end $$;

revoke all on function public.sla_for(uuid, text) from public, anon, authenticated;
revoke all on function public.add_business_minutes(uuid, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.dev_schema_types(text) from public, anon, authenticated;
grant execute on function public.sla_for(uuid, text) to service_role;
grant execute on function public.add_business_minutes(uuid, timestamptz, integer) to service_role;
grant execute on function public.dev_schema_types(text) to service_role;

-- 3) garantir_privilegios(): tira as três da lista de visitante ---------------------------------
do $$ declare d text; begin
  d := pg_get_functiondef('public.garantir_privilegios()'::regprocedure);
  d := regexp_replace(d, '''add_business_minutes\(_account uuid, _from timestamp with time zone, _minutes integer\)'',\s*', '');
  d := regexp_replace(d, '''dev_schema_types\(_token text\)'',\s*', '');
  d := regexp_replace(d, '''sla_for\(_account uuid, _priority text\)'',\s*', '');
  execute d;
end $$;
revoke all on function public.garantir_privilegios() from public, anon, authenticated;
grant execute on function public.garantir_privilegios() to service_role;
select public.garantir_privilegios();
