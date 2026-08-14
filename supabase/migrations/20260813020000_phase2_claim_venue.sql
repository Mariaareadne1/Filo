-- Phase 2 — Venue claiming (Step 2 of the dashboard build spec).
--
-- Adds the trusted claim path. Client code may only INSERT *pending* claims
-- (locked by the Step-3 RLS hardening); this SECURITY DEFINER RPC is the ONLY
-- way a claim reaches status='verified', and it does so solely via an
-- email-domain match against the venue's own website — never by client say-so.

-- Venues need a website to support email-domain verification. Nullable; usually
-- backfilled from Google Places data when the venue row is first created.
alter table places add column if not exists website text;

-- Claim a venue for the signed-in owner. Creates (or reuses) the caller's
-- business row, records a venue_claims audit row, and auto-verifies IFF the
-- caller's email domain matches the venue website's domain. Returns the
-- resulting claim status ('verified' | 'pending').
create or replace function claim_venue(p_place_id uuid, p_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid            uuid := (select auth.uid());
  v_email          text;
  v_caller_domain  text;
  v_site_domain    text;
  v_business_id    uuid;
  v_status         text := 'pending';
  v_method         text := 'manual';
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  if not exists (select 1 from places where id = p_place_id) then
    raise exception 'no such place' using errcode = '23503';
  end if;

  -- Caller identity + venue website, for the domain match.
  select lower(email) into v_email from auth.users where id = v_uid;
  v_caller_domain := nullif(split_part(v_email, '@', 2), '');

  select lower(regexp_replace(website, '^\s*https?://(www\.)?([^/]+).*$', '\2'))
    into v_site_domain
    from places
   where id = p_place_id and website is not null and website <> '';

  if v_caller_domain is not null
     and v_site_domain is not null
     and v_caller_domain = v_site_domain then
    v_status := 'verified';
    v_method := 'email_domain';
  end if;

  -- One business per owner for the MVP: reuse the existing row if present.
  select id into v_business_id from businesses where owner_auth_id = v_uid limit 1;

  if v_business_id is null then
    insert into businesses (owner_auth_id, place_id, name)
    values (v_uid, p_place_id, coalesce(nullif(p_name, ''), 'My venue'))
    returning id into v_business_id;
  else
    update businesses
       set place_id = p_place_id,
           name = coalesce(nullif(p_name, ''), name)
     where id = v_business_id;
  end if;

  insert into venue_claims (business_id, place_id, method, status, evidence)
  values (
    v_business_id,
    p_place_id,
    v_method,
    v_status,
    case when v_status = 'verified'
         then 'auto: email domain ' || v_caller_domain || ' matches venue website'
         else 'pending manual review' end
  );

  return v_status;
end;
$$;

comment on function claim_venue is
  'Trusted claim path: creates the owner business + claim, auto-verifies only on email-domain match.';

revoke execute on function claim_venue(uuid, text) from public;
grant  execute on function claim_venue(uuid, text) to authenticated;
