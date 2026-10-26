-- Phase 2 — Discovery-analytics RPCs + authorization hardening (Step 3).
--
-- Three SECURITY DEFINER functions that serve the dashboard wedge, PLUS a
-- correction to the Step-1 venue_claims RLS that the RPCs' authorization boundary
-- depends on. Each RPC:
--   (a) ASSERTS the caller owns a *verified* claim on p_place_id, else raises
--       'forbidden' — the client never queries consumer tables directly.
--   (b) returns ONLY aggregate or already-public data, with a k-anonymity floor
--       on the deanonymizing (source/attribution) numbers.
--
-- PRIVACY INVARIANT (enforced here, not in the client):
--   A business may only ever see discovery derived from
--     * PUBLIC pins  (pins.is_public = true), authored by
--     * PUBLIC users (users.is_private = false), and
--     * PUBLIC boards (boards.visibility = 'public'),
--   and no attribution number below K_ANON (=3) distinct people is revealed.
--   Private pins, private accounts, non-public boards, and any individual
--   identity are NEVER exposed. See docs/business-plan.md Part 2 §6.
--
-- SECURITY DEFINER means the body runs as the function owner and BYPASSES RLS,
-- so every consumer-table read below carries the public-only predicate
-- explicitly. Do not relax these WHERE clauses without re-reviewing the invariant.

-- ===========================================================================
-- 0. Authorization hardening — correct the Step-1 venue_claims RLS.
--
-- The Step-1 policy (migration 20260813000000) let an authenticated user INSERT
-- a row with status='verified' for ANY place_id, which would forge the exact
-- condition assert_owns_verified_venue() trusts. Lock client writes to *pending*
-- claims only; the pending -> verified transition is reserved for a trusted
-- path (the SECURITY DEFINER claim_venue() RPC in Step 2, or service_role).
-- ===========================================================================

drop policy if exists venue_claims_own on venue_claims;

-- Owners may READ their own claims (any status).
drop policy if exists venue_claims_select_own on venue_claims;
create policy venue_claims_select_own on venue_claims
  for select
  using (exists (
    select 1 from businesses b
    where b.id = venue_claims.business_id
      and b.owner_auth_id = (select auth.uid())
  ));

-- Owners may INSERT claims for their own business, but ONLY as 'pending'.
-- They can never write a 'verified' row directly.
drop policy if exists venue_claims_insert_pending on venue_claims;
create policy venue_claims_insert_pending on venue_claims
  for insert
  with check (
    status = 'pending'
    and exists (
      select 1 from businesses b
      where b.id = venue_claims.business_id
        and b.owner_auth_id = (select auth.uid())
    )
  );

-- No UPDATE/DELETE policy for the authenticated role → RLS denies both, so the
-- status column cannot be escalated client-side. Explicit revoke as belt-and-braces.
revoke update, delete on venue_claims from authenticated;

-- ===========================================================================
-- 1. Shared helpers
-- ===========================================================================

-- Single source of truth for the Columbia/Morningside campus bounding box
-- (center ≈ -73.9626, 40.8075), used by "category rank near campus".
create or replace function filo_campus_bbox()
returns table (min_lat float, max_lat float, min_lng float, max_lng float)
language sql immutable
set search_path = public
as $$
  select 40.7625::float, 40.8525::float, -74.0226::float, -73.9026::float;
$$;

comment on function filo_campus_bbox is
  'Single source of truth for the Columbia/Morningside campus bounding box.';

-- Authorization guard: raises unless the caller owns a VERIFIED claim on the
-- venue. Called at the top of every analytics RPC. STABLE (read-only).
create or replace function assert_owns_verified_venue(p_place_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from businesses b
    join venue_claims vc on vc.business_id = b.id
    where b.owner_auth_id = (select auth.uid())
      and b.place_id = p_place_id
      and vc.place_id = p_place_id
      and vc.status = 'verified'
  ) then
    raise exception 'forbidden: caller does not own a verified claim on this venue'
      using errcode = '42501';
  end if;
end;
$$;

comment on function assert_owns_verified_venue is
  'Authorization guard for business analytics RPCs: verified claim required.';

-- ===========================================================================
-- 2. (a) "Who discovered you this week" — count + WoW delta. Aggregate only.
-- ===========================================================================
create or replace function venue_discovery_counts(p_place_id uuid)
returns table (this_week integer, prior_week integer, delta integer)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform assert_owns_verified_venue(p_place_id);

  return query
  with discovery_pins as (
    select p.user_id, p.created_at
    from pins p
    join users u on u.id = p.user_id
    where p.place_id = p_place_id
      and p.is_public = true                       -- public pins only
      and u.is_private = false                      -- from public accounts only
      and p.created_at >= now() - interval '14 days' -- only the window we report
  )
  select
    count(distinct user_id) filter (
      where created_at >= now() - interval '7 days'
    )::integer as this_week,
    count(distinct user_id) filter (
      where created_at >= now() - interval '14 days'
        and created_at <  now() - interval '7 days'
    )::integer as prior_week,
    (
      count(distinct user_id) filter (where created_at >= now() - interval '7 days')
      - count(distinct user_id) filter (
          where created_at >= now() - interval '14 days'
            and created_at <  now() - interval '7 days'
        )
    )::integer as delta
  from discovery_pins;
end;
$$;

comment on function venue_discovery_counts is
  'Aggregate distinct public pinners this week vs prior week (+delta). Verified-owner only.';

