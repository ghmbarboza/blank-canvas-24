-- Integração Nexus → Flow CRM (revisão de 27/10, P3-1): novo provedor em Integrações.
-- Mesmo padrão de 20261022224100: refaz a CHECK somando ao que já existe no banco, para não
-- derrubar provedor acrescentado por outra frente.
do $$
declare _current text[]; _all text[];
begin
  select coalesce(array_agg(m[1]), '{}') into _current
  from pg_constraint c,
       regexp_matches(pg_get_constraintdef(c.oid), '([a-z][a-z0-9_]+)', 'g') as m
  where c.conrelid = 'public.account_integrations'::regclass
    and c.conname = 'account_integrations_provider_check';
  select array_agg(distinct p order by p) into _all
  from unnest(array(select x from unnest(_current) x where x not in ('check','provider','any','array','text'))
    || array['flowcrm']) as p;
  alter table public.account_integrations drop constraint if exists account_integrations_provider_check;
  execute format(
    'alter table public.account_integrations add constraint account_integrations_provider_check check (provider = any (array[%s]))',
    (select string_agg(quote_literal(p), ',') from unnest(_all) as p));
end $$;
