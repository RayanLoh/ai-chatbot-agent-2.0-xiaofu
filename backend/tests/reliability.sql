-- Run after 001 + 002 in an isolated database.
begin;
do $$
declare id uuid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; j jsonb; ok boolean; c text;
begin
  j=public.start_generation(id,'owner',null,'hash'); c=j->>'conversation_id';
  assert j->>'status'='started';
  assert (public.start_generation(id,'owner',null,'hash')->>'status')='running';
  assert (public.start_generation(id,'attacker',null,'hash')->>'status')='conflict';
  assert (public.start_generation(id,'owner',null,'changed')->>'status')='conflict';
  assert (public.start_generation('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','owner',c,'hash')->>'status')='busy';
  assert not public.reserve_generation_budget(id,'attacker',5,10,20,2);
  assert not public.reserve_generation_budget(id,'owner',11,10,20,2);
  assert (select count(*)=0 from public.spend_counters);
  assert public.reserve_generation_budget(id,'owner',5,10,20,2);
  assert not public.reserve_generation_budget(id,'owner',5,10,20,2);
  assert public.complete_generation(id,'owner','{"text":"hi","images":[]}',
    '{"text":"hello","images":[]}', '{"text":"hello","images":[]}');
  assert (select jsonb_array_length(messages)=2 from public.conversations where conversations.id=c);
  assert not public.complete_generation(id,'owner','{}','{}','{}');
  assert (public.start_generation(id,'owner',null,'hash')->>'status')='succeeded';
  assert (select count(*)=1 from public.conversations where conversations.id=c);

  id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  j=public.start_generation(id,'owner',c,'hash');
  assert j->>'status'='started';
  assert not public.reserve_generation_budget(id,'owner',6,10,20,2);
  assert public.reserve_generation_budget(id,'owner',5,10,20,2);
  perform public.cancel_generation(id,'owner');
  assert not public.complete_generation(id,'owner','{}','{}','{}');
  assert (public.start_generation(id,'owner',c,'hash')->>'status')='failed';
  assert (select jsonb_array_length(messages)=2 from public.conversations where conversations.id=c);

  id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  j=public.start_generation(id,'owner',c,'hash');
  assert not public.reserve_generation_budget(id,'owner',1,100,100,2); -- daily request cap
  assert not public.reserve_generation_budget(id,'owner',1,100,10,100); -- global cap
  update public.generation_requests set expires_at=now()-interval '1 second' where request_id=id;
  assert not public.complete_generation(id,'owner','{}','{}','{}');
  assert (public.start_generation(id,'owner',c,'hash')->>'status')='failed';

  -- Stop arriving before generate is a durable tombstone.
  id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  perform public.cancel_generation(id,'owner');
  assert (public.start_generation(id,'owner',null,'hash')->>'status')='conflict';

  insert into public.assets(id,user_id,object_key,conversation_id,state)
    values('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','owner','private/test',c,'ready');
  assert not public.delete_owned_conversation(c,'attacker');
  assert public.delete_owned_conversation(c,'owner');
  assert (select state='deleting' from public.assets where object_key='private/test');
  assert (select result is null from public.generation_requests where request_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  assert not exists(select 1 from public.conversations where conversations.id=c);

  id='ffffffff-ffff-4fff-8fff-ffffffffffff';
  j=public.start_generation(id,'owner',null,'hash'); c=j->>'conversation_id';
  insert into public.assets(id,user_id,object_key,state)
    values('11111111-1111-4111-8111-111111111111','attacker','private/foreign','ready');
  assert public.reserve_generation_budget(id,'owner',5,100,100,100);
  begin
    ok=public.complete_generation(id,'owner',
      '{"images":["/assets/11111111-1111-4111-8111-111111111111"]}', '{"images":[]}', '{}');
    raise exception 'Foreign attachment accepted';
  exception when raise_exception then
    if sqlerrm <> 'Invalid attachment' then raise; end if;
  end;
  assert (select jsonb_array_length(messages)=0 from public.conversations where conversations.id=c);
  update public.assets set user_id='owner' where object_key='private/foreign';
  assert public.complete_generation(id,'owner',
      '{"images":["/assets/11111111-1111-4111-8111-111111111111"]}', '{"images":[]}', '{}');
  assert (select conversation_id=c from public.assets where object_key='private/foreign');

  assert not public.reserve_asset_upload('22222222-2222-4222-8222-222222222222','owner','private/quota',11,10,100,1000);
  assert not exists(select 1 from public.assets where object_key='private/quota');
  assert public.reserve_asset_upload('22222222-2222-4222-8222-222222222222','owner','private/quota',5,10,100,1000);
  assert not public.reserve_asset_upload('33333333-3333-4333-8333-333333333333','owner','private/quota2',6,10,100,1000);
  assert not public.reserve_asset_upload('33333333-3333-4333-8333-333333333333','other','private/quota2',6,100,10,1000);
  assert not public.reserve_asset_upload('33333333-3333-4333-8333-333333333333','other','private/quota2',6,100,100,10);
end $$;
set local role anon;
do $$ begin
  begin perform 1 from public.assets; raise exception 'assets readable';
  exception when insufficient_privilege then null; end;
  begin perform public.start_generation(gen_random_uuid(),'x',null,'x'); raise exception 'RPC executable';
  exception when insufficient_privilege then null; end;
end $$;
rollback;

