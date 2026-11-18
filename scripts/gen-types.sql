-- Gera o bloco `public` de src/integrations/supabase/types.ts direto do banco (Tables, Views, Functions, Enums).
-- Uso: rodar no banco (query_database) e colar a coluna `ts` em scripts/types-public.generated.ts;
-- depois `bun scripts/apply-types.ts` monta o types.ts. Mesmo formato do gerador oficial do Supabase.
with
cols as (
  select c.table_name, c.column_name, c.ordinal_position, c.is_nullable = 'YES' as nullable,
         c.column_default is not null or c.is_identity = 'YES' as has_default,
         c.is_generated = 'ALWAYS' as generated,
         c.data_type, c.udt_name,
         case
           when c.data_type = 'ARRAY' then
             case ltrim(c.udt_name, '_')
               when 'int2' then 'number' when 'int4' then 'number' when 'int8' then 'number'
               when 'float4' then 'number' when 'float8' then 'number' when 'numeric' then 'number'
               when 'bool' then 'boolean' when 'json' then 'Json' when 'jsonb' then 'Json'
               else case when exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                                      where t.typname = ltrim(c.udt_name, '_') and n.nspname = 'public' and t.typtype = 'e')
                         then 'Database["public"]["Enums"]["' || ltrim(c.udt_name, '_') || '"]' else 'string' end
             end || '[]'
           when c.data_type = 'USER-DEFINED' and exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                                      where t.typname = c.udt_name and n.nspname = 'public' and t.typtype = 'e')
             then 'Database["public"]["Enums"]["' || c.udt_name || '"]'
           when c.udt_name in ('int2','int4','int8','float4','float8','numeric') then 'number'
           when c.udt_name = 'bool' then 'boolean'
           when c.udt_name in ('json','jsonb') then 'Json'
           when c.udt_name in ('uuid','text','varchar','bpchar','citext','date','timestamptz','timestamp','time','timetz','interval','inet','vector','bytea','name') then 'string'
           else 'unknown'
         end as ts_type
  from information_schema.columns c
  where c.table_schema = 'public'
),
rels as (
  select t.relname as table_name,
         string_agg(format(E'          {\n            foreignKeyName: "%s"\n            columns: [%s]\n            isOneToOne: %s\n            referencedRelation: "%s"\n            referencedColumns: [%s]\n          },',
           con.conname,
           (select string_agg('"' || a.attname || '"', ', ' order by k.ord) from unnest(con.conkey) with ordinality k(attnum, ord)
              join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum),
           case when exists (select 1 from pg_index i where i.indrelid = con.conrelid and i.indisunique
                               and (i.indkey::int2[])::int2[] @> con.conkey and array_length(i.indkey::int2[], 1) = array_length(con.conkey, 1))
                then 'true' else 'false' end,
           rt.relname,
           (select string_agg('"' || a.attname || '"', ', ' order by k.ord) from unnest(con.confkey) with ordinality k(attnum, ord)
              join pg_attribute a on a.attrelid = con.confrelid and a.attnum = k.attnum)
         ), E'\n' order by con.conname) as rel_ts
  from pg_constraint con
  join pg_class t on t.oid = con.conrelid
  join pg_namespace tn on tn.oid = t.relnamespace and tn.nspname = 'public'
  join pg_class rt on rt.oid = con.confrelid
  join pg_namespace rn on rn.oid = rt.relnamespace and rn.nspname = 'public'
  where con.contype = 'f'
  group by t.relname
),
tabs as (
  select c.relname as name, c.relkind
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r','v','m','p')
),
table_ts as (
  select t.name, t.relkind,
    format(E'      %s: {\n        Row: {\n%s\n        }\n%s        Relationships: [\n%s        ]\n      }',
      t.name,
      (select string_agg(format('          %s: %s%s', cl.column_name, cl.ts_type, case when cl.nullable then ' | null' else '' end), E'\n' order by cl.column_name)
         from cols cl where cl.table_name = t.name),
      case when t.relkind in ('r','p') then
        format(E'        Insert: {\n%s\n        }\n        Update: {\n%s\n        }\n',
          (select string_agg(format('          %s%s: %s%s', cl.column_name,
                     case when cl.nullable or cl.has_default or cl.generated then '?' else '' end,
                     case when cl.generated then 'never' else cl.ts_type end,
                     case when cl.nullable and not cl.generated then ' | null' else '' end), E'\n' order by cl.column_name)
             from cols cl where cl.table_name = t.name),
          (select string_agg(format('          %s?: %s%s', cl.column_name,
                     case when cl.generated then 'never' else cl.ts_type end,
                     case when cl.nullable and not cl.generated then ' | null' else '' end), E'\n' order by cl.column_name)
             from cols cl where cl.table_name = t.name))
      else '' end,
      coalesce((select r.rel_ts || E'\n' from rels r where r.table_name = t.name), '')
    ) as ts
  from tabs t
),
pgtype as (
  select oid, case
    when typname in ('int2','int4','int8','float4','float8','numeric') then 'number'
    when typname = 'bool' then 'boolean'
    when typname in ('json','jsonb') then 'Json'
    when typname = 'void' then 'undefined'
    when typname in ('uuid','text','varchar','bpchar','date','timestamptz','timestamp','interval','inet','name') then 'string'
    when typname = '_text' or typname = '_uuid' or typname = '_varchar' then 'string[]'
    when typname = '_int4' or typname = '_int2' or typname = '_int8' then 'number[]'
    when typtype = 'e' then 'Database["public"]["Enums"]["' || typname || '"]'
    when typname like '\_%' and exists (select 1 from pg_type e where e.typname = substr(pg_type.typname, 2) and e.typtype = 'e')
      then 'Database["public"]["Enums"]["' || substr(typname, 2) || '"][]'
    else 'unknown' end as ts
  from pg_type
),
funcs as (
  select p.proname, p.oid, p.proretset, p.prorettype, p.pronargdefaults,
         p.proargnames, p.proargmodes, coalesce(p.proallargtypes, string_to_array(nullif(p.proargtypes::text, ''), ' ')::oid[]) as alltypes,
         p.proargtypes::oid[] as intypes
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f'
    and p.prorettype <> 'trigger'::regtype
    and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('service_role', p.oid, 'execute'))
    and p.proname not like 'tg\_%'
),
func_ts as (
  select f.proname,
    format(E'      %s: {\n        Args: %s\n        Returns: %s\n      }',
      f.proname,
      coalesce((
        select '{ ' || string_agg(format('%s%s: %s', a.name, case when a.optional then '?' else '' end, a.ts), '; ' order by a.name) || ' }'
        from (
          select f.proargnames[i] as name, coalesce(pt.ts, 'unknown') as ts,
                 (row_number() over (order by i desc)) <= f.pronargdefaults as optional
          from generate_subscripts(f.alltypes, 1) i
          left join pgtype pt on pt.oid = f.alltypes[i]
          where coalesce(f.proargmodes[i], 'i') in ('i','b') and f.proargnames[i] is not null and f.proargnames[i] <> ''
        ) a
      ), 'never'),
      case
        when f.proargmodes is not null and 't' = any(f.proargmodes) then
          '{ ' || (select string_agg(format('%s: %s', f.proargnames[i], coalesce(pt.ts, 'unknown')), '; ' order by f.proargnames[i])
                   from generate_subscripts(f.alltypes, 1) i left join pgtype pt on pt.oid = f.alltypes[i]
                   where f.proargmodes[i] = 't') || ' }[]'
        when exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                     where c.reltype = f.prorettype and n.nspname = 'public') then
          'Database["public"]["Tables"]["' || (select c.relname from pg_class c where c.reltype = f.prorettype) || '"]["Row"]' || case when f.proretset then '[]' else '' end
        else coalesce((select ts from pgtype where oid = f.prorettype), 'unknown') || case when f.proretset then '[]' else '' end
      end) as ts
  from funcs f
  where not exists (select 1 from funcs f2 where f2.proname = f.proname and f2.oid < f.oid) -- sem sobrecarga
),
enums as (
  select t.typname, string_agg('"' || e.enumlabel || '"', ' | ' order by e.enumsortorder) as vals
  from pg_type t join pg_enum e on e.enumtypid = t.oid join pg_namespace n on n.oid = t.typnamespace
  where n.nspname = 'public' group by t.typname
)
select
  E'  public: {\n    Tables: {\n' ||
  coalesce((select string_agg(ts, E'\n' order by name) from table_ts where relkind in ('r','p')), '      [_ in never]: never') ||
  E'\n    }\n    Views: {\n' ||
  coalesce((select string_agg(ts, E'\n' order by name) from table_ts where relkind in ('v','m')), '      [_ in never]: never') ||
  E'\n    }\n    Functions: {\n' ||
  coalesce((select string_agg(ts, E'\n' order by proname) from func_ts), '      [_ in never]: never') ||
  E'\n    }\n    Enums: {\n' ||
  coalesce((select string_agg(format('      %s: %s', typname, vals), E'\n' order by typname) from enums), '      [_ in never]: never') ||
  E'\n    }\n    CompositeTypes: {\n      [_ in never]: never\n    }\n  }' as ts;
