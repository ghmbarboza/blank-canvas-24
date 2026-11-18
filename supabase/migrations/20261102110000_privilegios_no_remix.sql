-- O remix do Lovable copia tabelas, funções e policies, mas NÃO os REVOKE/GRANT. Provado em
-- 02/11/2026 no remix descartável 31dd981d: secret_get, agent_secret, cron_config, _platform_put,
-- email_link_secret e claim_jobs executáveis por anon (qualquer visitante leria as chaves do
-- cliente no Vault). garantir_privilegios() traz no CORPO o retrato dos privilégios do original
-- (lido do catálogo em 02/11) e reaplica o que estiver diferente. É regra de lista branca: função
-- fora das listas fica fechada para anon e authenticated (só service_role).
-- Quem chama: o servidor do app, uma vez por isolate, antes do primeiro pedido
-- (src/backend/platform/privilegios.server.ts), e claim_first_account (primeiro cadastro).
-- Ao criar função nova que o NAVEGADOR chama, acrescente-a na lista certa abaixo.
create or replace function public.garantir_privilegios()
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_catalog as $$
declare
  _anon text[] := array[
    '_platform_origin_ok(_origin text)',
    'add_business_minutes(_account uuid, _from timestamp with time zone, _minutes integer)',
    'agents_overview(_account uuid, _days integer)',
    'automation_stats(_account uuid)',
    'best_contact_hour(_contact uuid)',
    'call_center_stats(_account uuid)',
    'can_contact(_contact uuid, _channel text)',
    'can_see_meeting(_meeting uuid)',
    'can_see_ticket(_ticket uuid)',
    'cc_at_risk(_due timestamp with time zone, _risk_seconds integer)',
    'cc_capacity_class(_channel text)',
    'cc_fits(_qa queue_agents, _load numeric, _class text)',
    'claim_first_account(_full_name text)',
    'commission_rule_for(_account uuid, _user uuid, _product uuid, _category text, _pipeline uuid)',
    'contact_timeline(_contact uuid, _limit integer, _before timestamp with time zone)',
    'contact_timeline_base(_contact uuid)',
    'conversation_search(_account uuid, _q text, _limit integer, _source text, _days integer, _user uuid)',
    'create_proposal(_deal uuid, _title text, _valid_days integer, _conditions text, _notes text)',
    'dev_schema_types(_token text)',
    'excerpt_around(_text text, _q text, _width integer)',
    'goals_progress(_account uuid, _period date)',
    'has_column(_table text, _column text)',
    'invite_preview(_token text)',
    'lead_source(_c contacts)',
    'my_day(_account uuid)',
    'normalize_address(_channel text, _address text)',
    'on_deal_items_change()',
    'on_deal_manual_value()',
    'proposal_items_from_deal(_deal uuid)',
    'proposal_totals(_items jsonb)',
    'quality_overview(_account uuid, _days integer)',
    'quality_spend(_account uuid)',
    'quality_weak_evidence(_account uuid, _criterion text, _days integer, _limit integer)',
    'refresh_proposal(_proposal uuid)',
    'report_activity_table(_table text, _account uuid, _from date, _to date)',
    'report_ai(_account uuid, _months integer)',
    'report_attribution(_account uuid, _from date, _to date)',
    'report_forecast(_account uuid, _months integer)',
    'report_guard(_account uuid)',
    'report_sales(_account uuid, _from date, _to date, _pipeline uuid)',
    'report_service(_account uuid, _from date, _to date)',
    'roleplay_ranking(_account uuid, _days integer)',
    'run_report(_account uuid, _config jsonb)',
    'sac_metrics(_account uuid, _days integer)',
    'signup_mode()',
    'sla_for(_account uuid, _priority text)',
    'sla_target_minutes(_targets jsonb, _priority text, _key text)',
    'slugify(_s text)',
    'term_mentions(_account uuid, _days integer)',
    'tg_account_slug()',
    'tg_agent_presence_log()',
    'tg_agent_tools_bump()',
    'tg_agent_tools_same_account()',
    'tg_ai_agents_guard()',
    'tg_campaign_requires_test()',
    'tg_company_same_account()',
    'tg_contact_events()',
    'tg_contact_notify()',
    'tg_deal_commissions()',
    'tg_deal_contacts_same_account()',
    'tg_deal_events()',
    'tg_kb_reset_embedding()',
    'tg_message_events()',
    'tg_notifications_channels_after()',
    'tg_notifications_channels_before()',
    'tg_ticket_after()',
    'tg_ticket_before_insert()',
    'tg_ticket_before_update()',
    'tg_ticket_event_first_response()',
    'tg_ticket_links_check()',
    'tg_work_from_call()',
    'tg_work_from_conversation()',
    'tg_work_from_ticket()',
    'timeline_part_automations(_contact uuid)',
    'timeline_part_calls(_contact uuid)',
    'timeline_part_comercial(_contact uuid)',
    'timeline_part_email(_contact uuid)',
    'timeline_part_forms(_contact uuid)',
    'timeline_part_meetings(_contact uuid)',
    'timeline_part_support(_contact uuid)',
    'touch_updated_at()'
  ];
  _auth text[] := array[
    'accept_invite(_token text, _full_name text)',
    'accept_work_item(_item uuid)',
    'agents_import_legacy(_account uuid)',
    'apply_segment_template(_account uuid, _key text, _model jsonb)',
    'audit(_account uuid, _action text, _entity text, _entity_id uuid, _meta jsonb)',
    'bootstrap_account(_name text, _full_name text)',
    'build_opportunity(_contact uuid)',
    'can_see_channel(_channel uuid)',
    'can_see_conversation(_conversation uuid)',
    'cc_availability(_account uuid, _skill text)',
    'cc_indicators(_account uuid, _from timestamp with time zone, _to timestamp with time zone)',
    'cc_live(_account uuid)',
    'cc_self_test(_account uuid)',
    'claim_next_work_item(_account uuid, _accept boolean)',
    'company_timeline(_company uuid, _limit integer, _before timestamp with time zone, _kinds text[])',
    'confirm_wrap_up(_item uuid, _reason text, _result text, _next_action text, _next_due timestamp with time zone)',
    'create_api_key(_account uuid, _name text, _scopes text[])',
    'create_ticket(_account uuid, _subject text, _description text, _contact uuid, _conversation uuid, _priority text, _source text, _category text, _owner uuid)',
    'customer_health_signals(_account uuid)',
    'dashboard_gerencial(_account uuid, _days integer)',
    'dashboard_stats(_account uuid, _days integer)',
    'deal_room(_deal uuid)',
    'decline_work_item(_item uuid)',
    'enqueue_job(_account uuid, _kind text, _payload jsonb, _run_at timestamp with time zone, _dedupe text)',
    'enqueue_work_item(_account uuid, _kind text, _channel text, _subject text, _contact uuid, _summary text, _skill text, _priority integer, _due timestamp with time zone, _scheduled timestamp with time zone, _preferred uuid, _phone text, _metadata jsonb)',
    'finish_work_item(_item uuid)',
    'garantir_plataforma(_origin text, _force boolean)',
    'gestao_trends(_account uuid, _from date, _to date, _group text)',
    'has_role(_account uuid, _roles app_role[])',
    'import_dnc_numbers(_account uuid, _numbers text[], _source text)',
    'is_manager(_account uuid)',
    'is_member(_account uuid)',
    'kb_search(_account uuid, _query text, _embedding vector, _limit integer, _public_only boolean)',
    'mark_conversation_read(_conversation uuid)',
    'next_counter_member(_account uuid, _key text)',
    'notify_user(_account uuid, _user uuid, _kind text, _title text, _body text, _link text)',
    'outbound_number_health(_account uuid, _hours integer)',
    'register_push_subscription(_endpoint text, _p256dh text, _auth text, _user_agent text)',
    'report_mrr(_account uuid, _months integer)',
    'report_ops(_account uuid, _from date, _to date)',
    'request_callback(_account uuid, _phone text, _contact uuid, _when timestamp with time zone, _note text, _skill text, _preferred uuid)',
    'secret_keys(_account uuid, _scope text, _scope_id uuid)',
    'secret_set(_account uuid, _scope text, _scope_id uuid, _key text, _value text)',
    'set_presence(_account uuid, _status text, _reason text)',
    'storage_account(_name text)',
    'workforce_history(_account uuid, _weeks integer)',
    'workforce_presence(_account uuid, _from timestamp with time zone, _to timestamp with time zone)'
  ];
  -- tabelas fechadas no original (as demais seguem o padrão do Supabase + RLS)
  _tab_auth_only text[] := array['products','product_relations','contact_interests','deal_items'];
  _tab_closed text[] := array['service_heartbeats','platform_alerts'];
  r record;
  _want_anon boolean;
  _want_auth boolean;
  _fixed int := 0;
  _t text;
