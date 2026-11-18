-- Piloto automático com freio: quando um agente de IA (motor Agents SDK) quer fazer algo
-- sensível (cobrar, disparar sequência, agir num sistema externo), a rodada PAUSA aqui.
-- O estado inteiro da rodada fica em run_state (texto do SDK); quando o gestor aprova ou
-- recusa, o servidor retoma exatamente de onde parou e responde o cliente.
-- conversation_id nulo = veio do simulador ("testar conversando").

create table if not exists public.agent_approvals (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  agent_id uuid references public.ai_agents(id) on delete set null,
  -- o agente por onde a rodada começou: o SDK remonta a equipe a partir dele para retomar
  root_agent_id uuid references public.ai_agents(id) on delete set null,
  run_id uuid references public.ai_agent_runs(id) on delete set null,
  tool text not null check (length(tool) between 1 and 120),
  args jsonb not null default '{}'::jsonb,
  -- o que a IA quer fazer, em palavras de gente (o gestor decide lendo isto)
  summary text not null default '' check (length(summary) <= 2000),
  run_state text not null check (length(run_state) <= 2000000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired', 'error')),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  -- o que o cliente recebeu depois da decisão (ou o erro da retomada)
  outcome text,
  created_at timestamptz not null default now()
);
create index if not exists agent_approvals_pending on public.agent_approvals (account_id, created_at desc) where status = 'pending';
alter table public.agent_approvals enable row level security;
drop policy if exists agent_approvals_read on public.agent_approvals;
create policy agent_approvals_read on public.agent_approvals for select using (public.is_member(account_id));
-- decisão só pelo servidor (service role), depois de conferir o papel de quem clicou

do $$ begin
  alter publication supabase_realtime add table public.agent_approvals;
exception when duplicate_object then null; when undefined_object then null; end $$;

-- a rodada que parou para aprovação tem status próprio (não é resposta nem passagem para humano)
alter table public.ai_agent_runs drop constraint if exists ai_agent_runs_status_check;
alter table public.ai_agent_runs add constraint ai_agent_runs_status_check
  check (status in ('queued', 'replied', 'handoff', 'skipped', 'error', 'awaiting_approval'));
