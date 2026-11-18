-- "Atendimentos hoje" da Equipe de IA lê ai_agent_runs por conta e dia; sem este índice a leitura
-- varre a tabela inteira conforme o volume cresce.
create index if not exists ai_agent_runs_account_created on public.ai_agent_runs (account_id, created_at desc);
create index if not exists agent_handoffs_account_created on public.agent_handoffs (account_id, created_at desc);
