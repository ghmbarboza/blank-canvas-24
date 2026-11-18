-- "Qual campanha deu retorno": a campanha passa a vir com a rede, se foi anúncio pago, e o funil
-- (leads → negócios abertos → ganhos → receita). Mesmas chaves de antes (first_touch, last_touch,
-- campaigns), com campos novos; a tela antiga continua lendo o que lia.
-- Origem do lead: primeiro toque gravado (formulário, chat do site, anúncio de cadastro e, desde
-- 27/10, mensagem pela Zernio com o anúncio que abriu a conversa).
create or replace function public.report_attribution(_account uuid, _from date, _to date)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare _s timestamptz := _from::timestamptz; _e timestamptz := (_to + 1)::timestamptz; _out jsonb;
begin
  perform public.report_guard(_account);
  with leads as (
    select c.id, c.created_at,
           coalesce(nullif(c.first_touch->>'source', ''), nullif(c.custom->>'utm_source', ''), nullif(c.source, ''), 'direto') first_touch,
           coalesce(nullif(c.last_touch->>'source', ''), nullif(c.first_touch->>'source', ''), nullif(c.custom->>'utm_source', ''), nullif(c.source, ''), 'direto') last_touch,
           coalesce(nullif(c.first_touch->>'campaign', ''), nullif(c.custom->>'utm_campaign', '')) campaign,
           lower(coalesce(c.first_touch->>'medium', c.custom->>'utm_medium', '')) in ('paid', 'cpc', 'ppc', 'ads', 'cpm', 'paid_social') paid
    from public.contacts c where c.account_id = _account
  ),
  won as (
    select d.value, l.first_touch, l.last_touch, l.campaign from public.deals d join leads l on l.id = d.contact_id
    where d.account_id = _account and d.status = 'won' and d.closed_at >= _s and d.closed_at < _e
  ),
  period as (select * from leads where created_at >= _s and created_at < _e),
  camp as (
    select p.first_touch source, p.campaign, bool_or(p.paid) paid, count(distinct p.id) leads,
           count(distinct d.contact_id) filter (where d.status = 'open') open_deals,
           count(distinct d.id) filter (where d.status = 'won') won,
           coalesce(sum(d.value) filter (where d.status = 'won'), 0) revenue
    from period p left join public.deals d on d.contact_id = p.id and d.account_id = _account
    where p.campaign is not null
    group by 1, 2
  )
  select jsonb_build_object(
    'first_touch', coalesce((select jsonb_agg(jsonb_build_object('source', s, 'leads', n,
        'paid', pd,
        'revenue', (select coalesce(sum(value), 0) from won w where w.first_touch = x.s),
        'deals', (select count(*) from won w where w.first_touch = x.s)) order by n desc)
      from (select first_touch s, count(*) n, count(*) filter (where paid) pd from period group by 1) x), '[]'::jsonb),
    'last_touch', coalesce((select jsonb_agg(jsonb_build_object('source', s, 'revenue', r, 'deals', n) order by r desc)
      from (select last_touch s, sum(value) r, count(*) n from won group by 1) x), '[]'::jsonb),
    -- negócios ganhos de leads de campanha contam no período em que o lead entrou (o retorno daquela campanha)
    'campaigns', coalesce((select jsonb_agg(jsonb_build_object('campaign', campaign, 'source', source, 'paid', paid,
        'leads', leads, 'open_deals', open_deals, 'won', won, 'revenue', revenue) order by revenue desc, leads desc)
      from (select * from camp order by revenue desc, leads desc limit 50) x), '[]'::jsonb),
    'totals', jsonb_build_object(
      'leads', (select count(*) from period),
      'paid_leads', (select count(*) from period where paid),
      'with_origin', (select count(*) from period where first_touch <> 'direto'))
  ) into _out;
  return _out;
end $$;
grant execute on function public.report_attribution(uuid, date, date) to authenticated, service_role;
