-- Apply after 001-004. Does not enable payments or clear usage counters.
begin;
create table public.tester_accounts (
  email text primary key check(email=lower(trim(email))),
  user_id text unique check(user_id like 'user:%'),
  valid_until timestamptz not null
);
create table public.guest_history_claims (
  guest_id text primary key check(guest_id like 'guest:%'),
  user_id text not null check(user_id like 'user:%'),
  claimed_at timestamptz not null default now()
);
alter table public.tester_accounts enable row level security;
alter table public.guest_history_claims enable row level security;
revoke all on public.tester_accounts,public.guest_history_claims from public,anon,authenticated;
grant select,insert,update,delete on public.tester_accounts,public.guest_history_claims to service_role;

-- Only called with server-verified Google email + subject. The first subject
-- is bound permanently until an operator explicitly changes the allowlist row.
create function public.bind_tester_account(p_user text,p_email text)
returns void language plpgsql set search_path='' as $$
begin
  if p_user not like 'user:%' or p_email is null then return; end if;
  update public.tester_accounts set user_id=p_user where email=lower(trim(p_email))
    and valid_until>now() and (user_id is null or user_id=p_user);
end $$;

create or replace function public.get_billing_status(p_owner text,p_free integer,p_pro integer,p_period text)
returns jsonb language plpgsql set search_path='' as $$
declare paid boolean; k text; cap integer; spent bigint; guest boolean; tester boolean;
begin
  if p_period not in ('daily','lifetime') or p_free<1 or p_pro<1 then
    raise exception 'Invalid plan configuration';
  end if;
  guest=p_owner like 'guest:%';
  tester=not guest and exists(select 1 from public.tester_accounts where user_id=p_owner and valid_until>now());
  paid=not guest and exists(select 1 from public.subscriptions where user_id=p_owner
    and status='active' and valid_until>now());
  paid=paid or tester;
  if guest then
    cap=5;
    spent=coalesce((select used from public.usage_counters where key='guest-total:'||p_owner),0);
  else
    cap=case when paid then p_pro else p_free end;
    k=case when paid then 'plan-pro:' else 'plan-free:' end||p_owner||':'||
      case when paid or p_period='daily' then to_char(now() at time zone 'UTC','YYYY-MM-DD') else 'lifetime' end;
    spent=coalesce((select reserved from public.spend_counters where key=k),0);
  end if;
  return jsonb_build_object('plan',case when guest then 'guest' when paid then 'pro' else 'free' end,
    'limit',cap,'used',spent,'remaining',greatest(0,cap-spent),
    'period',case when guest then 'lifetime' when paid then 'daily' else p_period end,
    'resets_at',case when not guest and (paid or p_period='daily') then
      ((date_trunc('day',now() at time zone 'UTC')+interval '1 day') at time zone 'UTC') else null end,
    'is_tester',tester,
    'valid_until',case when tester then (select valid_until from public.tester_accounts where user_id=p_owner)
      else (select valid_until from public.subscriptions where user_id=p_owner and paid) end);
end $$;


create or replace function public.admit_plan_generation(p_id uuid,p_owner text,p_model text,p_cost bigint,
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
    if coalesce((select used from public.usage_counters where key=g),0)>=5
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


-- Prevent writes that raced with a successful transfer from re-creating guest data.
create function public.reject_claimed_guest_writes()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.user_id like 'guest:%' then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.user_id,2));
    if exists(select 1 from public.guest_history_claims where guest_id=new.user_id) then
      raise exception 'Guest history was transferred';
    end if;
  end if;
  return new;
end $$;
create trigger guard_claimed_conversation before insert or update on public.conversations
  for each row execute function public.reject_claimed_guest_writes();
create trigger guard_claimed_job before insert or update on public.generation_requests
  for each row execute function public.reject_claimed_guest_writes();
create trigger guard_claimed_asset before insert or update on public.assets
  for each row execute function public.reject_claimed_guest_writes();

create function public.claim_guest_history(p_guest text,p_user text)
returns jsonb language plpgsql set search_path='' as $$
declare existing_owner text; count_moved integer; info jsonb;
begin
  if p_guest not like 'guest:%' or p_user not like 'user:%' then
    return jsonb_build_object('status','invalid');
  end if;
  -- Same ordering as admission; then serialize guest inserts/updates.
  perform pg_catalog.pg_advisory_xact_lock(4829651);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_guest,2));
  info=public.get_billing_status(p_user,20,100,'lifetime');
  if info->>'plan'<>'pro' then return jsonb_build_object('status','subscription_required'); end if;
  select user_id into existing_owner from public.guest_history_claims where guest_id=p_guest;
  if found then
    return jsonb_build_object('status',case when existing_owner=p_user then 'claimed' else 'conflict' end,'moved',0);
  end if;
  if exists(select 1 from public.generation_requests where user_id in(p_guest,p_user)
      and active and expires_at>now()) then return jsonb_build_object('status','busy'); end if;
  update public.generation_requests set active=false where user_id=p_guest and active;
  update public.conversations set user_id=p_user where user_id=p_guest;
  get diagnostics count_moved = row_count;
  update public.assets set user_id=p_user where user_id=p_guest;
  update public.generation_requests set user_id=p_user where user_id=p_guest;
  insert into public.guest_history_claims(guest_id,user_id) values(p_guest,p_user);
  return jsonb_build_object('status','claimed','moved',count_moved);
end $$;
revoke all on function public.bind_tester_account(text,text),public.claim_guest_history(text,text),
 public.reject_claimed_guest_writes() from public,anon,authenticated;
grant execute on function public.bind_tester_account(text,text),public.claim_guest_history(text,text),
 public.reject_claimed_guest_writes() to service_role;
notify pgrst,'reload schema';
commit;
