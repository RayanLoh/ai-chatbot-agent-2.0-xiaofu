begin;
alter table public.generation_requests add column creates_conversation boolean not null default false;

create or replace function public.start_generation(p_id uuid, p_owner text, p_conv text, p_hash text)
returns jsonb language plpgsql set search_path='' as $$
declare j public.generation_requests; c text;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_id::text, 1));
  select * into j from public.generation_requests where request_id=p_id for update;
  if found then
    if j.user_id<>p_owner or j.payload_hash is distinct from p_hash then
      return jsonb_build_object('status','conflict');
    end if;
    if j.active and j.expires_at<=now() then
      update public.generation_requests set active=false,failure='expired' where request_id=p_id;
      j.active=false; j.failure='expired';
    end if;
    return jsonb_build_object('status',case when j.result is not null then 'succeeded'
      when j.active then 'running' else 'failed' end,'result',j.result,'conversation_id',j.conversation_id);
  end if;
  c=coalesce(p_conv,p_id::text);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(c, 0));
  if p_conv is null then
    if exists(select 1 from public.conversations where id=c) then
      return jsonb_build_object('status','conflict');
    end if;
  elsif not exists(select 1 from public.conversations where id=c and user_id=p_owner) then
    return jsonb_build_object('status','missing');
  end if;
  update public.generation_requests set active=false,failure='expired'
    where conversation_id=c and active and expires_at<=now();
  if exists(select 1 from public.generation_requests where conversation_id=c and active) then
    return jsonb_build_object('status','busy');
  end if;
  insert into public.generation_requests(request_id,user_id,conversation_id,active,payload_hash,creates_conversation)
    values(p_id,p_owner,c,true,p_hash,p_conv is null);
  return jsonb_build_object('status','started','conversation_id',c);
end $$;

create or replace function public.complete_generation(p_id uuid,p_owner text,p_user jsonb,p_bot jsonb,p_result jsonb)
returns boolean language plpgsql set search_path='' as $$
declare c text; is_new boolean; a text; asset public.assets;
begin
  select conversation_id,creates_conversation into c,is_new from public.generation_requests where request_id=p_id
    and user_id=p_owner and active and expires_at>now() and usage is not null for update;
  if not found then return false; end if;
  if is_new then
    insert into public.conversations(id,user_id) values(c,p_owner);
  end if;
  perform 1 from public.conversations where id=c and user_id=p_owner for update;
  if not found then return false; end if;
  -- Serialize attachment binding against cleanup and other conversations.
  for a in select jsonb_array_elements_text(coalesce(p_user->'images','[]') || coalesce(p_bot->'images','[]')) order by 1 loop
    select * into asset from public.assets where id=substring(a from 9)::uuid for update;
    if not found or asset.user_id<>p_owner or asset.state<>'ready'
      or (asset.conversation_id is not null and asset.conversation_id<>c) then
      raise exception 'Invalid attachment';
    end if;
    update public.assets set conversation_id=c where id=asset.id;
  end loop;
  update public.conversations set messages=messages||jsonb_build_array(p_user,p_bot),updated_at=now()
    where id=c and user_id=p_owner;
  if not found then return false; end if;
  update public.generation_requests set active=false,result=p_result,
    usage=coalesce(usage,'{}')||coalesce(p_result->'usage','{}') where request_id=p_id;
  return true;
end $$;

create function public.admit_plan_generation(p_id uuid,p_owner text,p_model text,p_cost bigint,
 p_free integer,p_pro integer,p_period text,p_free_models text[],p_free_daily bigint,
 p_pro_daily bigint,p_monthly bigint,p_request_cap integer,p_network text)
returns jsonb language plpgsql set search_path='' as $$
declare info jsonb; k text; daily bigint; paid boolean; guest boolean; g text; n text;
begin
  -- Serialize quota admission and the monetary reservation across instances.
  perform pg_catalog.pg_advisory_xact_lock(4829651);
  perform 1 from public.generation_requests where request_id=p_id and user_id=p_owner
    and active and expires_at>now() and usage is null for update;
  if not found then return jsonb_build_object('code','GENERATION_UNAVAILABLE'); end if;
  info=public.get_billing_status(p_owner,p_free,p_pro,p_period);
  paid=info->>'plan'='pro';
  guest=info->>'plan'='guest';
  if guest then
    if p_network is null or p_network='' then
      return jsonb_build_object('code','GUEST_LIMIT_REACHED');
    end if;
    g='guest-total:'||p_owner;
    n='guest-network:'||p_network||':'||floor(extract(epoch from now())/86400)::bigint;
    if coalesce((select used from public.usage_counters where key=g),0)>=8
      or coalesce((select used from public.usage_counters where key=n),0)>=8 then
      return jsonb_build_object('code','GUEST_LIMIT_REACHED');
    end if;
  end if;
  if not paid and not (p_model=any(p_free_models)) then
    return jsonb_build_object('code','SUBSCRIPTION_REQUIRED','reason','model','quota',info);
  end if;
  if info->>'plan'<>'guest' and (info->>'remaining')::bigint<=0 then
    return jsonb_build_object('code',case when paid then 'PLAN_LIMIT_REACHED' else 'SUBSCRIPTION_REQUIRED' end,
      'reason','quota','quota',info);
  end if;
  daily=case when paid then p_pro_daily else p_free_daily end;
  if not public.reserve_generation_budget(p_id,p_owner,p_cost,daily,p_monthly,p_request_cap) then
    return jsonb_build_object('code','BUDGET_LIMIT_REACHED');
  end if;
  if guest then
    insert into public.usage_counters(key,used) values(g,1),(n,1)
      on conflict(key) do update set used=public.usage_counters.used+1,updated_at=now();
  end if;
  if info->>'plan'<>'guest' then
    k=case when paid then 'plan-pro:' else 'plan-free:' end||p_owner||':'||
      case when paid or p_period='daily' then to_char(now() at time zone 'UTC','YYYY-MM-DD') else 'lifetime' end;
    insert into public.spend_counters(key,reserved) values(k,1)
      on conflict(key) do update set reserved=public.spend_counters.reserved+1;
  end if;
  update public.generation_requests set usage=usage||jsonb_build_object('plan',info->>'plan','model',p_model)
    where request_id=p_id;
  return jsonb_build_object('code','OK');
end $$;

create or replace function public.admit_plan_generation(p_id uuid,p_owner text,p_model text,p_cost bigint,
 p_free integer,p_pro integer,p_period text,p_free_models text[],p_free_daily bigint,
 p_pro_daily bigint,p_monthly bigint,p_request_cap integer)
returns jsonb language sql set search_path='' as $$
 select public.admit_plan_generation(p_id,p_owner,p_model,p_cost,p_free,p_pro,p_period,p_free_models,
   p_free_daily,p_pro_daily,p_monthly,p_request_cap,null::text);
$$;
revoke all on function public.admit_plan_generation(uuid,text,text,bigint,integer,integer,text,text[],bigint,bigint,bigint,integer,text)
 from public,anon,authenticated;
grant execute on function public.admit_plan_generation(uuid,text,text,bigint,integer,integer,text,text[],bigint,bigint,bigint,integer,text)
 to service_role;
commit;
