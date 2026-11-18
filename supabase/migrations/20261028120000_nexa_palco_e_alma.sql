-- Nexa em modal: cada resposta guarda as partes que a tela desenha (opções, formulário,
-- cartões, etapas), para a conversa reabrir igual. E a "alma do Nexus" ganha dois capítulos
-- que faltavam no que a pessoa conta: a voz da marca e as regras do atendimento.

alter table public.setup_messages
  add column if not exists parts jsonb not null default '[]'::jsonb;

alter table public.setup_facts drop constraint if exists setup_facts_category_check;
alter table public.setup_facts
  add constraint setup_facts_category_check
  check (category in ('empresa', 'clientes', 'produtos', 'atendimento', 'vendas', 'equipe', 'canais', 'voz', 'regras', 'outros'));
