-- Dedicated disposable database only. Run with psql -v ON_ERROR_STOP=1.
begin;
insert into public.conversations(id,user_id) values('sql-test','user:a');
do $$
begin
    assert public.begin_generation('11111111-1111-4111-8111-111111111111','sql-test','user:a');
    assert not public.begin_generation('22222222-2222-4222-8222-222222222222','sql-test','user:a');
    assert not public.append_conversation_message('sql-test','user:b','{}'::jsonb,null);
    assert public.append_conversation_message('sql-test','user:a','{"text":"hello"}'::jsonb,'11111111-1111-4111-8111-111111111111');
    assert not public.cancel_generation('11111111-1111-4111-8111-111111111111','user:b');
    assert public.cancel_generation('11111111-1111-4111-8111-111111111111','user:a');
    assert not public.append_conversation_message('sql-test','user:a','{"text":"cancelled"}'::jsonb,'11111111-1111-4111-8111-111111111111');
    assert public.consume_usage('sql-test',1);
    assert not public.consume_usage('sql-test',1);
    assert public.cancel_generation('33333333-3333-4333-8333-333333333333','user:a');
    assert not public.begin_generation('33333333-3333-4333-8333-333333333333','sql-test','user:a');
    assert (select message_count = 1 from public.list_conversation_summaries('user:a'));
    assert not has_table_privilege('anon','public.conversations','select');
    assert not has_table_privilege('authenticated','public.conversations','select');
    assert not has_function_privilege('anon','public.consume_usage(text,integer)','execute');
    assert not has_function_privilege('authenticated','public.cancel_generation(uuid,text)','execute');
end $$;
rollback;
