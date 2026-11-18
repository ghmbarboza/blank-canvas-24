-- Atendente marca na Agenda sem ajuste manual (18/11/2026).
--
-- As ações de agenda do atendente (ver horários, marcar, remarcar) só entram quando o atendente
-- tem um link de agendamento apontado em settings.booking_slug. Ninguém preenchia isso: o cliente
-- pedia uma ligação e a IA passava para a equipe. Agora o banco aponta sozinho:
--   * criou um link de agendamento na Agenda -> os atendentes da conta que não têm link passam a
--     usar esse;
--   * criou um atendente numa conta que já tem link -> ele nasce apontando para o primeiro ativo.
-- Quem escolheu um link de propósito não é alterado.
create or replace function public.tg_booking_page_to_agents()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.is_active then
    update ai_agents
       set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('booking_slug', new.slug)
     where account_id = new.account_id
       and coalesce(settings->>'booking_slug', '') = '';
  end if;
  return new;
end $$;
revoke all on function public.tg_booking_page_to_agents() from public, anon, authenticated;

drop trigger if exists booking_pages_to_agents on public.booking_pages;
create trigger booking_pages_to_agents after insert on public.booking_pages
  for each row execute function public.tg_booking_page_to_agents();

create or replace function public.tg_agent_default_booking()
returns trigger language plpgsql security definer set search_path = public as $$
declare _slug text;
begin
  if coalesce(new.settings->>'booking_slug', '') = '' then
    select slug into _slug from booking_pages
     where account_id = new.account_id and is_active order by created_at limit 1;
    if _slug is not null then
      new.settings := coalesce(new.settings, '{}'::jsonb) || jsonb_build_object('booking_slug', _slug);
    end if;
  end if;
  return new;
end $$;
revoke all on function public.tg_agent_default_booking() from public, anon, authenticated;

drop trigger if exists ai_agents_default_booking on public.ai_agents;
create trigger ai_agents_default_booking before insert on public.ai_agents
  for each row execute function public.tg_agent_default_booking();

-- quem já tem link e atendente sem apontar
update ai_agents a
   set settings = coalesce(a.settings, '{}'::jsonb) || jsonb_build_object('booking_slug', p.slug)
  from (select distinct on (account_id) account_id, slug from booking_pages
         where is_active order by account_id, created_at) p
 where p.account_id = a.account_id and coalesce(a.settings->>'booking_slug', '') = '';
