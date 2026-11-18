-- Assinatura eletrônica da proposta (ZapSign). A proposta guarda o documento, o link do signatário,
-- o estado e o PDF assinado; o webhook da ZapSign é o único que marca "signed".
alter table public.account_integrations drop constraint if exists account_integrations_provider_check;
alter table public.account_integrations add constraint account_integrations_provider_check
  check (provider = any (array['evolution','zernio','meta','twilio','openai','anthropic','google','resend',
    'livekit','deepgram','zadarma','elevenlabs','asaas','microsoft','meta_leads','zapsign']));

alter table public.proposals
  add column if not exists signature_provider text check (signature_provider in ('zapsign')),
  add column if not exists signature_doc_id text,
  add column if not exists signature_status text check (signature_status in ('pending','signed','refused')),
  add column if not exists signature_url text,
  add column if not exists signature_sent_at timestamptz,
  add column if not exists signed_at timestamptz,
  add column if not exists signed_file_url text;
create unique index if not exists proposals_signature_doc on public.proposals (signature_doc_id)
  where signature_doc_id is not null;
