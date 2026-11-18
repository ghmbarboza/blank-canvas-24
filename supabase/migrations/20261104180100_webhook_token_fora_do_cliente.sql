-- Revisão de segurança de 04/11, S7: channels.webhook_token (segredo do webhook da Evolution e
-- verify token do WhatsApp) não é mais legível por anon/authenticated. O SELECT da tabela vira
-- SELECT por coluna, sem ela. Quem precisa do token (edge functions, rotas do servidor) usa
-- service_role. O front lista os canais por colunas explícitas (select("*") quebraria).
-- garantir_privilegios() passa a vigiar colunas com segredo, porque o remix não copia GRANT.

-- 1) channels.webhook_token fora do alcance do cliente ----------------------------------------
do $$ declare _c text; begin
  revoke select on table public.channels from anon, authenticated;
  for _c in select column_name from information_schema.columns
             where table_schema = 'public' and table_name = 'channels' and column_name <> 'webhook_token'
  loop
    execute format('grant select (%I) on table public.channels to anon, authenticated', _c);
  end loop;
end $$;

-- 2) garantir_privilegios() vigia as colunas com segredo -------------------------------------
do $$ declare d text; begin
  d := pg_get_functiondef('public.garantir_privilegios()'::regprocedure);
  if position('_hidden_cols' in d) = 0 then
    d := replace(d, E'  r record;\n',
      E'  -- colunas com segredo que o cliente (anon/authenticated) nunca lê; as demais da tabela, sim\n'
      || E'  _hidden_cols text[] := array[''channels.webhook_token''];\n'
      || E'  _col record;\n'
      || E'  r record;\n');
    d := replace(d, E'  return jsonb_build_object(''fixed'', _fixed);',
      E'  for _col in\n'
      || E'    select c.table_name, c.column_name, (c.table_name || ''.'' || c.column_name) = any(_hidden_cols) as hidden\n'
      || E'      from information_schema.columns c\n'
      || E'     where c.table_schema = ''public''\n'
      || E'       and c.table_name in (select split_part(x, ''.'', 1) from unnest(_hidden_cols) x)\n'
      || E'  loop\n'
      || E'    if _col.hidden then\n'
      || E'      if has_column_privilege(''anon'', format(''public.%I'', _col.table_name), _col.column_name, ''select'')\n'
      || E'         or has_column_privilege(''authenticated'', format(''public.%I'', _col.table_name), _col.column_name, ''select'') then\n'
      || E'        execute format(''revoke select on table public.%I from anon, authenticated'', _col.table_name);\n'
      || E'        execute format(''revoke select (%I) on table public.%I from anon, authenticated'', _col.column_name, _col.table_name);\n'
      || E'        _fixed := _fixed + 1;\n'
      || E'      end if;\n'
      || E'    end if;\n'
      || E'  end loop;\n'
      || E'  for _col in\n'
      || E'    select c.table_name, c.column_name\n'
      || E'      from information_schema.columns c\n'
      || E'     where c.table_schema = ''public''\n'
      || E'       and c.table_name in (select split_part(x, ''.'', 1) from unnest(_hidden_cols) x)\n'
      || E'       and not ((c.table_name || ''.'' || c.column_name) = any(_hidden_cols))\n'
      || E'  loop\n'
      || E'    if not has_column_privilege(''authenticated'', format(''public.%I'', _col.table_name), _col.column_name, ''select'')\n'
      || E'       or not has_column_privilege(''anon'', format(''public.%I'', _col.table_name), _col.column_name, ''select'') then\n'
      || E'      execute format(''grant select (%I) on table public.%I to anon, authenticated'', _col.column_name, _col.table_name);\n'
      || E'      _fixed := _fixed + 1;\n'
      || E'    end if;\n'
      || E'  end loop;\n'
      || E'  return jsonb_build_object(''fixed'', _fixed);');
  end if;
  execute d;
end $$;
revoke all on function public.garantir_privilegios() from public, anon, authenticated;
grant execute on function public.garantir_privilegios() to service_role;
select public.garantir_privilegios();
