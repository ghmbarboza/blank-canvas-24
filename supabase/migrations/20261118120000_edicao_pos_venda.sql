-- Edição de pós-venda (Vínculo, 18/11/2026).
--
-- O que muda:
-- 1. Conta nova nasce pronta para pós-venda: funil "Pós-venda" (jornada do cliente) no lugar do
--    funil "Vendas", recursos de pós-venda ligados e pesquisa de satisfação ao fechar conversa.
-- 2. Dois avisos novos no outbox (domain_events), que as regras de pós-venda escutam:
--    customer.new  -> o contato virou cliente
--    nps.answered  -> o cliente respondeu a pesquisa de 0 a 10 (leva a nota)
--
-- Vale no remix (banco vazio, criado só pelas migrations): o padrão nasce DENTRO de
-- create_account_for, não depende de linha pré-existente nem de gatilho em auth.users.
-- Idempotente: só `create or replace` e `drop trigger if exists` + `create trigger`.
-- Nenhuma função nova é chamada pela API (as duas são de gatilho), então nada entra na lista de
-- garantir_privilegios(): fora da lista, ele mantém as funções fechadas para anon e authenticated.

-- ───────────────────────── 1. conta nova ─────────────────────────
-- Mesma assinatura e mesma trava de 20261028170000_primeiro_usuario_dono.sql: só roda chamada por
-- bootstrap_account, claim_first_account ou pelo gatilho do cadastro, que marcam a transação antes.
-- As etapas ficam iguais a src/features/posvenda/journey.ts (um teste confere os dois).
create or replace function public.create_account_for(_uid uuid, _name text, _full_name text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  _account uuid;
  _pipeline uuid;
begin
  if coalesce(current_setting('nexus.create_account_ok', true), '') <> '1' then
    raise exception 'create_account_for só pelo cadastro' using errcode = '42501';
  end if;
  insert into profiles (id, full_name) values (_uid, nullif(trim(_full_name), ''))
  on conflict (id) do update set full_name = coalesce(excluded.full_name, profiles.full_name);

  -- recursos de pós-venda ligados desde o primeiro acesso; os de venda (metas, treino, campanhas
  -- de e-mail, empresas, captação) ficam desligados até o dono ligar em Ajustes.
  insert into accounts (name, settings)
  values (
    trim(_name),
    jsonb_build_object(
      'modules', jsonb_build_array('meu_dia', 'automacoes', 'gestao'),
      'csat_on_close', true
    )
  )
  returning id into _account;
  insert into memberships (account_id, user_id, role, display_name)
  values (_account, _uid, 'owner', nullif(trim(_full_name), ''));

  -- Jornada do cliente. Só "Perdido" fecha o cartão: as outras etapas ficam abertas porque o
  -- cliente continua na carteira (e as regras precisam mover o cartão para "Em risco").
  insert into pipelines (account_id, name, is_default, position)
  values (_account, 'Pós-venda', true, 0) returning id into _pipeline;
  insert into pipeline_stages (account_id, pipeline_id, name, position, color, probability, kind) values
    (_account, _pipeline, 'Novo cliente', 0, 'sky', 60, 'open'),
    (_account, _pipeline, 'Ativando', 1, 'violet', 70, 'open'),
    (_account, _pipeline, 'Ativo', 2, 'emerald', 90, 'open'),
    (_account, _pipeline, 'Em risco', 3, 'amber', 30, 'open'),
    (_account, _pipeline, 'Recuperado', 4, 'teal', 80, 'open'),
    (_account, _pipeline, 'Perdido', 5, 'rose', 0, 'lost');

  -- o dono de um negócio pequeno também atende: "Minha fila" funciona no primeiro dia
  insert into queue_agents (account_id, user_id) values (_account, _uid) on conflict do nothing;

  update profiles set last_account_id = _account where id = _uid;
  return _account;
end $$;
revoke all on function public.create_account_for(uuid, text, text) from public, anon, authenticated;

-- ───────────────────────── 2. avisos que as regras escutam ─────────────────────────
-- customer.new: o contato virou cliente (mudou de fase para "customer") ou foi cadastrado já como
-- cliente. Importação de planilha ou de outro CRM (source 'import...') NÃO avisa: quem já era
-- cliente antes do Vínculo não recebe boas-vindas atrasada nem enche o WhatsApp de mensagens.
create or replace function public.tg_posvenda_customer_new()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  _became boolean := false;
begin
  if new.lifecycle <> 'customer' then return new; end if;
  -- OLD só existe no UPDATE: por isso os dois casos em ramos separados
  if tg_op = 'INSERT' then
    _became := coalesce(new.source, '') not like 'import%';
  elsif tg_op = 'UPDATE' then
    _became := old.lifecycle is distinct from new.lifecycle;
  end if;
  if _became then
    perform public.emit_event(new.account_id, 'customer.new', 'contact', new.id,
      jsonb_build_object('contact_id', new.id, 'source', new.source));
  end if;
  return new;
end $$;
revoke all on function public.tg_posvenda_customer_new() from public, anon, authenticated;

drop trigger if exists contacts_posvenda_customer_new on public.contacts;
create trigger contacts_posvenda_customer_new
  after insert or update of lifecycle on public.contacts
  for each row execute function public.tg_posvenda_customer_new();

-- nps.answered: primeira resposta do cliente à pesquisa de 0 a 10 (pelo link ou registrada pela IA).
create or replace function public.tg_nps_answered()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  _first boolean := false;
begin
  if new.answered_at is null or new.score is null or new.contact_id is null then return new; end if;
  -- OLD só existe no UPDATE: por isso os dois casos em ramos separados
  if tg_op = 'INSERT' then
    _first := true;
  elsif tg_op = 'UPDATE' then
    _first := old.answered_at is null;
  end if;
  if _first then
    perform public.emit_event(new.account_id, 'nps.answered', 'contact', new.contact_id,
      jsonb_build_object('contact_id', new.contact_id, 'score', new.score,
                         'survey_id', new.survey_id, 'response_id', new.id));
  end if;
  return new;
end $$;
revoke all on function public.tg_nps_answered() from public, anon, authenticated;

drop trigger if exists nps_responses_answered on public.nps_responses;
create trigger nps_responses_answered
  after insert or update of answered_at on public.nps_responses
  for each row execute function public.tg_nps_answered();

-- A nota de 0 a 10 que o agente de IA registra na conversa (ferramenta record_survey) fica em
-- agent_survey_answers: avisa do mesmo jeito, para a nota baixa virar chamado também por ali.
create or replace function public.tg_agent_nps_answered()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'nps' and new.contact_id is not null then
    perform public.emit_event(new.account_id, 'nps.answered', 'contact', new.contact_id,
      jsonb_build_object('contact_id', new.contact_id, 'score', new.score, 'via', 'agente'));
  end if;
  return new;
end $$;
revoke all on function public.tg_agent_nps_answered() from public, anon, authenticated;

drop trigger if exists agent_survey_answers_nps on public.agent_survey_answers;
create trigger agent_survey_answers_nps
  after insert on public.agent_survey_answers
  for each row execute function public.tg_agent_nps_answered();
