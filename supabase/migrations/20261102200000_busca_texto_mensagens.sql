-- Busca da Caixa de entrada no texto das mensagens (inventário da central de comando, 02/11):
-- o filtro usa ILIKE '%termo%' em messages.body, que só é rápido com índice trigram.
create index if not exists messages_body_trgm
  on public.messages using gin (body extensions.gin_trgm_ops)
  where body is not null;
