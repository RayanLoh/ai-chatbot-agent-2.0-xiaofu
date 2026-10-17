begin;
-- Entitlements are provisioned only by a trusted operator/payment webhook.
-- Never accept a browser-supplied plan, paid flag, or expiry.
create table public.subscriptions (
  user_id text primary key check(user_id like 'user:%'),
  plan text not null default 'pro' check(plan='pro'),
  status text not null check(status in ('active','inactive')),
  valid_until timestamptz not null,
  updated_at timestamptz not null default now()
);
alter table public.subscriptions enable row level security;
revoke all on public.subscriptions from public,anon,authenticated;
grant select,insert,update,delete on public.subscriptions to service_role;

create function public.get_billing_status(p_owner text,p_free integer,p_pro integer,p_period text)
returns jsonb language plpgsql set search_path='' as $$
declare paid boolean; k text; cap integer; spent bigint; guest boolean;
begin
  if p_period not in ('daily','lifetime') or p_free<1 or p_pro<1 then
    raise exception 'Invalid plan configuration';
  end if;
  guest=p_owner like 'guest:%';
  paid=not guest and exists(select 1 from public.subscriptions where user_id=p_owner
    and status='active' and valid_until>now());
  if guest then
    cap=8;
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
    'valid_until',(select valid_until from public.subscriptions where user_id=p_owner and paid));
end $$;

create function public.admit_plan_generation(p_id uuid,p_owner text,p_model text,p_cost bigint,
 p_free integer,p_pro integer,p_period text,p_free_models text[],p_free_daily bigint,
 p_pro_daily bigint,p_monthly bigint,p_request_cap integer)
returns jsonb language plpgsql set search_path='' as $$
declare info jsonb; k text; daily bigint; paid boolean;
begin
  -- Serialize quota admission and the monetary reservation across instances.
  perform pg_catalog.pg_advisory_xact_lock(4829651);
  perform 1 from public.generation_requests where request_id=p_id and user_id=p_owner
    and active and expires_at>now() and usage is null for update;
  if not found then return jsonb_build_object('code','GENERATION_UNAVAILABLE'); end if;
  info=public.get_billing_status(p_owner,p_free,p_pro,p_period);
  paid=info->>'plan'='pro';
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

revoke all on function public.get_billing_status(text,integer,integer,text),
 public.admit_plan_generation(uuid,text,text,bigint,integer,integer,text,text[],bigint,bigint,bigint,integer)
 from public,anon,authenticated;
grant execute on function public.get_billing_status(text,integer,integer,text),
 public.admit_plan_generation(uuid,text,text,bigint,integer,integer,text,text[],bigint,bigint,bigint,integer)
 to service_role;
commit;
