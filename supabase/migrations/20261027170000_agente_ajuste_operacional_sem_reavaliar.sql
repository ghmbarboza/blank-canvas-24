-- Ajuste operacional (tempo de espera, prazo do humano, horário comercial, limite de respostas) não muda
-- o que o agente diz: não cria versão nem pausa o agente ativo. O resto continua exigindo avaliação ≥ 90%.
create or replace function public.tg_ai_agents_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare _rate real;
begin
  if tg_op = 'UPDATE' then
    if (new.persona, new.tone, new.goal, new.instructions, new.handoff_message, new.role, new.channels,
        coalesce(new.settings, '{}'::jsonb) - array['debounce_seconds','human_sla_minutes','business_hours_only','max_replies_per_conversation'])
         is distinct from (old.persona, old.tone, old.goal, old.instructions, old.handoff_message, old.role, old.channels,
        coalesce(old.settings, '{}'::jsonb) - array['debounce_seconds','human_sla_minutes','business_hours_only','max_replies_per_conversation'])
       or new.tools_changed_at is distinct from old.tools_changed_at then
      new.version := old.version + 1;
      if old.status = 'active' and new.status = 'active' and new.role <> 'supervisor' then
        new.status := 'paused';
        new.status_reason := 'Mudou a configuração: rode a avaliação de novo para ligar.';
      end if;
    else
      new.version := old.version;
    end if;
  end if;
  if new.status = 'active' and (tg_op = 'INSERT' or old.status <> 'active') then
    if new.role <> 'supervisor' then
      select r.pass_rate into _rate from public.agent_eval_runs r
       where r.agent_id = new.id and r.agent_version = new.version and r.status = 'done'
       order by coalesce(r.finished_at, r.created_at) desc limit 1;
      if _rate is null or round(_rate::numeric, 4) < 0.9 then
        raise exception 'O agente precisa passar na avaliação com 90%% ou mais antes de ligar.'
          using errcode = 'P0001';
      end if;
    end if;
    new.activated_at := now();
    new.activated_by := auth.uid();
    new.status_reason := null;
  end if;
  new.updated_at := now();
  return new;
end $$;
