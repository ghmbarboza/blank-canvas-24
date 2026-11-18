-- Quem vira cliente entra sozinho na Carteira (18/11/2026).
--
-- A Carteira mostra cartões (deals) do funil de pós-venda. Marcar o contato como cliente ligava
-- as regras de pós-venda e a nota de saúde, mas a Carteira continuava vazia: faltava o cartão.
-- Agora o mesmo gatilho que avisa `customer.new` cria o cartão na primeira etapa do funil padrão,
-- se o contato ainda não tiver um aberto. Vale também para importação: a carteira é a lista de
-- clientes, e só o AVISO (boas-vindas) é que não dispara para quem já era cliente.
create or replace function public.tg_posvenda_customer_new()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  _became boolean := false;
  _pipeline uuid;
  _stage uuid;
begin
  if new.lifecycle <> 'customer' then return new; end if;
  -- OLD só existe no UPDATE: por isso os dois casos em ramos separados
  if tg_op = 'INSERT' then
    _became := coalesce(new.source, '') not like 'import%';
  elsif tg_op = 'UPDATE' then
    _became := old.lifecycle is distinct from new.lifecycle;
  end if;

  if tg_op = 'INSERT' or old.lifecycle is distinct from new.lifecycle then
    if not exists (select 1 from deals where contact_id = new.id and status = 'open') then
      select id into _pipeline from pipelines
        where account_id = new.account_id order by is_default desc, position limit 1;
      if _pipeline is not null then
        select id into _stage from pipeline_stages
          where pipeline_id = _pipeline and kind = 'open' order by position limit 1;
      end if;
      if _stage is not null then
        insert into deals (account_id, pipeline_id, stage_id, contact_id, title, owner_user_id, source)
        values (new.account_id, _pipeline, _stage, new.id,
                coalesce(nullif(trim(new.name), ''), 'Cliente'), new.owner_user_id, 'pos_venda');
      end if;
    end if;
  end if;

  if _became then
    perform public.emit_event(new.account_id, 'customer.new', 'contact', new.id,
      jsonb_build_object('contact_id', new.id, 'source', new.source));
  end if;
  return new;
end $$;
revoke all on function public.tg_posvenda_customer_new() from public, anon, authenticated;

-- quem já é cliente e ainda não tem cartão
insert into deals (account_id, pipeline_id, stage_id, contact_id, title, owner_user_id, source)
select c.account_id, p.id, s.id, c.id, coalesce(nullif(trim(c.name), ''), 'Cliente'), c.owner_user_id, 'pos_venda'
from contacts c
join lateral (select id from pipelines where account_id = c.account_id order by is_default desc, position limit 1) p on true
join lateral (select id from pipeline_stages where pipeline_id = p.id and kind = 'open' order by position limit 1) s on true
where c.lifecycle = 'customer'
  and not exists (select 1 from deals d where d.contact_id = c.id and d.status = 'open');
