-- Novos provedores em Integrações: Cloudflare Turnstile (anti-robô nos formulários públicos),
-- Google Lead Forms (webhook do Google Ads) e Amazon SES (envio de e-mail).
-- A CHECK é refeita somando os novos aos que já existem no banco, para não derrubar provedor
-- acrescentado por outra frente em paralelo.
do $$
declare _current text[]; _all text[];
begin
  -- aceita os dois formatos que o Postgres imprime: ARRAY['x'::text, ...] e '{x,y}'::text[]
  select coalesce(array_agg(m[1]), '{}') into _current
  from pg_constraint c,
       regexp_matches(pg_get_constraintdef(c.oid), '([a-z][a-z0-9_]+)', 'g') as m
  where c.conrelid = 'public.account_integrations'::regclass
    and c.conname = 'account_integrations_provider_check';
  select array_agg(distinct p order by p) into _all
  from unnest(array(select x from unnest(_current) x where x not in ('check','provider','any','array','text')) || array['evolution','zernio','meta','twilio','openai','anthropic','google','resend',
    'livekit','deepgram','zadarma','elevenlabs','asaas','microsoft','meta_leads','zapsign',
    'turnstile','google_leads','ses']) as p;
  alter table public.account_integrations drop constraint if exists account_integrations_provider_check;
  execute format(
    'alter table public.account_integrations add constraint account_integrations_provider_check check (provider = any (array[%s]))',
    (select string_agg(quote_literal(p), ',') from unnest(_all) as p));
end $$;
