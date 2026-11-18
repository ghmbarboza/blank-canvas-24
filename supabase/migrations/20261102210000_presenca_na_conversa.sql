-- Colisão entre atendentes (#61): quem está vendo ou digitando numa conversa aparece para os
-- colegas, pelo Realtime em canal PRIVADO "conversa:<id>". Só entra no canal quem já pode ver a
-- conversa (a mesma regra da RLS de conversations); com a chave pública ninguém escuta.
drop policy if exists "presenca_conversa_ler" on realtime.messages;
create policy "presenca_conversa_ler" on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension in ('presence', 'broadcast')
    and realtime.topic() ~ '^conversa:[0-9a-f-]{36}$'
    and public.can_see_conversation(substring(realtime.topic() from 10)::uuid)
  );

drop policy if exists "presenca_conversa_enviar" on realtime.messages;
create policy "presenca_conversa_enviar" on realtime.messages
  for insert to authenticated
  with check (
    realtime.messages.extension in ('presence', 'broadcast')
    and realtime.topic() ~ '^conversa:[0-9a-f-]{36}$'
    and public.can_see_conversation(substring(realtime.topic() from 10)::uuid)
  );