begin
  for r in
    select p.oid, p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as sig,
           p.oid::regprocedure::text as target
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    _want_anon := r.sig = any(_anon);
    _want_auth := _want_anon or r.sig = any(_auth);
    if has_function_privilege('anon', r.oid, 'execute') is distinct from _want_anon
       or has_function_privilege('authenticated', r.oid, 'execute') is distinct from _want_auth then
      execute format('revoke execute on function %s from public, anon, authenticated', r.target);
      if _want_anon then execute format('grant execute on function %s to anon', r.target); end if;
      if _want_auth then execute format('grant execute on function %s to authenticated', r.target); end if;
      execute format('grant execute on function %s to service_role', r.target);
      _fixed := _fixed + 1;
    end if;
  end loop;

  foreach _t in array _tab_auth_only || _tab_closed loop
    if to_regclass('public.' || _t) is null then continue; end if;
    if has_table_privilege('anon', 'public.' || _t, 'select,insert,update,delete')
       or (_t = any(_tab_closed)
           and has_table_privilege('authenticated', 'public.' || _t, 'select,insert,update,delete')) then
      execute format('revoke all on table public.%I from anon', _t);
      if _t = any(_tab_closed) then
        execute format('revoke all on table public.%I from authenticated', _t);
      end if;
      _fixed := _fixed + 1;
    end if;
  end loop;

  return jsonb_build_object('fixed', _fixed);
end $$;

revoke all on function public.garantir_privilegios() from public, anon, authenticated;
grant execute on function public.garantir_privilegios() to service_role;

-- Primeiro cadastro de um remix: fecha os privilégios antes de criar a central.
create or replace function public.claim_first_account(_full_name text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  _uid uuid := auth.uid();
  _account uuid;
begin
  if _uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  perform public.garantir_privilegios();
  select account_id into _account from memberships where user_id = _uid and is_active limit 1;
  if _account is not null then return _account; end if;
  perform pg_advisory_xact_lock(hashtext('nexus:first-user-owner'));
  if exists (select 1 from accounts) then return null; end if;
  perform set_config('nexus.create_account_ok', '1', true);
  return public.create_account_for(_uid, 'Minha empresa', _full_name);
end $$;
grant execute on function public.claim_first_account(text) to authenticated;