-- ===========================================================================
-- 3. (b) "Where discovery came from" — attribution over PUBLIC signals only.
--     A k-anonymity floor of 3 suppresses any source that would single out an
--     identifiable individual (e.g. a named board with a follower reach of 1).
-- ===========================================================================
create or replace function venue_discovery_sources(p_place_id uuid)
returns table (source_type text, label text, reach integer)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  k_anon constant integer := 3;  -- minimum distinct people before a number is shown
begin
  perform assert_owns_verified_venue(p_place_id);

  return query
  -- Top public board featuring the venue, ranked by distinct follower reach.
  -- Grouped by board_id (names are not unique) so two same-named public boards
  -- from different owners are not merged.
  with venue_boards as (
    select b.id as board_id, b.name as board_name, b.user_id as owner_id
    from boards b
    join board_pins bp on bp.board_id = b.id
    join pins p on p.id = bp.pin_id
    join users u on u.id = p.user_id
    where p.place_id = p_place_id
      and b.visibility = 'public'   -- public boards only
      and p.is_public = true        -- public pins only
      and u.is_private = false      -- from public accounts only
  ),
  board_reach as (
    select vb.board_id,
           min(vb.board_name) as board_name,
           count(distinct f.follower_id) as reach
    from venue_boards vb
    left join follows f
      on f.following_id = vb.owner_id
     and f.status = 'active'
    group by vb.board_id
    order by reach desc, vb.board_id asc
    limit 1
  )
  select 'board'::text, board_reach.board_name, board_reach.reach::integer
  from board_reach
  where board_reach.reach >= k_anon           -- suppress small-cell disclosure

  union all

  -- Follow-graph chain: this-week public pinners who follow an *earlier* public
  -- pinner of the same venue. Pure count, no identities. Self-follows excluded.
  select 'follow'::text, 'word-of-mouth chain'::text, chain.n
  from (
    select count(distinct recent.user_id)::integer as n
    from pins recent
    join users ru on ru.id = recent.user_id
    where recent.place_id = p_place_id
      and recent.is_public = true
      and ru.is_private = false
      and recent.created_at >= now() - interval '7 days'
      and exists (
        select 1
        from follows f
        join pins earlier on earlier.user_id = f.following_id
        join users eu on eu.id = earlier.user_id
        where f.follower_id = recent.user_id
          and f.status = 'active'
          and f.follower_id <> f.following_id     -- ignore any self-follow row
          and earlier.place_id = p_place_id
          and earlier.is_public = true
          and eu.is_private = false
          and earlier.created_at < recent.created_at
      )
  ) chain
  where chain.n >= k_anon;                       -- suppress small-cell disclosure
end;
$$;

comment on function venue_discovery_sources is
  'Public-board + follow-chain attribution, k-anonymity floor 3. Verified-owner only.';

-- ===========================================================================
-- 4. (c) "Category rank near campus." Rank among same-category campus venues
--     by distinct PUBLIC pinner count. Returns rank + field size.
-- ===========================================================================
create or replace function venue_category_rank(p_place_id uuid)
returns table (category text, rank integer, total integer)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_category text;
  bb record;
begin
  perform assert_owns_verified_venue(p_place_id);

  select category into v_category from places where id = p_place_id;
  if v_category is null then
    return; -- unknown place, empty result
  end if;

  select * into bb from filo_campus_bbox();

  return query
  with campus_places as (
    -- Same-category venues in the campus bbox, PLUS the caller's own venue even
    -- if it falls just outside the box (so rank is never a confusing NULL-of-N).
    select pl.id
    from places pl
    where pl.category = v_category
      and (
        (pl.lat between bb.min_lat and bb.max_lat
         and pl.lng between bb.min_lng and bb.max_lng)
        or pl.id = p_place_id
      )
  ),
  -- Privacy filter applied in an INNER-JOIN subquery so private-account pins are
  -- genuinely EXCLUDED (a predicate in a LEFT JOIN's ON clause would not filter).
  qualifying_pins as (
    select p.place_id, p.user_id
    from pins p
    join users u on u.id = p.user_id
    where p.is_public = true
      and u.is_private = false
  ),
  place_pinners as (
    select cp.id as place_id,
           count(distinct qp.user_id) as pinner_count
    from campus_places cp
    left join qualifying_pins qp on qp.place_id = cp.id
    group by cp.id
  ),
  ranked as (
    select place_id,
           rank() over (order by pinner_count desc) as rnk
    from place_pinners
  )
  select v_category,
         (select rnk from ranked where place_id = p_place_id)::integer,
         (select count(*) from campus_places)::integer;
end;
$$;

comment on function venue_category_rank is
  'Rank among same-category campus venues by distinct public pinners. Verified-owner only.';

-- ===========================================================================
-- 5. Supporting indexes on the CONSUMER tables (hot paths for the RPCs).
-- ===========================================================================

-- The place_id (eq) → is_public (eq) → created_at (range) access pattern used
-- by all three RPCs. `if not exists` keeps the migration idempotent.
create index if not exists pins_place_public_created_idx
  on pins (place_id, is_public, created_at desc);

-- assert_owns_verified_venue runs on every RPC call (3× per dashboard load).
create index if not exists venue_claims_place_status_idx
  on venue_claims (place_id, status);

-- ===========================================================================
-- 6. Grants — least privilege. Revoke the default PUBLIC execute, then grant
--    only the three public entry points (and the helper guard) to authenticated.
--    Each entry point self-authorizes via assert_owns_verified_venue.
-- ===========================================================================

revoke execute on function
  venue_discovery_counts(uuid),
  venue_discovery_sources(uuid),
  venue_category_rank(uuid),
  assert_owns_verified_venue(uuid),
  filo_campus_bbox()
from public;

grant execute on function
  venue_discovery_counts(uuid),
  venue_discovery_sources(uuid),
  venue_category_rank(uuid),
  assert_owns_verified_venue(uuid),
  filo_campus_bbox()
to authenticated;
