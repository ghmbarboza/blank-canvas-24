-- #18: o worker do livecoach roda no LiveKit Cloud Agents, que o põe para dormir sem reunião e
-- acorda quando uma sala abre. Sem sinal e sem reunião ao vivo = dormindo (não abre alerta, e
-- fecha o alerta falso que ficou aberto desde 22/10). Fora do ar só com reunião ao vivo há mais
-- de 2 min e o worker sem sinal. Mesma regra de src/features/health/heartbeats.ts (ON_DEMAND).
create or replace function public.check_service_heartbeats()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; _opened int := 0; _closed int := 0; _id uuid; _sent boolean; _stale boolean;
  _live boolean := exists (select 1 from public.meetings
                            where status = 'live' and ended_at is null and started_at < now() - interval '2 minutes');
begin
  for r in
    select service, max(last_seen) as last_seen from public.service_heartbeats group by service
  loop
    _stale := r.last_seen < now() - interval '3 minutes';
    if _stale and r.service = 'livecoach-worker' and not _live then
      _stale := false; -- dormindo por desenho
    end if;
    if _stale then
      insert into public.platform_alerts (service, message, details)
      values (r.service,
              format('%s sem sinal desde %s', r.service, to_char(r.last_seen at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI')),
              jsonb_build_object('last_seen', r.last_seen))
      on conflict (service, kind) where resolved_at is null do nothing
      returning id into _id;
      if _id is not null then
        _opened := _opened + 1;
        _sent := public.platform_alert_email(
          format('[Nexus One] %s fora do ar', r.service),
          format(E'O serviço %s não manda sinal de vida desde %s (horário de Brasília).\nConfira /api/health e os logs do serviço.',
                 r.service, to_char(r.last_seen at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI:SS')));
        if _sent then update public.platform_alerts set notified_at = now() where id = _id; end if;
      end if;
    else
      update public.platform_alerts set resolved_at = now()
      where service = r.service and kind = 'service_down' and resolved_at is null
      returning id into _id;
      if _id is not null then
        _closed := _closed + 1;
        _sent := public.platform_alert_email(
          format('[Nexus One] %s normalizado', r.service),
          format('O serviço %s está normal às %s (horário de Brasília).',
                 r.service, to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI:SS')));
        if _sent then update public.platform_alerts set resolved_notified_at = now() where id = _id; end if;
      end if;
    end if;
    _id := null;
  end loop;
  return jsonb_build_object('opened', _opened, 'closed', _closed);
end $$;
revoke execute on function public.check_service_heartbeats() from public, anon, authenticated;
