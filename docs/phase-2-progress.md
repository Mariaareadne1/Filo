# Phase 2 — Business Dashboard: Build Progress

Tracks execution of the 5-step build spec in [`business-plan.md`](./business-plan.md) Part 2 §5.
The dashboard is a **read layer over existing consumer data**; the shipped wedge is
**Discovery Analytics** only. Everything else is a locked card in v1.

## Status

| Step | Deliverable | Status |
|---|---|---|
| **1. Business schema & RLS** | `businesses`, `venue_claims`, `offers`, `promoted_pins` tables + own-row RLS | ✅ **Done** — `supabase/migrations/20260813000000_phase2_business_layer.sql` |
| 2. Claim & verify flow | Business signup + venue-claim screen; auto-verify on email-domain match | ⬜ Not started |
| 3. Discovery-analytics RPCs | `venue_discovery_counts` / `venue_discovery_sources` / `venue_category_rank` (SECURITY DEFINER, aggregate/public only) | ⬜ Not started |
| 4. "This Week" dashboard | Discovery count + WoW delta, top source, category rank; locked Pro/Premium cards | ⬜ Not started |
| 5. Billing | Stripe subscriptions → `businesses.tier`; gate Pro/Premium RPCs on tier | ⬜ Not started |

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

## Next up — Step 2 (Claim & verify flow)

Search `places` by name / `google_place_id`, create a `venue_claims` row, and
auto-verify when the business signup email domain matches the venue website
domain — else mark `pending` for manual founder review.

**Privacy guardrail carried through every step:** businesses see aggregate +
public data only. Private pins, private boards, and any individual identity are
never exposed — enforced at the database layer (see `business-plan.md` Part 2 §6).
