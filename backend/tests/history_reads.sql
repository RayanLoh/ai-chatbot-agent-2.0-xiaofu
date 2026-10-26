begin;
insert into public.conversations(id,user_id,title,messages) values
  ('read-test-a','user:read-a','A','[{"sender":"user","text":"private A"}]'),
  ('read-test-b','user:read-b','B','[{"sender":"user","text":"private B"}]');
set local role service_role;
do $$
declare result jsonb; i integer;
begin
  result=public.read_owned_history('user:read-a','read-network',123,'read-test-a');
  assert result->>'code'='OK' and result#>>'{messages,0,text}'='private A';
  assert public.read_owned_history('user:read-a','read-network',123,'read-test-b')->>'code'='NOT_FOUND';
  result=public.read_owned_history('user:read-a','read-network',123,null);
  assert jsonb_array_length(result->'conversations')=1;
  assert result#>>'{conversations,0,id}'='read-test-a';
  assert not (result#>'{conversations,0}') ? 'messages';
  for i in 4..60 loop perform public.read_owned_history('user:read-a','read-network',123,null); end loop;
  assert public.read_owned_history('user:read-a','read-network',123,null)->>'code'='RATE_LIMITED';
  assert (select used from public.usage_counters where key='rate:conversations:read-network:123')=60;
  insert into public.usage_counters(key,used) values('rate:conversations:full-network:123',300);
  assert public.read_owned_history('guest:read-new','full-network',123,null)->>'code'='RATE_LIMITED';
end $$;
reset role;
do $$ begin
  assert not has_function_privilege('anon','public.read_owned_history(text,text,bigint,text)','execute');
  assert not has_function_privilege('authenticated','public.read_owned_history(text,text,bigint,text)','execute');
end $$;
rollback;
