begin;
do $$
declare rid uuid='cccccccc-1111-4111-8111-111111111111'; j jsonb; r jsonb; c text; network_key text;
begin
 j=public.start_generation(rid,'guest:atomic',null,'h'); c=j->>'conversation_id';
 assert not exists(select 1 from public.conversations where id=c);
 -- Refused budget/model selection cannot consume either guest counter.
 r=public.admit_plan_generation(rid,'guest:atomic','pro',1,20,100,'lifetime',array['free'],100,100,100,100,'net');
 assert r->>'code'='SUBSCRIPTION_REQUIRED';
 r=public.admit_plan_generation(rid,'guest:atomic','free',101,20,100,'lifetime',array['free'],100,100,100,100,'net');
 assert r->>'code'='BUDGET_LIMIT_REACHED';
 assert not exists(select 1 from public.usage_counters where key='guest-total:guest:atomic');
 r=public.admit_plan_generation(rid,'guest:atomic','free',1,20,100,'lifetime',array['free'],100,100,100,100,'net');
 assert r->>'code'='OK';
 assert (select used=1 from public.usage_counters where key='guest-total:guest:atomic');
 network_key='guest-network:net:'||floor(extract(epoch from now())/86400)::bigint;
 assert (select used=1 from public.usage_counters where key=network_key);
 r=public.admit_plan_generation(rid,'guest:atomic','free',1,20,100,'lifetime',array['free'],100,100,100,100,'net');
 assert r->>'code'='GENERATION_UNAVAILABLE';
 assert (select used=1 from public.usage_counters where key=network_key);
 assert public.complete_generation(rid,'guest:atomic','{"images":[]}','{"images":[]}','{}');
 assert (select jsonb_array_length(messages)=2 from public.conversations where id=c);
 -- A used-up token cannot drain a new network/day counter.
 update public.usage_counters set used=8 where key='guest-total:guest:atomic';
 rid='cccccccc-2222-4222-8222-222222222222';
 j=public.start_generation(rid,'guest:atomic',null,'h'); c=j->>'conversation_id';
 r=public.admit_plan_generation(rid,'guest:atomic','free',1,20,100,'lifetime',array['free'],100,100,100,100,'fresh-net');
 assert r->>'code'='GUEST_LIMIT_REACHED';
 assert not exists(select 1 from public.usage_counters where key like 'guest-network:fresh-net:%');
 perform public.cancel_generation(rid,'guest:atomic');
 assert not exists(select 1 from public.conversations where id=c);
 -- Preserve user-created empty conversations when a generation fails.
 insert into public.conversations(id,user_id) values('explicit-empty','user:owner');
 rid='cccccccc-3333-4333-8333-333333333333';
 j=public.start_generation(rid,'user:owner','explicit-empty','h');
 perform public.cancel_generation(rid,'user:owner');
 assert exists(select 1 from public.conversations where id='explicit-empty');
end $$;
rollback;
