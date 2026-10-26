-- Combine only the existing conversation-read rate checks and owned read.
-- Authentication and global request limits remain in the API dependency.
begin;
create function public.read_owned_history(p_owner text,p_network text,p_bucket bigint,p_conv text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare data jsonb;
begin
  if p_owner is null or (p_owner not like 'user:%' and p_owner not like 'guest:%')
    or p_network is null or p_network='' or p_bucket is null or p_bucket<0 then
    raise exception 'Invalid read context';
  end if;
  if not public.consume_usage('rate:conversations:'||p_owner||':'||p_bucket,60) then
    return jsonb_build_object('code','RATE_LIMITED');
  end if;
  if not public.consume_usage('rate:conversations:'||p_network||':'||p_bucket,300) then
    return jsonb_build_object('code','RATE_LIMITED');
  end if;
  if p_conv is null then
    select coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) into data
      from public.list_conversation_summaries(p_owner) s;
    return jsonb_build_object('code','OK','conversations',data);
  end if;
  select c.messages into data from public.conversations c where c.id=p_conv and c.user_id=p_owner;
  if not found then return jsonb_build_object('code','NOT_FOUND'); end if;
  return jsonb_build_object('code','OK','messages',coalesce(data,'[]'::jsonb));
end $$;
revoke all on function public.read_owned_history(text,text,bigint,text) from public,anon,authenticated;
grant execute on function public.read_owned_history(text,text,bigint,text) to service_role;
notify pgrst,'reload schema';
commit;
