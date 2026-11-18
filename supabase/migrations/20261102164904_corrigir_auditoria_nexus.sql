-- SUBIDO: convite depois do primeiro dono; preserva contas, membros e dados existentes.
update public.platform_settings set multi_account = false;

alter table public.form_submissions add column if not exists processed_at timestamptz;
alter table public.form_submissions add column if not exists pending_email_consent jsonb;
alter table public.form_submissions add column if not exists confirm_token_hash text;
create unique index if not exists form_submissions_confirm_hash
  on public.form_submissions(confirm_token_hash) where confirm_token_hash is not null;
-- Envios históricos não são redisparados por esta migração.
update public.form_submissions set processed_at = created_at where processed_at is null;

-- Mantém a captura já validada como núcleo; a nova função envolve todos os efeitos em uma transação.
alter function public.capture_form_submission(uuid,jsonb,jsonb,jsonb,text,jsonb,jsonb,text)
  rename to capture_form_submission_base;
revoke all on function public.capture_form_submission_base(uuid,jsonb,jsonb,jsonb,text,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.capture_form_submission_base(uuid,jsonb,jsonb,jsonb,text,jsonb,jsonb,text) to service_role;

create or replace function public.capture_form_submission(
  _form uuid, _contact jsonb, _custom jsonb, _touch jsonb, _contact_source text,
  _submission jsonb, _consent jsonb, _visitor text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  f public.forms%rowtype; s public.form_submissions%rowtype;
  c public.contacts%rowtype; dest jsonb; captured jsonb; accepted jsonb; pending jsonb;
  doi boolean; owner_id uuid; eligible uuid[]; stage record; deal_id uuid; cfg jsonb;
  company text; link text; escaped_link text; captured_contact_id uuid; sub_id uuid;
begin
  -- Trava no corpo: o remix pode não preservar grants.
  if coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb <> '{}'::jsonb
     and coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  -- Publicação gradual: o servidor anterior continua com seu processamento antigo.
  -- Só o servidor novo pede os efeitos atômicos, evitando efeitos em dobro durante o deploy.
  if _submission->>'atomic_version' is distinct from '2' then
    captured := public.capture_form_submission_base(_form,_contact,_custom,_touch,
      _contact_source,_submission,_consent,_visitor);
    update public.form_submissions set processed_at=coalesce(processed_at,now())
      where id=(captured->>'submission_id')::uuid;
    return captured;
  end if;
  select * into f from public.forms where id = _form for update;
  if not found or f.status <> 'active' then raise exception 'form_inactive'; end if;
  dest := f.destination;
  select settings, name into cfg, company from public.accounts where id = f.account_id;
  doi := coalesce((cfg #>> '{privacy,email_double_opt_in}')::boolean,false)
         and nullif(trim(_contact->>'email'),'') is not null;
  select coalesce(jsonb_agg(x), '[]'::jsonb) into accepted
    from jsonb_array_elements(coalesce(_consent,'[]'::jsonb)) x
    where not doi or x->>'channel' <> 'email';
  if doi then
    select x->'proof' into pending from jsonb_array_elements(coalesce(_consent,'[]'::jsonb)) x
      where x->>'channel' = 'email' limit 1;
  end if;

  -- O lock do formulário serializa também os retries por external_id.
  if nullif(_submission->>'external_id','') is not null then
    select * into s from public.form_submissions where account_id = f.account_id
      and source = coalesce(_submission->>'source','form')
      and external_id = _submission->>'external_id' limit 1;
    if found then captured := jsonb_build_object('submission_id',s.id,'contact_id',s.contact_id,
      'created',false,'duplicated',true); end if;
  end if;
  if captured is null then
    captured := public.capture_form_submission_base(_form,_contact,_custom,_touch,
      _contact_source,_submission,accepted,_visitor);
  end if;
  sub_id := (captured->>'submission_id')::uuid;
  captured_contact_id := (captured->>'contact_id')::uuid;
  select * into s from public.form_submissions where id = sub_id for update;
  select * into c from public.contacts where id = captured_contact_id and account_id = f.account_id for update;
  if not found then raise exception 'contact_missing'; end if;
  if s.processed_at is not null then
    return captured || jsonb_build_object('owner', c.owner_user_id);
  end if;
  owner_id := c.owner_user_id;
  if owner_id is null and dest->>'owner_mode' in ('user','round_robin') then
    select array_agg(u::uuid order by ord) into eligible
      from jsonb_array_elements_text(coalesce(dest->'users','[]'::jsonb)) with ordinality a(u,ord)
      where exists(select 1 from public.memberships m where m.account_id=f.account_id
                   and m.user_id=u::uuid and m.is_active);
    if cardinality(eligible) > 0 then
      if dest->>'owner_mode' = 'round_robin' then
        owner_id := eligible[mod(f.rr_cursor,cardinality(eligible))+1];
        update public.forms set rr_cursor = mod(rr_cursor+1,cardinality(eligible)) where id=f.id;
      else owner_id := eligible[1]; end if;
    end if;
  end if;
  update public.contacts set owner_user_id=owner_id,
    tags=array(select distinct t from unnest(coalesce(c.tags,'{}'::text[]) ||
      array(select jsonb_array_elements_text(coalesce(dest->'tags','[]'::jsonb)))) t)
    where id=c.id;

  if coalesce((dest->>'create_deal')::boolean,false) then
    select id into deal_id from public.deals where account_id=f.account_id
      and contact_id=c.id and status='open' order by created_at limit 1;
    if deal_id is null then
      if nullif(dest->>'stage_id','') is not null then
        select id,pipeline_id into stage from public.pipeline_stages
          where id=(dest->>'stage_id')::uuid and account_id=f.account_id;
      else
        select ps.id,ps.pipeline_id into stage from public.pipeline_stages ps
          join public.pipelines p on p.id=ps.pipeline_id
          where ps.account_id=f.account_id and p.account_id=f.account_id
            and (nullif(dest->>'pipeline_id','') is null or p.id=(dest->>'pipeline_id')::uuid)
          order by p.is_default desc,p.created_at,ps.position limit 1;
      end if;
      if stage.id is null then raise exception 'pipeline_unavailable'; end if;
      insert into public.deals(account_id,contact_id,owner_user_id,pipeline_id,stage_id,title,source)
        values(f.account_id,c.id,owner_id,stage.pipeline_id,stage.id,
          left(coalesce(nullif(_contact->>'name',''),'Lead') || ' · ' || f.name,160),'form')
        returning id into deal_id;
    end if;
  end if;

  if pending is not null then
    pending := pending || jsonb_build_object('email',lower(trim(c.email)), 'submission_id',s.id);
    update public.form_submissions set pending_email_consent=pending where id=s.id;
    if public.hit_rate_limit('forms:confirm:' || lower(c.email),1,3600) then
      link := coalesce(nullif(_submission->>'confirmation_base_url',''),public.cron_config()->>'base_url');
      if link is null or link !~ '^https://' then raise exception 'confirmation_base_url_missing'; end if;
      link := rtrim(link,'/') || '/api/public/forms/confirm?token=' || s.confirm_token;
      escaped_link := replace(replace(replace(link,'&','&amp;'),'"','&quot;'),'<','&lt;');
      perform public.enqueue_job(f.account_id,'email.send',jsonb_build_object(
        'to_email',c.email,'to_contact_id',c.id,'category','transactional',
        'subject','Confirme seu e-mail',
        'html','<p>Confirme que deseja receber nossas mensagens.</p><p><a href="' || escaped_link || '">Confirmar meu e-mail</a></p><p>Se não foi você, ignore esta mensagem.</p>',
        'text','Confirme seu e-mail: ' || link),now(),'form-confirm:' || s.id);
    end if;
  end if;
  perform public.emit_event(f.account_id,'form.submitted','contact',c.id,jsonb_build_object(
    'contact_id',c.id,'form_id',f.id,'submission_id',s.id,'source',s.source,
    'deal_id',deal_id,'created',captured->'created'));
  if owner_id is not null then
    perform public.notify_user(f.account_id,owner_id,'lead_new',
      'Novo lead: ' || coalesce(c.name,c.email,'sem nome'),'Pelo formulário ' || f.name,'/contatos/' || c.id);
  else
    perform public.enqueue_job(f.account_id,'lead.route',jsonb_build_object('contact_id',c.id,
      'deal_id',deal_id),now(),'form-route:' || s.id);
  end if;
  update public.form_submissions set processed_at=now(),
    confirm_token_hash=case when confirm_token is not null
      then encode(sha256(convert_to(confirm_token,'UTF8')),'hex') else confirm_token_hash end,
    confirm_token=null where id=s.id;
  return captured || jsonb_build_object('owner',owner_id,'deal_id',deal_id);
end $$;
revoke all on function public.capture_form_submission(uuid,jsonb,jsonb,jsonb,text,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.capture_form_submission(uuid,jsonb,jsonb,jsonb,text,jsonb,jsonb,text) to service_role;

-- Compatibilidade: links antigos só ganham prova pendente quando há um job de confirmação
-- efetivamente enfileirado. Token sozinho não prova que o visitante marcou o aceite.
update public.form_submissions s set pending_email_consent=jsonb_build_object(
  'email',lower(trim(c.email)), 'submission_id',s.id,'source','legacy_confirmation_job')
from public.contacts c
where c.id=s.contact_id and c.account_id=s.account_id and s.confirmed_at is null
  and s.confirm_token is not null and s.pending_email_consent is null
  and exists(select 1 from public.jobs j where j.account_id=s.account_id and j.kind='email.send'
    and j.payload->>'to_contact_id'=c.id::text
    and j.payload->>'text' like '%/api/public/forms/confirm?token=' || s.confirm_token || '%');

-- Tokens novos ficam só como hash. Para links antigos, adiciona o hash sem interromper
-- o servidor anterior durante o deploy; o token legado é retirado ao confirmar.
update public.form_submissions set
  confirm_token_hash=encode(sha256(convert_to(confirm_token,'UTF8')),'hex')
where confirm_token is not null;

-- Confirmação é uma única transação; erro nunca consome o link nem anuncia sucesso.
create or replace function public.confirm_form_email(_token text, _proof jsonb default '{}'::jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
declare s public.form_submissions%rowtype; email text;
begin
  if coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb <> '{}'::jsonb
     and coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'not allowed' using errcode='42501';
  end if;
  select * into s from public.form_submissions where confirm_token_hash=encode(sha256(convert_to(_token,'UTF8')),'hex')
    or confirm_token=_token for update;
  if not found or s.contact_id is null then return false; end if;
  -- Compatibilidade com o servidor anterior durante a publicação: só aceita o link
  -- quando ele de fato foi enfileirado como confirmação para este contato.
  if s.pending_email_consent is null and exists(select 1 from public.jobs j
    where j.account_id=s.account_id and j.kind='email.send'
      and j.payload->>'to_contact_id'=s.contact_id::text
      and j.payload->>'text' like '%/api/public/forms/confirm?token=' || _token || '%') then
    select jsonb_build_object('email',lower(trim(c.email)), 'source','legacy_confirmation_job')
      into s.pending_email_consent from public.contacts c where c.id=s.contact_id and c.account_id=s.account_id;
  end if;
  if s.pending_email_consent is null then return false; end if;
  if s.confirmed_at is not null then return true; end if;
  select lower(trim(c.email)) into email from public.contacts c
    where c.id=s.contact_id and c.account_id=s.account_id for update;
  if email is distinct from s.pending_email_consent->>'email' then return false; end if;
  insert into public.consents(account_id,contact_id,channel,status,basis,source,proof)
    values(s.account_id,s.contact_id,'email','granted','consent','double_opt_in',
      s.pending_email_consent || _proof || jsonb_build_object('submission_id',s.id,'form_id',s.form_id,'at',now()));
  update public.form_submissions set confirmed_at=now(),pending_email_consent=s.pending_email_consent,
    confirm_token_hash=encode(sha256(convert_to(_token,'UTF8')),'hex'),confirm_token=null where id=s.id;
  return true;
end $$;
revoke all on function public.confirm_form_email(text,jsonb) from public,anon,authenticated;
grant execute on function public.confirm_form_email(text,jsonb) to service_role;

create or replace function public.check_service_heartbeats()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; _opened int := 0; _closed int := 0; _id uuid; _sent boolean; _stale boolean;
  _live boolean := exists (select 1 from public.meetings
                            where status = 'live' and ended_at is null and started_at < now() - interval '2 minutes');
begin
  for r in
    select expected.service, max(h.last_seen) as last_seen
      from (select service from public.service_heartbeats
            union select 'app-cron'::text
            union select 'livecoach-worker'::text where _live) expected
      left join public.service_heartbeats h using(service) group by expected.service
  loop
    _stale := r.last_seen is null or r.last_seen < now() - interval '3 minutes';
    if _stale and r.service = 'livecoach-worker' and not _live then
      _stale := false; -- dormindo por desenho
    end if;
    if _stale then
      insert into public.platform_alerts (service, message, details)
      values (r.service,
              format('%s sem sinal desde %s', r.service, coalesce(to_char(r.last_seen at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI'),'o primeiro início esperado')),
              jsonb_build_object('last_seen', r.last_seen))
      on conflict (service, kind) where resolved_at is null do nothing
      returning id into _id;
      if _id is not null then
        _opened := _opened + 1;
        _sent := public.platform_alert_email(
          format('[Nexus One] %s fora do ar', r.service),
          format(E'O serviço %s não manda sinal de vida desde %s (horário de Brasília).\nConfira /api/health e os logs do serviço.',
                 r.service, to_char(r.last_seen at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI:SS')));
        if _sent then update public.platform_alerts set notified_at = now() where id = _id; end if;
      end if;
    else
      update public.platform_alerts set resolved_at = now()
      where service = r.service and kind = 'service_down' and resolved_at is null
      returning id into _id;
      if _id is not null then
        _closed := _closed + 1;
        _sent := public.platform_alert_email(
          format('[Nexus One] %s normalizado', r.service),
          format('O serviço %s está normal às %s (horário de Brasília).',
                 r.service, to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI:SS')));
        if _sent then update public.platform_alerts set resolved_notified_at = now() where id = _id; end if;
      end if;
    end if;
    _id := null;
  end loop;
  return jsonb_build_object('opened', _opened, 'closed', _closed);
end $$;
revoke execute on function public.check_service_heartbeats() from public, anon, authenticated;
