-- Revisão do go-live (04/11):
-- 1) O gatilho que apaga os trechos ao editar um artigo rodava como quem edita (authenticated),
--    que não pode apagar kb_chunks: editar pela tela daria 42501. Agora é security definer.
-- 2) Campanha agendada: o disparo da fila trava a linha e só segue se continua agendada para a
--    MESMA hora (cancelar/reagendar no meio não dispara). Público vazio volta a rascunho;
--    erro passageiro sobe para a fila tentar de novo (não rebaixa nada).
create or replace function public.tg_kb_reset_embedding() returns trigger language plpgsql
security definer set search_path = public as $$
begin
  if new.title is distinct from old.title or new.body_md is distinct from old.body_md
     or new.category is distinct from old.category then
    new.embedding := null; new.embedded_at := null; new.embedding_model := null; new.chunk_count := 0;
    delete from public.kb_chunks where article_id = new.id;
  end if;
  return new;
end $$;
revoke all on function public.tg_kb_reset_embedding() from public, anon, authenticated;

create or replace function public._start_scheduled_whatsapp_campaign(_campaign uuid, _at timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.whatsapp_campaigns; n int;
begin
  select * into c from public.whatsapp_campaigns where id = _campaign for update;
  if c.id is null or c.status <> 'scheduled' then
    return jsonb_build_object('skipped', 'campanha não está agendada');
  end if;
  if c.scheduled_at is distinct from _at then
    return jsonb_build_object('skipped', 'reagendada para outro horário');
  end if;
  begin
    n := public._launch_whatsapp_campaign(_campaign);
  exception when sqlstate 'P0001' then
    update public.whatsapp_campaigns set status = 'draft' where id = c.id and status = 'scheduled';
    return jsonb_build_object('skipped', sqlerrm);
  end;
  return jsonb_build_object('targets', n);
end $$;
revoke all on function public._start_scheduled_whatsapp_campaign(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public._start_scheduled_whatsapp_campaign(uuid, timestamptz) to service_role;
