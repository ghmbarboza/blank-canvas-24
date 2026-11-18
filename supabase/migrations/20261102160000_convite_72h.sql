-- Revisão de lançamento (P2-6): convite pendente vale menos tempo e some quando vence.
-- O aceite já exige o token do link E o mesmo e-mail da conta (accept_invite); aqui só a validade.
alter table public.invites alter column expires_at set default now() + interval '72 hours';

-- Limpeza: cc_housekeeping roda pela fila de tarefas a cada poucos minutos. Acrescenta a remoção
-- de convites não aceitos vencidos há mais de 1 dia (mantém um dia para a tela mostrar "venceu").
create or replace function public.cc_housekeeping() returns jsonb
language plpgsql security definer set search_path = public as $$
declare _r int; _w int; _i int;
begin
  update public.work_items set status = 'queued', reserved_user_id = null, reserved_until = null,
         declined_by = case when reserved_user_id is null then declined_by else array_append(declined_by, reserved_user_id) end
   where status = 'reserved' and reserved_until < now() - interval '5 seconds';
  get diagnostics _r = row_count;
  update public.work_items set status = 'done', closed_at = now(), close_reason = 'pós-atendimento não confirmado'
   where status = 'wrap_up' and ended_at < now() - interval '24 hours';
  get diagnostics _w = row_count;
  update public.agent_presence set wrap_up_until = null where wrap_up_until < now() - interval '1 minute';
  delete from public.invites where accepted_at is null and expires_at < now() - interval '1 day';
  get diagnostics _i = row_count;
  return jsonb_build_object('reservations_released', _r, 'wrapups_closed', _w, 'invites_expired', _i);
end $$;
revoke all on function public.cc_housekeeping() from public, anon, authenticated;
grant execute on function public.cc_housekeeping() to service_role;
