-- Add bounded reads without rewriting or deleting existing messages.
begin;
create function public.message_page(p_messages jsonb,p_limit integer,p_before integer default null)
returns jsonb language plpgsql immutable set search_path='' as $$
declare total integer; finish integer; first integer; data jsonb;
begin
  if p_limit is null or p_limit<1 or p_limit>100 or p_before<0 then
    raise exception 'Invalid page';
  end if;
  total=jsonb_array_length(coalesce(p_messages,'[]'::jsonb));
  finish=least(coalesce(p_before,total),total);
  first=greatest(0,finish-p_limit);
  select coalesce(jsonb_agg(p_messages->i order by i),'[]'::jsonb) into data
    from generate_series(first,finish-1) i;
  return jsonb_build_object('messages',data,'has_more',first>0,
    'next_before',case when first>0 then first else null end,'total',total);
end $$;

create function public.read_owned_history_page(p_owner text,p_network text,p_bucket bigint,
  p_conv text,p_limit integer,p_before integer default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare data jsonb;
begin
  if p_owner is null or (p_owner not like 'user:%' and p_owner not like 'guest:%')
    or p_network is null or p_network='' or p_bucket is null or p_bucket<0
    or p_limit is null or p_limit<1 or p_limit>100 or p_before<0 then
    raise exception 'Invalid read context';
  end if;
  if not public.consume_usage('rate:conversations:'||p_owner||':'||p_bucket,60) then
    return jsonb_build_object('code','RATE_LIMITED');
  end if;
  if not public.consume_usage('rate:conversations:'||p_network||':'||p_bucket,300) then
    return jsonb_build_object('code','RATE_LIMITED');
  end if;
  select c.messages into data from public.conversations c where c.id=p_conv and c.user_id=p_owner;
  if not found then return jsonb_build_object('code','NOT_FOUND'); end if;
  return jsonb_build_object('code','OK')||public.message_page(data,p_limit,p_before);
end $$;

create function public.read_conversation_context(p_conv text,p_owner text,p_limit integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare data jsonb;
begin
  select c.messages into data from public.conversations c where c.id=p_conv and c.user_id=p_owner;
  if not found then return null; end if;
  return public.message_page(data,p_limit,null);
end $$;
revoke all on function public.message_page(jsonb,integer,integer),
  public.read_owned_history_page(text,text,bigint,text,integer,integer),
  public.read_conversation_context(text,text,integer) from public,anon,authenticated;
grant execute on function public.message_page(jsonb,integer,integer),
  public.read_owned_history_page(text,text,bigint,text,integer,integer),
  public.read_conversation_context(text,text,integer) to service_role;
notify pgrst,'reload schema';
commit;
