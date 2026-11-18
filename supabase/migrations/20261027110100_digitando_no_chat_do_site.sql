-- "Digitando" no chat do site: o agente marca até quando está escrevendo; o widget mostra enquanto valer.
alter table public.agent_conversation_state add column if not exists typing_until timestamptz;
