-- World Math Cup — device sync schema.
--
-- Run this once, in the Supabase SQL editor of Scott's project (the same
-- project finns-chores uses — new tables here, nothing shared). It is safe
-- to re-run: every statement is `if not exists` / `or replace`.
--
-- SECURITY MODEL — read this before running it.
--
-- finns-chores' own Supabase backend runs with RLS disabled: "anyone with the
-- URL can read/write," which is a fine trade for chore data. This app's anon
-- key ships in the public JS bundle exactly the same way, so the same
-- posture here would mean anyone who opens the browser's dev tools can read
-- or rewrite any household's data, including a child's name.
--
-- So every table below has Row Level Security turned on with *no* policies
-- granted to the `anon` role — which, with no Supabase Auth session anywhere
-- in this app, is the role every single request runs as. No policies means
-- no direct access at all: `select * from wmc_players` over the REST API
-- returns nothing, full stop, however the request is shaped.
--
-- The only door in is a small set of `security definer` functions
-- (`wmc_create_household`, `wmc_join_household`, ...), each doing exactly
-- one narrow thing and owned by a role with real table access, so they can
-- reach through RLS in a controlled way. The client (`supabaseTransport.ts`)
-- never touches a table directly — every operation is one of these RPCs.
-- The practical effect: the only way to ever see a household's data is to
-- already hold its household id or player id (handed out once, at join
-- time, via a 6-character invite code that is expensive to guess — 32^6,
-- about a billion combinations) or to know the invite code itself.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables

create table if not exists wmc_households (
  id uuid primary key default gen_random_uuid(),
  invite_code text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists wmc_players (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references wmc_households (id) on delete cascade,
  name text not null,
  -- The whole (country, settings) pair, synced as one unit, last-write-wins.
  -- `profile_updated_at` is epoch milliseconds (matches `Date.now()` on the
  -- client) rather than `timestamptz`, so there is no timezone or string-
  -- format conversion anywhere in the sync path — just one comparable
  -- integer, set by whichever device pushed last. `null` means nobody has
  -- ever pushed a profile for this player yet.
  country jsonb,
  settings jsonb,
  profile_updated_at bigint,
  created_at timestamptz not null default now()
);

create table if not exists wmc_attempts (
  player_id uuid not null references wmc_players (id) on delete cascade,
  -- Which device minted this attempt, and that device's own local id for it
  -- (e.g. "a000000000042"). The compound key is the whole reason cross-device
  -- sync is safe: two devices mint the same local id for different attempts
  -- constantly, and (player_id, device_id, local_id) is what tells them
  -- apart. See `src/sync/attemptMerge.ts` for the client-side half of this.
  device_id text not null,
  local_id text not null,
  -- The attempt exactly as the client wrote it, opaque to this schema. The
  -- client re-validates every row on the way back in with the same
  -- `validateAttempt` a local write goes through — a corrupt row here is
  -- dropped there, never trusted.
  attempt jsonb not null,
  created_at timestamptz not null default now(),
  primary key (player_id, device_id, local_id)
);

alter table wmc_households enable row level security;
alter table wmc_players enable row level security;
alter table wmc_attempts enable row level security;
-- Deliberately no policies. See the security model note above: this is what
-- makes every table unreachable except through the functions below.

-- ---------------------------------------------------------------------------
-- Household / player management

create or replace function wmc_generate_invite_code()
returns text
language sql
as $$
  -- Same alphabet finns-chores uses: no 0/O or 1/I, which are easy to
  -- misread off a screen when a grown-up is typing a code into a second
  -- device's Settings.
  select string_agg(
    substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (random() * 32)::int + 1, 1),
    ''
  )
  from generate_series(1, 6)
$$;

