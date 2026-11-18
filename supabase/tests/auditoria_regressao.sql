-- Regressões contra as funções de produção em schema descartável.
do $$
declare a uuid; f uuid; p uuid; st uuid; r jsonb; sub uuid; token text := repeat('a',36);
  n int; before_n int; owner1 uuid := '20000000-0000-0000-0000-000000000001';
  owner2 uuid := '20000000-0000-0000-0000-000000000002';
begin
  assert (select not multi_account from platform_settings), 'cadastro aberto';
  insert into accounts(name,settings) values('Teste', '{"privacy":{"email_double_opt_in":true}}') returning id into a;
  insert into memberships values(a,owner1,true),(a,owner2,true);
  insert into pipelines(account_id) values(a) returning id into p;
  insert into pipeline_stages(account_id,pipeline_id) values(a,p) returning id into st;
  insert into forms(account_id,name,destination) values(a,'Teste',jsonb_build_object(
    'owner_mode','round_robin','users',jsonb_build_array(owner1,owner2),'create_deal',true,
    'pipeline_id',p,'tags',jsonb_build_array('teste'))) returning id into f;
  r := capture_form_submission(f,'{"email":"teste@example.invalid","name":"Teste"}',
    '{}','{}','form',jsonb_build_object('atomic_version',2,'payload','{"a":1}'::jsonb,'confirm_token',token),
    '[{"channel":"email","proof":{"text":"Aceito"}},{"channel":"whatsapp","proof":{}}]','visitor-1');
  sub := (r->>'submission_id')::uuid;
  assert (select confirm_token is null and confirm_token_hash is not null from form_submissions where id=sub), 'token exposto na leitura do envio';
  assert (select count(*)=0 from consents where channel='email'), 'email concedido antes de confirmar';
  assert (select count(*)=1 from consents where channel='whatsapp'), 'perdeu outro canal';
  assert (select count(*)=1 from jobs where kind='email.send'), 'email não enfileirado';
  assert (select count(*)=1 from deals), 'negócio ausente';
  assert (select count(*)=1 from domain_events), 'evento ausente';
  assert (select count(*)=1 from notifications), 'notificação ausente';
  perform capture_form_submission(f,'{"email":"teste@example.invalid"}','{}','{}','form',
    '{"atomic_version":2,"payload":{"a":1}}','[]','visitor-1');
  assert (select count(*)=1 from domain_events), 'retry duplicou evento';
  assert (select submissions_count=1 from forms where id=f), 'retry duplicou envio';

  -- Força falha real de persistência: a confirmação deve reverter o consumo do link.
  alter table consents add constraint inject_confirmation_failure check(source<>'double_opt_in') not valid;
  begin
    perform confirm_form_email(token,'{}');
    raise exception 'falha injetada não ocorreu';
  exception when check_violation then null;
  end;
  assert (select confirmed_at is null from form_submissions where id=sub), 'link consumido na falha';
  alter table consents drop constraint inject_confirmation_failure;
  assert confirm_form_email(token,'{}'), 'retry de confirmação falhou';
  assert confirm_form_email(token,'{}'), 'confirmação não idempotente';
  assert (select count(*)=1 from consents where channel='email'), 'consentimento duplicado';
  assert not confirm_form_email(repeat('b',36),'{}'), 'token desconhecido aceito';

  -- Falha depois da captura deve reverter contato, cursor, negócio e outbox juntos.
  select count(*) into before_n from contacts;
  alter table notifications add constraint inject_notification_failure check(false) not valid;
  begin
    perform capture_form_submission(f,'{"email":"rollback@example.invalid"}','{}','{}','form',
      jsonb_build_object('atomic_version',2,'confirm_token',repeat('c',36)),'[]','rollback');
    raise exception 'falha injetada não ocorreu';
  exception when check_violation then null;
  end;
  alter table notifications drop constraint inject_notification_failure;
  assert (select count(*)=before_n from contacts), 'captura parcial após falha';
  assert (select rr_cursor=1 from forms where id=f), 'cursor avançou apesar do rollback';

  perform set_config('request.jwt.claims','{"role":"authenticated"}',true);
  begin
    perform confirm_form_email(token,'{}'); raise exception 'confirmação aberta ao usuário';
  exception when insufficient_privilege then null; end;
  begin
    perform capture_form_submission(f,'{}','{}','{}','form','{}','[]');
    raise exception 'captura aberta ao usuário';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);

  -- Um link enfileirado pelo servidor anterior continua válido após a publicação.
  r := capture_form_submission(f,'{"email":"legacy@example.invalid"}','{}','{}','form',
    jsonb_build_object('confirm_token',repeat('d',36)),'[]','legacy');
  sub := (r->>'submission_id')::uuid;
  perform enqueue_job(a,'email.send',jsonb_build_object('to_contact_id',r->>'contact_id',
    'text','Confirme seu e-mail: https://nexus.test.invalid/api/public/forms/confirm?token=' || repeat('d',36)));
  assert confirm_form_email(repeat('d',36),'{}'), 'link antigo deixou de funcionar';
  assert (select confirm_token is null and confirmed_at is not null from form_submissions where id=sub), 'token antigo não retirado após confirmação';

  -- Mesmo sem primeiro heartbeat o cron é esperado; worker só é esperado com reunião ativa.
  perform check_service_heartbeats();
  assert (select count(*)=1 from platform_alerts where service='app-cron' and resolved_at is null), 'cron ausente invisível';
  assert not exists(select 1 from platform_alerts where service='livecoach-worker'), 'alarme falso de worker dormindo';
  insert into meetings values('live',null,now()-interval '5 minutes');
  perform check_service_heartbeats();
  assert exists(select 1 from platform_alerts where service='livecoach-worker' and resolved_at is null), 'worker nunca iniciado invisível';

  -- Fixture de concorrência: DOI desligado para não disparar qualquer e-mail.
  update accounts set settings='{}' where id=a;
  insert into forms(id,account_id,name,destination) values(
    '10000000-0000-0000-0000-000000000001',a,'Concorrência',
    jsonb_build_object('owner_mode','round_robin','users',jsonb_build_array(owner1,owner2)));
end $$;
