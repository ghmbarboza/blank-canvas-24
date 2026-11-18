-- Relatório por canal de atendimento (#74): cc_indicators ganha by_channel (WhatsApp, chat do
-- site, e-mail, voz, chamado…) com as mesmas métricas de fila e atendente. Mais um grouping set
-- na mesma consulta; total, by_queue e by_agent continuam iguais.
do $$ declare d text; begin
  d := pg_get_functiondef('public.cc_indicators(uuid,timestamp with time zone,timestamp with time zone)'::regprocedure);
  if position('by_channel' in d) > 0 then return; end if;
  d := replace(d, 'select grouping(queue_id) as gq, grouping(assigned_user_id) as gu, queue_id, assigned_user_id,',
                  'select grouping(queue_id) as gq, grouping(assigned_user_id) as gu, grouping(channel) as gc, queue_id, assigned_user_id, channel,');
  d := replace(d, 'group by grouping sets ((), (queue_id), (assigned_user_id))',
                  'group by grouping sets ((), (queue_id), (assigned_user_id), (channel))');
  d := replace(d, 'from g x where gq = 1 and gu = 1)', 'from g x where gq = 1 and gu = 1 and gc = 1)');
  d := replace(d, '- ''gq'' - ''gu''', '- ''gq'' - ''gu'' - ''gc'' - ''channel''');
  d := replace(d, '''by_ai_agent'',',
    '''by_channel'', coalesce((select jsonb_agg((to_jsonb(x) - ''gq'' - ''gu'' - ''gc'' - ''queue_id'' - ''assigned_user_id'') order by x.offered desc)
                              from g x where x.gc = 0), ''[]''::jsonb),
      ''by_ai_agent'',');
  if position('by_channel' in d) = 0 or position('grouping(channel)' in d) = 0 then
    raise exception 'cc_indicators mudou: revise a migração de indicadores por canal';
  end if;
  execute d;
end $$;