create or replace function wmc_create_household()
returns table(household_id uuid, invite_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_id uuid;
begin
  loop
    v_code := wmc_generate_invite_code();
    begin
      insert into wmc_households (invite_code) values (v_code) returning id into v_id;
      exit;
    exception when unique_violation then
      -- Astronomically unlikely at 32^6 combinations; retry with a fresh
      -- code rather than fail the whole request over a coin-flip collision.
    end;
  end loop;
  return query select v_id, v_code;
end;
$$;

-- `null` if the code does not match any household. Never throws for "not
-- found" — that is an expected, common answer while someone is mid-typing.
create or replace function wmc_join_household(p_code text)
returns uuid
language sql
security definer
set search_path = public
as $$
  select id from wmc_households where invite_code = upper(trim(p_code));
$$;

create or replace function wmc_list_players(p_household_id uuid)
returns table(player_id uuid, name text)
language sql
security definer
set search_path = public
as $$
  select id, name from wmc_players where household_id = p_household_id order by created_at;
$$;

create or replace function wmc_create_player(p_household_id uuid, p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into wmc_players (household_id, name) values (p_household_id, trim(p_name))
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profile (country + settings), last-write-wins

-- Zero rows if nobody has ever pushed a profile for this player — the client
-- reads that as `null` and adopts nothing, per the safety property in
-- `syncEngine.ts`: a device with nothing to compare against never invents a
-- "change" to push.
create or replace function wmc_pull_profile(p_player_id uuid)
returns table(country jsonb, settings jsonb, updated_at bigint)
language sql
security definer
set search_path = public
as $$
  select country, settings, profile_updated_at
  from wmc_players
  where id = p_player_id and profile_updated_at is not null;
$$;

-- Adopts the candidate only if it is strictly newer than what is already
-- stored; either way, always returns whatever is now authoritative, so the
-- caller converges in this one round trip rather than needing to ask again.
create or replace function wmc_push_profile(
  p_player_id uuid,
  p_country jsonb,
  p_settings jsonb,
  p_updated_at bigint
)
returns table(country jsonb, settings jsonb, updated_at bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current bigint;
begin
  select profile_updated_at into v_current from wmc_players where id = p_player_id;

  if v_current is null or p_updated_at > v_current then
    update wmc_players
    set country = p_country, settings = p_settings, profile_updated_at = p_updated_at
    where id = p_player_id;
  end if;

  return query
    select wmc_players.country, wmc_players.settings, wmc_players.profile_updated_at
    from wmc_players
    where id = p_player_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Attempts (append-only)

-- `p_attempts` is a JSON array of attempt objects, each carrying its own
-- `id` — that becomes `local_id`. `on conflict do nothing` is what makes a
-- repeat push of the same attempt harmless: attempts never change once
-- written, so the first copy standing is always correct.
create or replace function wmc_push_attempts(
  p_player_id uuid,
  p_device_id text,
  p_attempts jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into wmc_attempts (player_id, device_id, local_id, attempt)
  select p_player_id, p_device_id, elem ->> 'id', elem
  from jsonb_array_elements(p_attempts) as elem
  on conflict (player_id, device_id, local_id) do nothing;
end;
$$;

-- Every attempt for this player, across every device that has ever pushed
-- one — including this device's own, which `foldRemoteAttempts` on the
-- client relies on to recognise and skip rather than re-namespace.
create or replace function wmc_pull_attempts(p_player_id uuid)
returns table(device_id text, local_id text, attempt jsonb, created_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select device_id, local_id, attempt, created_at
  from wmc_attempts
  where player_id = p_player_id;
$$;

-- ---------------------------------------------------------------------------
-- Grants — the anon key runs as `anon` with no Supabase Auth session
-- anywhere in this app, so this is the entire access surface.

grant execute on function wmc_create_household() to anon;
grant execute on function wmc_join_household(text) to anon;
grant execute on function wmc_list_players(uuid) to anon;
grant execute on function wmc_create_player(uuid, text) to anon;
grant execute on function wmc_pull_profile(uuid) to anon;
grant execute on function wmc_push_profile(uuid, jsonb, jsonb, bigint) to anon;
grant execute on function wmc_push_attempts(uuid, text, jsonb) to anon;
grant execute on function wmc_pull_attempts(uuid) to anon;
