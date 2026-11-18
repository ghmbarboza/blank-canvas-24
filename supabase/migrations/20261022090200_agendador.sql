-- Agenda o tick da plataforma: a cada minuto o pg_cron chama /api/public/cron (fila de jobs,
-- outbox de eventos, webhooks, automações, lembretes). O segredo vem do Vault (cron_config).
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'nexus-tick') then
    perform cron.schedule('nexus-tick', '* * * * *', 'select public.cron_tick()');
  end if;
end $$;
