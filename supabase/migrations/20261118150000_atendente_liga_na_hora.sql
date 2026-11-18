-- Edição de pós-venda (Vínculo, 18/11/2026): o atendente de IA liga na hora.
--
-- Antes, ligar exigia uma avaliação com 90% de acerto (minutos de espera, e podia reprovar com a base
-- vazia), e qualquer mudança de configuração pausava o atendente até reavaliar. Numa aula ao vivo e
-- para o dono de um negócio pequeno isso é atrito: criou, ligou. A avaliação continua existindo como
-- ferramenta em Equipe de IA, só deixa de ser trava.
--
-- O que fica: a versão sobe quando a configuração muda, e a data e o autor da ativação são gravados.
create or replace function public.tg_ai_agents_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if (new.persona, new.tone, new.goal, new.instructions, new.handoff_message, new.role, new.channels,
        coalesce(new.settings, '{}'::jsonb) - array['debounce_seconds','human_sla_minutes','business_hours_only','max_replies_per_conversation'])
         is distinct from (old.persona, old.tone, old.goal, old.instructions, old.handoff_message, old.role, old.channels,
        coalesce(old.settings, '{}'::jsonb) - array['debounce_seconds','human_sla_minutes','business_hours_only','max_replies_per_conversation'])
       or new.tools_changed_at is distinct from old.tools_changed_at then
      new.version := old.version + 1;
    else
      new.version := old.version;
    end if;
  end if;
  if new.status = 'active' and (tg_op = 'INSERT' or old.status <> 'active') then
    new.activated_at := now();
    new.activated_by := auth.uid();
    new.status_reason := null;
  end if;
  new.updated_at := now();
  return new;
end $$;
