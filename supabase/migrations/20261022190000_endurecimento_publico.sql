-- Endurecimento depois da revisão de segurança das rotas públicas (21/10).
-- Pagamento da proposta: dois cliques simultâneos em "Pagar" não geram duas cobranças.
create unique index if not exists payments_one_open_per_proposal
  on public.payments (proposal_id, kind)
  where proposal_id is not null and status in ('pending','confirmed','received','overdue');
