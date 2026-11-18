-- Gravação de reunião feita pelo worker do livecoach (o LiveKit Cloud só grava com storage externo).
-- Bucket privado; o caminho começa pela conta. Membro lê só os arquivos da própria conta (URL assinada);
-- quem grava é o servidor (service role) por URL de upload assinada entregue ao worker.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('meeting-recordings', 'meeting-recordings', false, 209715200, array['audio/ogg', 'audio/webm', 'video/mp4'])
on conflict (id) do nothing;

drop policy if exists meeting_recordings_select on storage.objects;
create policy meeting_recordings_select on storage.objects for select to authenticated
  using (
    bucket_id = 'meeting-recordings'
    and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    and public.is_member(((storage.foldername(name))[1])::uuid)
  );
