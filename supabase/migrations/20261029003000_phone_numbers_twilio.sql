-- Número já importado na ElevenLabs pela Twilio (sem tronco SIP da Zadarma): a ligação de saída
-- vai por /v1/convai/twilio/outbound-call. Antes só 'zadarma' passava.
alter table public.phone_numbers drop constraint if exists phone_numbers_provider_check;
alter table public.phone_numbers
  add constraint phone_numbers_provider_check check (provider = any (array['zadarma'::text, 'twilio'::text]));
