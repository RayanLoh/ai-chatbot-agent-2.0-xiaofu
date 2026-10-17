-- Run once in Supabase SQL editor after a database backup.
-- Existing conversations/messages are preserved. Backend service_role only.
begin;
create table if not exists public.conversations (
    id text primary key,
    user_id text not null,
    title text not null default 'New Conversation',
    messages jsonb not null default '[]'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
-- Earlier versions used eight-character IDs; new IDs are full UUID strings.
alter table public.conversations alter column id type text;
alter table public.conversations alter column messages type jsonb using messages::jsonb;
create index if not exists conversations_owner_updated on public.conversations(user_id, updated_at desc);

create table if not exists public.usage_counters (
    key text primary key,
    used integer not null check (used >= 0),
    updated_at timestamptz not null default now()
);
create table if not exists public.generation_requests (
    request_id uuid primary key,
    user_id text not null,
    conversation_id text,
    active boolean not null default false,
    expires_at timestamptz not null default (now() + interval '150 seconds')
);
create unique index if not exists one_active_generation_per_conversation
    on public.generation_requests(conversation_id) where active;

alter table public.conversations enable row level security;
alter table public.usage_counters enable row level security;
alter table public.generation_requests enable row level security;
-- Revoke direct browser-role access even if a legacy permissive policy exists.
revoke all on public.conversations, public.usage_counters, public.generation_requests from public, anon, authenticated;
grant select, insert, update, delete on public.conversations, public.usage_counters, public.generation_requests to service_role;

create or replace function public.consume_usage(p_key text, p_limit integer)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare result integer;
begin
    if p_limit < 1 then return false; end if;
    insert into public.usage_counters(key, used) values (p_key, 1)
    on conflict (key) do update set used = public.usage_counters.used + 1, updated_at = now()
        where public.usage_counters.used < p_limit
    returning used into result;
    return result is not null;
end;
$$;

create or replace function public.list_conversation_summaries(p_user_id text)
returns table(id text, title text, updated_at text, message_count integer)
language sql security invoker set search_path = '' as $$
    select c.id::text, c.title::text, c.updated_at::text,
           jsonb_array_length(coalesce(c.messages, '[]'::jsonb))
    from public.conversations c where c.user_id = p_user_id
    order by c.updated_at desc;
$$;

create or replace function public.begin_generation(p_request_id uuid, p_conv_id text, p_user_id text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare result uuid;
begin
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_conv_id, 0));
    if not exists (select 1 from public.conversations where id = p_conv_id and user_id = p_user_id) then
        return false;
    end if;
    update public.generation_requests set active = false
        where conversation_id = p_conv_id and active and expires_at <= now();
    if exists (select 1 from public.generation_requests where conversation_id = p_conv_id and active) then
        return false;
    end if;
    insert into public.generation_requests(request_id, user_id, conversation_id, active)
        values(p_request_id, p_user_id, p_conv_id, true)
        on conflict (request_id) do nothing returning request_id into result;
    return result is not null;
end;
$$;

create or replace function public.cancel_generation(p_request_id uuid, p_user_id text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare result uuid;
begin
    -- Tombstone prevents a stop arriving before /generate from being lost.
    insert into public.generation_requests(request_id, user_id, active)
        values(p_request_id, p_user_id, false)
    on conflict (request_id) do update set active = false
        where public.generation_requests.user_id = p_user_id
    returning request_id into result;
    return result is not null;
end;
$$;

create or replace function public.append_conversation_message(
    p_conv_id text, p_user_id text, p_message jsonb, p_request_id uuid default null
)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare result text;
begin
    if p_request_id is not null then
        perform 1 from public.generation_requests
            where request_id = p_request_id and user_id = p_user_id and conversation_id = p_conv_id
              and active and expires_at > now() for update;
        if not found then return false; end if;
    end if;
    update public.conversations
        set messages = coalesce(messages, '[]'::jsonb) || jsonb_build_array(p_message), updated_at = now()
        where id = p_conv_id and user_id = p_user_id
        returning id into result;
    return result is not null;
end;
$$;

revoke all on function public.consume_usage(text,integer),
    public.list_conversation_summaries(text), public.begin_generation(uuid,text,text),
    public.cancel_generation(uuid,text), public.append_conversation_message(text,text,jsonb,uuid)
    from public, anon, authenticated;
grant execute on function public.consume_usage(text,integer),
    public.list_conversation_summaries(text), public.begin_generation(uuid,text,text),
    public.cancel_generation(uuid,text), public.append_conversation_message(text,text,jsonb,uuid)
    to service_role;
commit;

-- Optional scheduled housekeeping: retain lifetime guest-total counters.
-- delete from public.usage_counters where key not like 'guest-total:%'
--   and updated_at < now() - interval '7 days';
-- After migration 002, retain generation_requests: results and tombstones are
-- the durable idempotency boundary. Do not delete them on a daily schedule.
