-- Phase 2 — Business layer (Step 1 of the dashboard build spec).
--
-- A thin, additive layer on top of the untouched consumer schema. This migration
-- creates the claimed-business account model, the claim/verification audit trail,
-- and the (defined-now / built-later) Premium surfaces (offers, promoted pins).
-- Every table is protected by RLS so a business can only ever reach its OWN rows;
-- all cross-venue analytics goes through SECURITY DEFINER RPCs added in Step 3.
--
-- See docs/business-plan.md · Part 2 §2 (data-model deltas) and §5 (build steps).

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

-- A claimed business account, separate from the consumer `users` table. Keyed
-- to a Supabase auth user carrying the business role, and to the `places` row
-- that usually already exists (created when the first student pinned the venue).
create table if not exists businesses (
  id            uuid primary key default gen_random_uuid(),
  owner_auth_id uuid not null references auth.users(id) on delete cascade,
  place_id      uuid references places(id),
  name          text not null,
  tier          text not null default 'free'
                  check (tier in ('free', 'pro', 'premium')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (place_id)                             -- one owner per venue
);

comment on table businesses is
  'Claimed venue accounts (Phase 2). Separate from consumer users; one per place.';

-- Verification / claim audit trail. A venue can accumulate several claim attempts
-- (e.g. a failed email-domain match followed by a manual founder approval); the
-- business is only "live" once a row here reaches status = verified.
create table if not exists venue_claims (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  place_id    uuid not null references places(id),
  method      text not null
                check (method in ('email_domain', 'phone', 'manual')),
  status      text not null default 'pending'
                check (status in ('pending', 'verified', 'rejected')),
  evidence    text,
  created_at  timestamptz not null default now()
);

comment on table venue_claims is
  'Claim/verification audit trail. A business is live once it has a verified claim.';

-- ---- Premium surfaces: defined now for schema stability, built later. --------

-- Student-facing deals attached to a claimed venue (Premium tier).
create table if not exists offers (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  title       text not null,
  terms       text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

comment on table offers is
  'Phase-2 Premium: student-facing deals. Schema defined now, surfaced later.';

-- Paid pin promotion within discovery (Premium tier).
create table if not exists promoted_pins (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null references businesses(id) on delete cascade,
  starts_at        timestamptz,
  ends_at          timestamptz,
  weekly_rate_cents integer check (weekly_rate_cents is null or weekly_rate_cents >= 0)
);

comment on table promoted_pins is
  'Phase-2 Premium: paid pin promotion. Schema defined now, surfaced later.';

-- ---------------------------------------------------------------------------
-- 2. Indexes (foreign-key lookups the dashboard will hammer)
-- ---------------------------------------------------------------------------

create index if not exists idx_businesses_owner_auth_id on businesses (owner_auth_id);
create index if not exists idx_businesses_place_id       on businesses (place_id);
create index if not exists idx_venue_claims_business_id  on venue_claims (business_id);
create index if not exists idx_venue_claims_place_id     on venue_claims (place_id);
create index if not exists idx_offers_business_id        on offers (business_id);
create index if not exists idx_promoted_pins_business_id on promoted_pins (business_id);

-- ---------------------------------------------------------------------------
-- 3. updated_at trigger on businesses (reuses set_updated_at from the data layer)
-- ---------------------------------------------------------------------------

drop trigger if exists trg_businesses_updated_at on businesses;
create trigger trg_businesses_updated_at
  before update on businesses
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. Row-Level Security
--
-- Baseline invariant: a business account can read/write ONLY its own rows, and
-- the rows of the tables that hang off it. No business can ever see another
-- business's data through these policies. Cross-venue analytics is served by
-- SECURITY DEFINER RPCs (Step 3), never by direct client SELECTs.
--
-- Policies use the (select auth.uid()) initplan form so Postgres evaluates the
-- auth lookup once per query rather than once per row (matches the consumer
-- policies rebuilt in the security-hardening migration).
-- ---------------------------------------------------------------------------

alter table businesses    enable row level security;
alter table venue_claims  enable row level security;
alter table offers        enable row level security;
alter table promoted_pins enable row level security;

-- businesses: an owner sees and manages only their own account row.
drop policy if exists businesses_select_own on businesses;
create policy businesses_select_own on businesses
  for select using (owner_auth_id = (select auth.uid()));

drop policy if exists businesses_insert_own on businesses;
create policy businesses_insert_own on businesses
  for insert with check (owner_auth_id = (select auth.uid()));

drop policy if exists businesses_update_own on businesses;
create policy businesses_update_own on businesses
  for update using (owner_auth_id = (select auth.uid()))
              with check (owner_auth_id = (select auth.uid()));

drop policy if exists businesses_delete_own on businesses;
create policy businesses_delete_own on businesses
  for delete using (owner_auth_id = (select auth.uid()));

-- venue_claims / offers / promoted_pins: reachable only through the owning
-- business row. The EXISTS subquery is itself RLS-filtered, so it only matches
-- a business the caller owns.
drop policy if exists venue_claims_own on venue_claims;
create policy venue_claims_own on venue_claims
  for all
  using (exists (
    select 1 from businesses b
    where b.id = venue_claims.business_id
      and b.owner_auth_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from businesses b
    where b.id = venue_claims.business_id
      and b.owner_auth_id = (select auth.uid())
  ));

drop policy if exists offers_own on offers;
create policy offers_own on offers
  for all
  using (exists (
    select 1 from businesses b
    where b.id = offers.business_id
      and b.owner_auth_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from businesses b
    where b.id = offers.business_id
      and b.owner_auth_id = (select auth.uid())
  ));

drop policy if exists promoted_pins_own on promoted_pins;
create policy promoted_pins_own on promoted_pins
  for all
  using (exists (
    select 1 from businesses b
    where b.id = promoted_pins.business_id
      and b.owner_auth_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from businesses b
    where b.id = promoted_pins.business_id
      and b.owner_auth_id = (select auth.uid())
  ));
