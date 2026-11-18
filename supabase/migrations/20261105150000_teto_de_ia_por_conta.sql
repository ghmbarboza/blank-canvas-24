-- R9 · teto mensal de IA por conta. O servidor soma o custo de IA do mês (usage_ledger, kind 'llm') antes de
-- escolher o provedor; acima do teto, só a IA para (atendimento humano, filas e canais seguem).
-- SECURITY INVOKER: o servidor (service_role) lê tudo; gestor lê só a própria conta pela RLS do usage_ledger.
create or replace function public.ai_month_spend(_account uuid)
returns numeric
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(sum(cost_usd), 0)::numeric
  from public.usage_ledger
  where account_id = _account
    and kind = 'llm'
    and created_at >= date_trunc('month', now());
$$;

revoke all on function public.ai_month_spend(uuid) from public, anon;
grant execute on function public.ai_month_spend(uuid) to authenticated, service_role;
