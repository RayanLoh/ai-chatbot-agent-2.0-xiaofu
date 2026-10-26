begin;
do $$
declare j uuid; result jsonb; i integer; asset_id uuid=gen_random_uuid();
begin
  assert (public.get_billing_status('guest:five',20,100,'lifetime')->>'limit')::int=5;
  for i in 1..6 loop
    j=gen_random_uuid();
    perform public.start_generation(j,'guest:five',null,'hash');
    result=public.admit_plan_generation(j,'guest:five','m',1,20,100,'lifetime',array['m'],1000000,5000000,10000000,100,'network-five');
    assert result->>'code'=case when i<=5 then 'OK' else 'GUEST_LIMIT_REACHED' end;
    perform public.cancel_generation(j,'guest:five');
  end loop;
  assert (public.get_billing_status('guest:five',20,100,'lifetime')->>'used')::int=5;
  for i in 1..21 loop
    j=gen_random_uuid();
    perform public.start_generation(j,'user:free-twenty',null,'hash');
    result=public.admit_plan_generation(j,'user:free-twenty','m',1,20,100,'lifetime',array['m'],1000000,5000000,10000000,100,null);
    assert result->>'code'=case when i<=20 then 'OK' else 'SUBSCRIPTION_REQUIRED' end;
    perform public.cancel_generation(j,'user:free-twenty');
  end loop;
  insert into public.tester_accounts(email,valid_until) values('test@example.com',now()+interval '1 day');
  assert (public.get_billing_status('user:tester',20,100,'lifetime')->>'plan')='free';
  perform public.bind_tester_account('user:tester','TEST@example.com');
  result=public.get_billing_status('user:tester',20,100,'lifetime');
  assert result->>'plan'='pro' and (result->>'is_tester')::boolean;
  assert not exists(select 1 from public.subscriptions where user_id='user:tester');
  perform public.bind_tester_account('user:imposter','test@example.com');
  assert (public.get_billing_status('user:imposter',20,100,'lifetime')->>'plan')='free';
  insert into public.conversations(id,user_id,messages) values('claim-me','guest:transfer','[{"text":"guest hello"}]');
  insert into public.assets(id,user_id,object_key,conversation_id,state,bytes)
    values(asset_id,'guest:transfer','private/guests/old-hash/image','claim-me','ready',10);
  result=public.claim_guest_history('guest:transfer','user:free-twenty');
  assert result->>'status'='subscription_required';
  assert (select user_id='guest:transfer' from public.conversations where id='claim-me');
  j=gen_random_uuid();
  perform public.start_generation(j,'guest:transfer','claim-me','hash');
  result=public.claim_guest_history('guest:transfer','user:tester');
  assert result->>'status'='busy';
  perform public.cancel_generation(j,'guest:transfer');
  result=public.claim_guest_history('guest:transfer','user:tester');
  assert result->>'status'='claimed' and (result->>'moved')::int=1;
  assert (select user_id='user:tester' and messages->0->>'text'='guest hello' from public.conversations where id='claim-me');
  assert (select user_id='user:tester' and object_key='private/guests/old-hash/image' from public.assets where id=asset_id);
  assert (select user_id='user:tester' from public.generation_requests where request_id=j);
  assert (public.claim_guest_history('guest:transfer','user:tester')->>'moved')::int=0;
  insert into public.subscriptions(user_id,status,valid_until) values('user:another-pro','active',now()+interval '1 day');
  assert public.claim_guest_history('guest:transfer','user:another-pro')->>'status'='conflict';
  begin
    insert into public.conversations(id,user_id) values('late-guest-write','guest:transfer');
    raise exception 'Claimed guest was allowed to write';
  exception when raise_exception then
    if sqlerrm<>'Guest history was transferred' then raise; end if;
  end;
  delete from public.tester_accounts where email='test@example.com';
  assert (public.get_billing_status('user:tester',20,100,'lifetime')->>'plan')='free';
end $$;
set local role anon;
do $$
begin
  begin
    perform public.claim_guest_history('guest:x','user:another-pro');
    raise exception 'anon called privileged claim';
  exception when insufficient_privilege then null; end;
  begin
    perform public.bind_tester_account('user:evil','test@example.com');
    raise exception 'anon bound test access';
  exception when insufficient_privilege then null; end;
end $$;
rollback;
