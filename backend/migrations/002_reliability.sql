begin;
alter table public.generation_requests add column if not exists payload_hash text;
alter table public.generation_requests add column if not exists result jsonb;
alter table public.generation_requests add column if not exists failure text;
alter table public.generation_requests add column if not exists usage jsonb;

create table public.spend_counters (
  key text primary key, reserved bigint not null check(reserved >= 0)
);
create table public.assets (
  id uuid primary key, user_id text not null, object_key text not null unique,
  conversation_id text, state text not null default 'pending'
    check(state in ('pending','ready','deleting')),
  created_at timestamptz not null default now(), bytes bigint not null default 0 check(bytes>=0),
  cleanup_after timestamptz not null default now(), cleanup_attempts integer not null default 0
);
create index assets_cleanup on public.assets(state,created_at);
alter table public.spend_counters enable row level security;
alter table public.assets enable row level security;
revoke all on public.spend_counters, public.assets from public, anon, authenticated;
grant select, insert, update, delete on public.spend_counters, public.assets to service_role;

create function public.claim_asset_cleanup(p_limit integer)
returns setof public.assets language sql set search_path='' as $$
  with claimed as (
    select id from public.assets where state='deleting' and cleanup_after<=now()
      order by cleanup_attempts,created_at limit least(greatest(p_limit,1),100)
      for update skip locked
  )
  update public.assets a set cleanup_after=now()+interval '5 minutes',cleanup_attempts=cleanup_attempts+1
    from claimed where a.id=claimed.id returning a.*;
$$;

create function public.reserve_asset_upload(p_id uuid,p_owner text,p_key text,p_bytes bigint,
 p_user_limit bigint,p_global_limit bigint,p_stored_limit bigint)
returns boolean language plpgsql set search_path='' as $$
declare u text; g text;
begin
  perform pg_catalog.pg_advisory_xact_lock(4829652);
  u='image:'||p_owner||':'||to_char(now() at time zone 'UTC','YYYY-MM-DD');
  g='image-global:'||to_char(now() at time zone 'UTC','YYYY-MM-DD');
  if p_bytes<=0 or p_bytes>10485760
    or coalesce((select reserved from public.spend_counters where key=u),0)+p_bytes>p_user_limit
    or coalesce((select reserved from public.spend_counters where key=g),0)+p_bytes>p_global_limit
    or (select coalesce(sum(bytes),0) from public.assets)+p_bytes>p_stored_limit then
    return false;
  end if;
  insert into public.assets(id,user_id,object_key,bytes) values(p_id,p_owner,p_key,p_bytes);
  insert into public.spend_counters(key,reserved) values(u,p_bytes),(g,p_bytes)
    on conflict(key) do update set reserved=public.spend_counters.reserved+excluded.reserved;
  return true;
end $$;

create function public.start_generation(p_id uuid, p_owner text, p_conv text, p_hash text)
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
    insert into public.conversations(id,user_id) values(c,p_owner);
  elsif not exists(select 1 from public.conversations where id=c and user_id=p_owner) then
    return jsonb_build_object('status','missing');
  end if;
  update public.generation_requests set active=false,failure='expired'
    where conversation_id=c and active and expires_at<=now();
  if exists(select 1 from public.generation_requests where conversation_id=c and active) then
    return jsonb_build_object('status','busy');
  end if;
  insert into public.generation_requests(request_id,user_id,conversation_id,active,payload_hash)
    values(p_id,p_owner,c,true,p_hash);
  return jsonb_build_object('status','started','conversation_id',c);
end $$;

create function public.reserve_generation_budget(p_id uuid,p_owner text,p_cost bigint,
  p_daily bigint,p_monthly bigint,p_requests integer)
returns boolean language plpgsql set search_path='' as $$
declare d text; m text; n text; used bigint;
begin
  -- A single global lock makes admission atomic across both account and global caps.
  perform pg_catalog.pg_advisory_xact_lock(4829651);
  perform 1 from public.generation_requests where request_id=p_id and user_id=p_owner
    and active and expires_at>now() and usage is null for update;
  if not found or p_cost<=0 then return false; end if;
  d='day:'||p_owner||':'||to_char(now() at time zone 'UTC','YYYY-MM-DD');
  m='month:'||to_char(now() at time zone 'UTC','YYYY-MM');
  n='requests:'||d;
  if coalesce((select reserved from public.spend_counters where key=d),0)+p_cost>p_daily
    or coalesce((select reserved from public.spend_counters where key=m),0)+p_cost>p_monthly
    or coalesce((select reserved from public.spend_counters where key=n),0)>=p_requests then
    return false;
  end if;
  insert into public.spend_counters(key,reserved) values(d,p_cost),(m,p_cost),(n,1)
    on conflict(key) do update set reserved=public.spend_counters.reserved+excluded.reserved;
  update public.generation_requests set usage=jsonb_build_object('reserved_micro_usd',p_cost)
    where request_id=p_id;
  return true;
end $$;

create function public.complete_generation(p_id uuid,p_owner text,p_user jsonb,p_bot jsonb,p_result jsonb)
returns boolean language plpgsql set search_path='' as $$
declare c text; a text; asset public.assets;
begin
  select conversation_id into c from public.generation_requests where request_id=p_id
    and user_id=p_owner and active and expires_at>now() and usage is not null for update;
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

create function public.delete_owned_conversation(p_conv text,p_owner text)
returns boolean language plpgsql set search_path='' as $$
begin
  -- Match completion lock order: generation -> conversation -> attachments.
  perform 1 from public.generation_requests where conversation_id=p_conv and user_id=p_owner for update;
  perform 1 from public.conversations where id=p_conv and user_id=p_owner for update;
  if not found then return false; end if;
  update public.generation_requests set active=false,result=null,failure='deleted'
    where conversation_id=p_conv and user_id=p_owner;
  update public.assets set state='deleting' where conversation_id=p_conv and user_id=p_owner;
  delete from public.conversations where id=p_conv and user_id=p_owner;
  return true;
end $$;

revoke all on function public.start_generation(uuid,text,text,text),
 public.claim_asset_cleanup(integer),
 public.reserve_asset_upload(uuid,text,text,bigint,bigint,bigint,bigint),
 public.reserve_generation_budget(uuid,text,bigint,bigint,bigint,integer),
 public.complete_generation(uuid,text,jsonb,jsonb,jsonb),public.delete_owned_conversation(text,text)
 from public,anon,authenticated;
grant execute on function public.start_generation(uuid,text,text,text),
 public.claim_asset_cleanup(integer),
 public.reserve_asset_upload(uuid,text,text,bigint,bigint,bigint,bigint),
 public.reserve_generation_budget(uuid,text,bigint,bigint,bigint,integer),
 public.complete_generation(uuid,text,jsonb,jsonb,jsonb),public.delete_owned_conversation(text,text)
 to service_role;
commit;
