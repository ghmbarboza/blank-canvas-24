-- Captação atômica (E2E 30/10, achados A1, A2 e A3).
--
-- A2: o envio do formulário criava o contato e só depois gravava consentimento, origem e o envio.
--     Se a conexão caía no meio, ficava um lead sem prova de consentimento (LGPD) e sem origem.
--     capture_form_submission faz contato + envio + consentimento + vínculo da visita numa só
--     transação. Idempotente: o mesmo visitante reenviando o mesmo conteúdo em 10 min devolve o
--     envio que já existe (o caso do "cliquei de novo porque não respondeu").
-- A1: envio rápido demais deixa de ser descartado em silêncio; vai gravado com suspect = true.
-- A3: telefone brasileiro digitado com DDD era gravado sem o 55 ("11900000001", que a tela mostrava
--     como +11 …). O app agora grava com o 55; aqui corrigimos o que já está na base.

alter table public.form_submissions add column if not exists visitor_id text;
alter table public.form_submissions add column if not exists suspect boolean not null default false;
create index if not exists form_submissions_visitor
  on public.form_submissions (form_id, visitor_id, created_at desc);

create or replace function public.capture_form_submission(
  _form uuid,
  _contact jsonb,          -- {name, email, phone, company, job_title, city} (só o que veio)
  _custom jsonb,           -- campos personalizados mapeados
  _touch jsonb,            -- origem (utm/referrer/canal) para first_touch/last_touch
  _contact_source text,    -- contacts.source quando o contato é novo
  _submission jsonb,       -- {source, payload, utm, referrer, page_url, ip_hash, user_agent,
                           --  confirm_token, external_id, suspect}
  _consent jsonb,          -- [{channel, proof}] já filtrado pelo que o visitante aceitou
  _visitor text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  _f public.forms%rowtype;
  _c_id uuid;
  _c_owner uuid;
  _contact_id uuid;
  _created boolean := false;
  _sub_id uuid;
  _dup record;
  _email text := nullif(lower(trim(coalesce(_contact->>'email', ''))), '');
  _phone text := nullif(regexp_replace(coalesce(_contact->>'phone', ''), '\D', '', 'g'), '');
  _row jsonb;
begin
  -- Só o servidor do app (service_role) chama. A trava fica no corpo porque o remix do Lovable
  -- não copia REVOKE/GRANT. Conexão direta ao banco (sem claims) é a do dono/migração.
  if current_setting('request.jwt.claims', true) is not null
     and current_setting('request.jwt.claims', true) <> ''
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select * into _f from public.forms where id = _form for update;
  if not found or _f.status <> 'active' then
    raise exception 'form_inactive' using errcode = 'P0002';
  end if;

  if _visitor is not null then
    perform pg_advisory_xact_lock(hashtext('nexus:form-submit:' || _form::text || ':' || _visitor));
    select id, contact_id into _dup from public.form_submissions
     where form_id = _form and visitor_id = _visitor
       and created_at > now() - interval '10 minutes'
       and payload = coalesce(_submission->'payload', '{}'::jsonb)
     order by created_at desc limit 1;
    if found then
      return jsonb_build_object('submission_id', _dup.id, 'contact_id', _dup.contact_id,
                                'created', false, 'duplicated', true, 'owner',
                                (select owner_user_id from public.contacts where id = _dup.contact_id));
    end if;
  end if;

  -- Contato: casa por e-mail e depois por telefone (com ou sem o 55); nunca apaga dado existente.
  if _email is not null then
    select id, owner_user_id into _c_id, _c_owner from public.contacts
     where account_id = _f.account_id and lower(email) = _email
     order by created_at limit 1;
  end if;
  if _c_id is null and _phone is not null then
    select id, owner_user_id into _c_id, _c_owner from public.contacts
     where account_id = _f.account_id
       and phone in (_phone, '+' || _phone,
                     case when _phone like '55%' and length(_phone) >= 12 then substr(_phone, 3) end)
     order by created_at limit 1;
  end if;

  if _c_id is not null then
    _contact_id := _c_id;
    update public.contacts set
      name      = coalesce(nullif(name, ''), nullif(_contact->>'name', '')),
      email     = coalesce(nullif(email, ''), _email),
      phone     = coalesce(nullif(phone, ''), _phone),
      company   = coalesce(nullif(company, ''), nullif(_contact->>'company', '')),
      job_title = coalesce(nullif(job_title, ''), nullif(_contact->>'job_title', '')),
      city      = coalesce(nullif(city, ''), nullif(_contact->>'city', '')),
      custom    = coalesce(_custom, '{}'::jsonb) || coalesce(custom, '{}'::jsonb),
      first_touch = coalesce(first_touch, _touch),
      last_touch  = _touch
     where id = _contact_id;
  else
    insert into public.contacts (account_id, name, email, phone, company, job_title, city,
                                 source, lifecycle, custom, first_touch, last_touch)
    values (_f.account_id,
            coalesce(nullif(_contact->>'name', ''), _email, _phone, 'Lead'),
            _email, _phone,
            nullif(_contact->>'company', ''), nullif(_contact->>'job_title', ''),
            nullif(_contact->>'city', ''),
            coalesce(_contact_source, 'form'), 'lead',
            coalesce(_custom, '{}'::jsonb), _touch, _touch)
    returning id, owner_user_id into _c_id, _c_owner;
    _contact_id := _c_id;
    _created := true;
  end if;

  insert into public.form_submissions (account_id, form_id, contact_id, source, payload, utm,
                                       referrer, page_url, ip_hash, user_agent, confirm_token,
                                       external_id, visitor_id, suspect)
  values (_f.account_id, _form, _contact_id,
          coalesce(_submission->>'source', 'form'),
          coalesce(_submission->'payload', '{}'::jsonb),
          coalesce(_submission->'utm', '{}'::jsonb),
          left(_submission->>'referrer', 500), left(_submission->>'page_url', 500),
          _submission->>'ip_hash', left(_submission->>'user_agent', 300),
          _submission->>'confirm_token', _submission->>'external_id', _visitor,
          coalesce((_submission->>'suspect')::boolean, false))
  returning id into _sub_id;

  update public.forms set submissions_count = submissions_count + 1 where id = _form;

  for _row in select * from jsonb_array_elements(coalesce(_consent, '[]'::jsonb)) loop
    insert into public.consents (account_id, contact_id, channel, status, basis, source, proof)
    values (_f.account_id, _contact_id, _row->>'channel', 'granted', 'consent',
            coalesce(_submission->>'source', 'form'),
            coalesce(_row->'proof', '{}'::jsonb) || jsonb_build_object('submission_id', _sub_id));
  end loop;

  if _visitor is not null then
    update public.page_visits set contact_id = _contact_id
     where account_id = _f.account_id and visitor_id = _visitor and contact_id is null;
  end if;

  return jsonb_build_object('submission_id', _sub_id, 'contact_id', _contact_id,
                            'created', _created, 'duplicated', false, 'owner', _c_owner);
end $$;

revoke all on function public.capture_form_submission(uuid, jsonb, jsonb, jsonb, text, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.capture_form_submission(uuid, jsonb, jsonb, jsonb, text, jsonb, jsonb, text) to service_role;

-- A3: números brasileiros sem o 55 ganham o 55: DDD 11–99 + celular (9 + 8 dígitos) ou fixo
-- (2–5 + 7 dígitos). Número americano guardado sem + ("1202…") não casa: o 3º dígito é 0/1.
update public.contacts
   set phone = '55' || regexp_replace(phone, '\D', '', 'g')
 where phone is not null
   and regexp_replace(phone, '\D', '', 'g') ~ '^[1-9][1-9](9[0-9]{8}|[2-5][0-9]{7})$'
   and phone !~ '^\+';
