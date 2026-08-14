# Phase 2 — Business Dashboard: Build Progress

Tracks execution of the 5-step build spec in [`business-plan.md`](./business-plan.md) Part 2 §5.
The dashboard is a **read layer over existing consumer data**; the shipped wedge is
**Discovery Analytics** only. Everything else is a locked card in v1.

## Status

| Step | Deliverable | Status |
|---|---|---|
| **1. Business schema & RLS** | `businesses`, `venue_claims`, `offers`, `promoted_pins` tables + own-row RLS | ✅ **Done** — `supabase/migrations/20260813000000_phase2_business_layer.sql` |
| **2. Claim & verify flow** | Business login (OTP) + venue-claim screen; `claim_venue` RPC auto-verifies on email-domain match | ✅ **Done** — `…_claim_venue.sql`, `web/app/business/{login,claim}` |
| **3. Discovery-analytics RPCs** | `venue_discovery_counts` / `_sources` / `_category_rank` (SECURITY DEFINER, aggregate/public only) | ✅ **Done** — `…_discovery_rpcs.sql` (2 reviews, all findings fixed) |
| **4. "This Week" dashboard** | Discovery count + WoW delta, top source, category rank; locked Pro/Premium cards | ✅ **Done** — `web/app/business/page.tsx` + `web/components/filo/` |
| 5. Billing | Stripe subscriptions → `businesses.tier`; gate Pro/Premium on tier | 🟡 Scaffolded — blocked on Stripe keys |

## Step 1 — what shipped

The additive business layer (no consumer table touched):

- **`businesses`** — one claimed account per venue (`unique(place_id)`), tied to a
  Supabase auth user (`owner_auth_id`) and a `tier` of `free | pro | premium`.
- **`venue_claims`** — verification audit trail (`email_domain | phone | manual`,
  status `pending | verified | rejected`). A business is "live" once it has a
  verified claim.
- **`offers`, `promoted_pins`** — Premium surfaces defined now for schema stability,
  built in a later step.
- **RLS invariant:** every table is own-row only — a business can never read
  another business's data through direct SELECTs. Cross-venue analytics is
  reserved for the SECURITY DEFINER RPCs in Step 3.

### To apply
```bash
supabase db push        # or run the migration SQL against your instance
```

## Steps 2–4 — what shipped

**The dashboard lives in the existing `web/` Next.js 16 app** (desktop, owner-facing),
styled with a ported Filo design system (Paper palette, red thread `#d8423a`,
sticker shadow, Fraunces/Inter/DM Mono).

- **Auth** — Supabase OTP login for business owners (`web/app/business/login`),
  cookie sessions via `@supabase/ssr` (`web/lib/supabase-server.ts`).
- **Claim & verify** — `web/app/business/claim` searches `places` and calls the
  `claim_venue` SECURITY DEFINER RPC. Client code can only insert **pending**
  claims (RLS-locked); the RPC is the sole path to `verified`, and only via an
  email-domain match against `places.website`.
- **Discovery-analytics RPCs** — three SECURITY DEFINER functions, hardened
  against two review passes (see the Step-3 migration header).
- **"This Week" dashboard** — `web/app/business/page.tsx` renders the hero count
  + WoW delta, top source, category rank, and locked Pro/Premium teasers.

### Security decisions locked in during review
- `venue_claims` RLS lets clients insert only `status='pending'`; the
  `pending → verified` transition is reserved for `claim_venue` / service_role.
- Every analytics read is restricted to **public pins from public-account users**
  and **public boards**; a **k-anonymity floor of 3** suppresses any attribution
  number that could single out an individual.

## Next up — Step 5 (Billing)

Wire Stripe subscriptions to `businesses.tier` (free/pro/premium at $0/$49/$149),
gate Pro/Premium capabilities on tier. **Blocked on** a Stripe account +
`STRIPE_SECRET_KEY` / webhook secret; scaffolded behind env vars.

## Review gates run

Each step was gated by specialist review before merge:
- **Step 3 (SQL):** database-reviewer + security-reviewer — caught 2 CRITICALs
  (forgeable self-verify claim; LEFT JOIN privacy leak), all fixed.
- **Steps 2 & 4 (web):** react-reviewer + a11y-architect — fixed the search
  race + debounce, zod validation on all Server Actions, LIKE-wildcard escaping,
  RPC error logging, WCAG-AA contrast (ink-mute → 0.64 alpha, thread → `#c43a31`),
  `aria-live` search results, delta text alternative, form error association,
  listbox/option semantics, and wired ESLint (`eslint-config-next`) for `web/`.

### Deferred follow-ups (tracked, not blocking)
- **App-level rate limiting** on `sendOtp` / `searchPlaces` Server Actions
  (IP + email). Supabase Auth throttles OTP sends upstream; add an explicit
  limiter (e.g. Upstash) before broad launch.
- **Suspense streaming** for the dashboard (render shell before analytics land).
- **Skip-to-content link** once the business shell grows past one nav item.

**Privacy guardrail carried through every step:** businesses see aggregate +
public data only. Private pins, private boards, and any individual identity are
never exposed — enforced at the database layer (see `business-plan.md` Part 2 §6).
