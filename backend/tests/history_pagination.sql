begin;
insert into public.conversations(id,user_id,title,messages)
select 'page-test','user:page','Paged',jsonb_agg(jsonb_build_object('id',i,'text',i::text) order by i)
from generate_series(1,120) i;
set local role service_role;
do $$
declare result jsonb;
begin
  result=public.read_owned_history_page('user:page','page-network',456,'page-test',50,null);
  assert jsonb_array_length(result->'messages')=50;
  assert result#>>'{messages,0,text}'='71' and result->>'next_before'='70';
  assert (result->>'has_more')::boolean;
  result=public.read_owned_history_page('user:page','page-network',456,'page-test',50,70);
  assert result#>>'{messages,0,text}'='21' and result#>>'{messages,49,text}'='70';
  assert result->>'next_before'='20';
  result=public.read_owned_history_page('user:page','page-network',456,'page-test',50,20);
  assert jsonb_array_length(result->'messages')=20 and not (result->>'has_more')::boolean;
  assert result->>'next_before' is null;
  assert public.read_owned_history_page('user:other','page-network',456,'page-test',50,null)->>'code'='NOT_FOUND';
  assert public.read_conversation_context('page-test','user:other',40) is null;
  result=public.read_conversation_context('page-test','user:page',40);
  assert jsonb_array_length(result->'messages')=40 and result#>>'{messages,0,text}'='81';
  update public.conversations set messages=messages||jsonb_build_array(jsonb_build_object('text','121')) where id='page-test';
  result=public.read_owned_history_page('user:page','page-network',456,'page-test',50,70);
  assert result#>>'{messages,0,text}'='21' and result#>>'{messages,49,text}'='70';
end $$;
reset role;
do $$ begin
  assert not has_function_privilege('anon','public.read_owned_history_page(text,text,bigint,text,integer,integer)','execute');
  assert not has_function_privilege('authenticated','public.read_conversation_context(text,text,integer)','execute');
end $$;
rollback;
