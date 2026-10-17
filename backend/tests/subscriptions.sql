begin;
do $$
declare j jsonb; c text; id uuid='a1111111-1111-4111-8111-111111111111'; r jsonb;
begin
  assert (public.get_billing_status('user:trial',1,2,'daily')->>'plan')='free';
  assert (public.get_billing_status('user:trial',1,2,'daily')->>'remaining')::int=1;
  j=public.start_generation(id,'user:trial',null,'h'); c=j->>'conversation_id';
  r=public.admit_plan_generation(id,'user:trial','premium',1,1,2,'daily',array['free'],100,100,100,100);
  assert r->>'code'='SUBSCRIPTION_REQUIRED';
  assert (public.get_billing_status('user:trial',1,2,'daily')->>'used')::int=0;
  -- Platform budget failures must not consume the trial or trigger an upsell.
  r=public.admit_plan_generation(id,'user:trial','free',101,1,2,'daily',array['free'],100,100,100,100);
  assert r->>'code'='BUDGET_LIMIT_REACHED';
  assert (public.get_billing_status('user:trial',1,2,'daily')->>'used')::int=0;
  r=public.admit_plan_generation(id,'user:trial','free',1,1,2,'daily',array['free'],100,100,100,100);
  assert r->>'code'='OK';
  assert public.complete_generation(id,'user:trial','{"images":[]}','{"images":[]}','{}');
  assert (public.get_billing_status('user:trial',1,2,'daily')->>'remaining')::int=0;
  -- Same generation cannot reserve twice.
  r=public.admit_plan_generation(id,'user:trial','free',1,1,2,'daily',array['free'],100,100,100,100);
  assert r->>'code'='GENERATION_UNAVAILABLE';
  assert (public.get_billing_status('user:trial',1,2,'daily')->>'used')::int=1;
  id='a2222222-2222-4222-8222-222222222222';
  j=public.start_generation(id,'user:trial',c,'h');
  r=public.admit_plan_generation(id,'user:trial','free',1,1,2,'daily',array['free'],100,100,100,100);
  assert r->>'code'='SUBSCRIPTION_REQUIRED';
  -- Expired/inactive entitlements cannot bypass the trial.
  insert into public.subscriptions(user_id,status,valid_until)
    values('user:trial','active',now()-interval '1 second');
  assert (public.get_billing_status('user:trial',1,2,'daily')->>'plan')='free';
  update public.subscriptions set valid_until=now()+interval '1 day',status='inactive' where user_id='user:trial';
  assert (public.get_billing_status('user:trial',1,2,'daily')->>'plan')='free';
  update public.subscriptions set status='active' where user_id='user:trial';
  assert (public.get_billing_status('user:trial',1,2,'daily')->>'plan')='pro';
  r=public.admit_plan_generation(id,'user:trial','premium',1,1,2,'daily',array['free'],100,100,100,100);
  assert r->>'code'='OK';
  perform public.cancel_generation(id,'user:trial');
  assert (public.get_billing_status('user:trial',1,2,'daily')->>'used')::int=1;
  id='a3333333-3333-4333-8333-333333333333';
  j=public.start_generation(id,'user:trial',c,'h');
  r=public.admit_plan_generation(id,'user:trial','premium',1,1,2,'daily',array['free'],100,100,100,100);
  assert r->>'code'='OK';
  perform public.cancel_generation(id,'user:trial');
  id='a4444444-4444-4444-8444-444444444444';
  j=public.start_generation(id,'user:trial',c,'h');
  r=public.admit_plan_generation(id,'user:trial','premium',1,1,2,'daily',array['free'],100,100,100,100);
  assert r->>'code'='PLAN_LIMIT_REACHED';
  -- A new account has independent free quota; lifetime counters have no date.
  assert (public.get_billing_status('user:other',1,2,'lifetime')->>'remaining')::int=1;
  assert public.get_billing_status('user:other',1,2,'lifetime')->'resets_at'='null'::jsonb;
  assert (public.get_billing_status('guest:x',1,2,'daily')->>'plan')='guest';
  id='a5555555-5555-4555-8555-555555555555';
  j=public.start_generation(id,'user:lifetime',null,'h'); c=j->>'conversation_id';
  r=public.admit_plan_generation(id,'user:lifetime','free',1,1,2,'lifetime',array['free'],100,100,100,100);
  assert r->>'code'='OK';
  assert public.delete_owned_conversation(c,'user:lifetime');
  assert (public.get_billing_status('user:lifetime',1,2,'lifetime')->>'remaining')::int=0;
  assert public.get_billing_status('user:lifetime',1,2,'lifetime')->'resets_at'='null'::jsonb;
end $$;
set local role authenticated;
do $$ begin
  begin insert into public.subscriptions(user_id,status,valid_until) values('user:fake','active',now()+interval '1 year');
    raise exception 'Client activated subscription';
  exception when insufficient_privilege then null; end;
end $$;
rollback;
