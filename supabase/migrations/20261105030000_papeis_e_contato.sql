-- R3/R4/R5/R7/R11 · papéis e contato. Só R11 precisa de banco:
-- o formulário público casa o contato pelo e-mail/celular digitado. Em contato que JÁ existia,
-- o aceite marcado por quem preencheu não vale até o dono confirmar pelo e-mail do cadastro
-- (dupla confirmação forçada, mesmo com email_double_opt_in desligado), os demais canais não
-- são gravados, e o evento form.submitted (que dispara automação) espera a confirmação.
-- Revisão do R11 (05/11):
--   - O link de confirmação só vai para o e-mail que JÁ estava na ficha e é o mesmo digitado.
--     Ficha casada pelo celular (sem e-mail, ou com outro e-mail): sem link, sem aceite.
--   - O formulário não preenche o e-mail de ficha casada pelo celular (nem o celular de ficha
--     casada pelo e-mail): quem digitou não provou ser o dono da ficha. A captura base preenche
--     (coalesce); o envoltório desfaz logo depois, na mesma transação.
--   - form.submitted só espera a confirmação quando o link saiu de fato. Sem link (só celular,
--     ou limite de 1 por hora) o evento sai na hora, com confirmed = false (aceite não concedido).
--   - notify_user aceita só link interno (caminho que começa com uma barra, nunca //).
-- Redefine a partir da versão mais recente (20261102164904). A trava de chamador continua no
-- corpo das funções, porque o remix do Lovable não copia REVOKE/GRANT.

create or replace function public.capture_form_submission(
  _form uuid, _contact jsonb, _custom jsonb, _touch jsonb, _contact_source text,
  _submission jsonb, _consent jsonb, _visitor text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  f public.forms%rowtype; s public.form_submissions%rowtype;
  c public.contacts%rowtype; dest jsonb; captured jsonb; accepted jsonb; pending jsonb;
  doi boolean; owner_id uuid; eligible uuid[]; stage record; deal_id uuid; cfg jsonb;
  company text; link text; escaped_link text; captured_contact_id uuid; sub_id uuid;
  existing boolean := false; deferred boolean := false;
  _acc uuid; _pre_id uuid; _pre_by_email boolean := false; _pre_email text; _pre_phone text;
  _sent boolean := false;
  _email text := nullif(lower(trim(coalesce(_contact->>'email',''))),'');
  _phone text := nullif(regexp_replace(coalesce(_contact->>'phone',''),'\D','','g'),'');
begin
  -- Trava no corpo: o remix pode não preservar grants.
  if coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb <> '{}'::jsonb
     and coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  -- R11: ficha que já existe, com o MESMO casamento da captura base (e-mail, depois celular),
  -- lida ANTES da captura (que preenche e-mail/celular vazios com o que foi digitado).
  select account_id into _acc from public.forms where id = _form;
  if _email is not null then
    select x.id, x.email, x.phone into _pre_id, _pre_email, _pre_phone from public.contacts x
     where x.account_id = _acc and lower(x.email) = _email order by x.created_at limit 1;
    _pre_by_email := _pre_id is not null;
  end if;
  if _pre_id is null and _phone is not null then
    select x.id, x.email, x.phone into _pre_id, _pre_email, _pre_phone from public.contacts x
     where x.account_id = _acc
       and x.phone in (_phone, '+' || _phone,
             case when _phone like '55%' and length(_phone) >= 12 then substr(_phone, 3) end)
     order by x.created_at limit 1;
  end if;
  existing := _pre_id is not null;
  -- Publicação gradual: o servidor anterior continua com seu processamento antigo.
  -- Só o servidor novo pede os efeitos atômicos, evitando efeitos em dobro durante o deploy.
  if _submission->>'atomic_version' is distinct from '2' then
    captured := public.capture_form_submission_base(_form,_contact,_custom,_touch,
      _contact_source,_submission,_consent,_visitor);
    if existing then
      update public.contacts set
        email = case when not _pre_by_email then _pre_email else email end,
        phone = case when _pre_by_email then _pre_phone else phone end
       where id = _pre_id;
    end if;
    update public.form_submissions set processed_at=coalesce(processed_at,now())
      where id=(captured->>'submission_id')::uuid;
    return captured;
  end if;
  select * into f from public.forms where id = _form for update;
  if not found or f.status <> 'active' then raise exception 'form_inactive'; end if;
  dest := f.destination;
  select settings, name into cfg, company from public.accounts where id = f.account_id;
  -- R11: contato que já existia (lido acima, antes da captura). Quem preencheu o formulário não
  -- provou ser o dono da ficha; o aceite dele não vale até o dono confirmar pelo e-mail que JÁ
  -- estava na ficha. Ficha casada pelo celular (sem e-mail ou com outro e-mail): não há para onde
  -- mandar o link com segurança, então não há confirmação nem aceite.
  doi := (coalesce((cfg #>> '{privacy,email_double_opt_in}')::boolean,false) or existing)
         and nullif(trim(_contact->>'email'),'') is not null
         and (not existing or (_pre_by_email and lower(trim(_pre_email)) = _email));
  select coalesce(jsonb_agg(x), '[]'::jsonb) into accepted
    from jsonb_array_elements(coalesce(_consent,'[]'::jsonb)) x
    where not existing and (not doi or x->>'channel' <> 'email');
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
  -- R11: desfaz o preenchimento da captura base (e-mail em ficha casada pelo celular, celular em
  -- ficha casada pelo e-mail). Só toca no que estava vazio antes; o resto a base não muda.
  if existing and captured_contact_id = _pre_id then
    update public.contacts set
      email = case when not _pre_by_email then _pre_email else email end,
      phone = case when _pre_by_email then _pre_phone else phone end
     where id = _pre_id;
  end if;
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

  if pending is not null and coalesce(c.email,'') <> '' then
    _sent := public.hit_rate_limit('forms:confirm:' || lower(c.email),1,3600);
    -- o evento só espera a confirmação quando o link de fato sai
    deferred := existing and _sent;
    pending := pending || jsonb_build_object('email',lower(trim(c.email)), 'submission_id',s.id,
      'deferred_event',deferred,'deal_id',deal_id);
    update public.form_submissions set pending_email_consent=pending where id=s.id;
    if _sent then
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
  -- Aceite não verificado em contato existente com link enviado: o evento sai quando o dono
  -- confirmar (confirm_form_email). Sem link, sai agora, marcado como aceite não concedido.
  if not deferred then
    perform public.emit_event(f.account_id,'form.submitted','contact',c.id,jsonb_build_object(
      'contact_id',c.id,'form_id',f.id,'submission_id',s.id,'source',s.source,
      'deal_id',deal_id,'created',captured->'created',
      'confirmed',case when existing then false end));
  end if;
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
  -- R11: o form.submitted adiado (aceite em contato que já existia) sai agora, já confirmado.
  if coalesce((s.pending_email_consent->>'deferred_event')::boolean,false) then
    perform public.emit_event(s.account_id,'form.submitted','contact',s.contact_id,jsonb_build_object(
      'contact_id',s.contact_id,'form_id',s.form_id,'submission_id',s.id,'source',s.source,
      'deal_id',nullif(s.pending_email_consent->>'deal_id','')::uuid,'created',false,
      'confirmed',true));
  end if;
  update public.form_submissions set confirmed_at=now(),pending_email_consent=s.pending_email_consent,
    confirm_token_hash=encode(sha256(convert_to(_token,'UTF8')),'hex'),confirm_token=null where id=s.id;
  return true;
end $$;
revoke all on function public.confirm_form_email(text,jsonb) from public,anon,authenticated;
grant execute on function public.confirm_form_email(text,jsonb) to service_role;

-- notify_user: igual a 20261022090000_fundacao_plataforma.sql, mais a regra do link (R8, 05/11).
-- O sino abre o link da notificação; qualquer membro chama esta função pelo navegador, então um
-- link livre virava phishing dentro do app (https://site-falso, //site-falso, /\site-falso,
-- javascript:). Só caminho interno passa; o resto vira notificação sem link (não quebra os
-- gatilhos que chamam esta função).
create or replace function public.notify_user(_account uuid, _user uuid, _kind text, _title text, _body text default null, _link text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.role() <> 'service_role' and not public.is_member(_account) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if _link is not null and (_link !~ '^/' or _link ~ '^/[/\\]' or _link ~ '[[:cntrl:]]') then
    _link := null;
  end if;
  if not exists (select 1 from public.memberships where account_id = _account and user_id = _user and is_active) then return; end if;
  insert into public.notifications (account_id, user_id, kind, title, body, link)
  values (_account, _user, left(_kind, 40), left(_title, 200), left(_body, 1000), left(_link, 500));
end $$;
revoke all on function public.notify_user(uuid, uuid, text, text, text, text) from public, anon;
grant execute on function public.notify_user(uuid, uuid, text, text, text, text) to authenticated, service_role;
