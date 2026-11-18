-- Prova de RLS como usuário autenticado (não como postgres). Roda num bloco que termina em
-- RAISE EXCEPTION: o resultado volta na mensagem e TUDO é desfeito (nenhum dado fica no banco).
-- Cada item mostra "obtido(esperado)". Executar após qualquer mudança de policy ou função.
do $$
declare
  u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid(); u3 uuid := gen_random_uuid();
  a1 uuid; a2 uuid; p1 uuid; s1 uuid; ch_shared uuid; ch_private uuid; ch_other uuid;
  ct_owned uuid; ct_free uuid; ct_other uuid; n int; r text := '';
begin
  insert into auth.users (id, email, aud, role) values
    (u1, 'rls-owner-a@test.local', 'authenticated', 'authenticated'),
    (u2, 'rls-owner-b@test.local', 'authenticated', 'authenticated'),
    (u3, 'rls-seller-a@test.local', 'authenticated', 'authenticated');
  insert into accounts (name) values ('Tenant A') returning id into a1;
  insert into accounts (name) values ('Tenant B') returning id into a2;
  insert into memberships (account_id, user_id, role) values (a1, u1, 'owner'), (a1, u3, 'seller'), (a2, u2, 'owner');
  insert into channels (account_id, provider, platform, name, external_id, is_shared) values (a1, 'evolution', 'whatsapp', 'Compartilhado', 'i1', true) returning id into ch_shared;
  insert into channels (account_id, provider, platform, name, external_id, is_shared, owner_user_id) values (a1, 'evolution', 'whatsapp', 'Do dono', 'i2', false, u1) returning id into ch_private;
  insert into channels (account_id, provider, platform, name, external_id) values (a2, 'evolution', 'whatsapp', 'Outra empresa', 'i3') returning id into ch_other;
  insert into contacts (account_id, name, owner_user_id) values (a1, 'Do dono', u1) returning id into ct_owned;
  insert into contacts (account_id, name) values (a1, 'Sem dono') returning id into ct_free;
  insert into contacts (account_id, name) values (a2, 'Outra empresa') returning id into ct_other;
  insert into conversations (account_id, channel_id, contact_id, external_thread_id) values
    (a1, ch_shared, ct_free, 't1'), (a1, ch_private, ct_owned, 't2'), (a2, ch_other, ct_other, 't3');
  insert into pipelines (account_id, name, is_default) values (a1, 'Vendas', true) returning id into p1;
  insert into pipeline_stages (account_id, pipeline_id, name, kind) values (a1, p1, 'Novo', 'open') returning id into s1;
  insert into deals (account_id, pipeline_id, stage_id, title, owner_user_id) values (a1, p1, s1, 'Do dono', u1), (a1, p1, s1, 'Sem dono', null);

  -- vendedor da empresa A
  perform set_config('request.jwt.claims', json_build_object('sub', u3, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from accounts; r := r || 'vendedor.contas=' || n || '(1) ';
  select count(*) into n from conversations; r := r || 'vendedor.conversas=' || n || '(1) ';
  select count(*) into n from contacts; r := r || 'vendedor.contatos=' || n || '(1) ';
  select count(*) into n from deals; r := r || 'vendedor.negocios=' || n || '(1) ';
  select count(*) into n from channels; r := r || 'vendedor.canais=' || n || '(1) ';
  update memberships set role = 'admin' where user_id = u3; get diagnostics n = row_count; r := r || 'vendedor.promover_a_si=' || n || '(0) ';
  begin perform public.secret_get('integration', a1, 'x'); r := r || 'vendedor.secret_get=PERMITIDO(negado) ';
  exception when insufficient_privilege then r := r || 'vendedor.secret_get=negado ok '; end;
  begin perform public.secret_set(a1, 'integration', a1, 'evolution_api_key', 'x'); r := r || 'vendedor.secret_set=PERMITIDO(negado) ';
  exception when insufficient_privilege then r := r || 'vendedor.secret_set=negado ok '; end;
  execute 'reset role';

  -- dono da empresa A vê tudo dela e nada da B
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from conversations; r := r || 'donoA.conversas=' || n || '(2) ';
  select count(*) into n from contacts where account_id = a2; r := r || 'donoA.contatos_de_B=' || n || '(0) ';
  update contacts set name = 'invadido' where id = ct_other; get diagnostics n = row_count; r := r || 'donoA.editar_contato_B=' || n || '(0) ';
  begin insert into messages (account_id, conversation_id, direction, sender_type, type, body, is_private, sender_user_id)
    select a2, id, 'out', 'user', 'note', 'x', true, u1 from conversations where channel_id = ch_other;
    get diagnostics n = row_count; r := r || 'donoA.nota_em_B=' || n || '(0) ';
  exception when insufficient_privilege then r := r || 'donoA.nota_em_B=negado ok '; end;
  execute 'reset role';

  -- anônimo
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
  select count(*) into n from accounts; r := r || 'anon.contas=' || n || '(0) ';
  select count(*) into n from messages; r := r || 'anon.mensagens=' || n || '(0) ';
  begin perform public.bootstrap_account('x'); r := r || 'anon.bootstrap=PERMITIDO(negado) ';
  exception when insufficient_privilege then r := r || 'anon.bootstrap=negado ok '; end;
  execute 'reset role';

  raise exception 'RESULTADO_RLS: %', r;
end $$;
