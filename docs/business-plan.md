# Filo — Business Plan

**The thread, made profitable.**
Strategy + Phase-2 dashboard build spec · v1.0

> Directional document. All financial figures are labeled assumptions, not audited projections. Part 1 is the strategy and business model; Part 2 is the buildable Phase-2 spec.

---

## Part 1 — Strategy

### 1. The thread is two-sided

Filo's consumer product turns a student's social life into a map: every pin is a place a real, named friend has actually been. That map is built entirely by students, for free, because it is useful to *them*. The business opportunity is the exhaust of that behavior.

- **Demand side (students)** already do the work: they pin, rank, and share places. This is the moat — a live, trusted, local graph that no ad network can fake.
- **Supply side (venues)** is where the money is: the businesses being pinned have never been able to see, measure, or act on the word-of-mouth that drives most of their new customers.

**The flywheel:** more students → more pins → richer proof of who's discovering each venue → more venues claim their page and pay for insight → venue-sponsored student offers → more reasons for students to open Filo → more students. The consumer graph feeds the business product, and the business product (offers, promoted pins) feeds the consumer graph back. Neither side pays to bootstrap the other — the data already exists.

### 2. The business problem

For a Morningside Heights barbershop, café, or bar, **word-of-mouth is the #1 growth engine — and it is completely invisible.**

- Yelp and Google give you *anonymous* reviews and a star average. They don't tell you a real person recommended you, who they are, or how many.
- Instagram gives you followers, not customers, and no attribution.
- Nobody has ever been able to walk into that barbershop and say: *"34 Columbia students pinned you this semester, and 9 of them found you through one student's board."*

Filo already holds exactly that data. The business product is not a new data-collection burden on the venue — it is a **read layer over data students are already generating.** That is the entire wedge.

### 3. Positioning & market

Filo is **not** for all small businesses. It is for **social-discovery venues** — places people find through friends, visit on a recommendation, and talk about unprompted:

| In scope | Out of scope |
|---|---|
| Food & drink (restaurants, cafés, bakeries) | Doctors, dentists, vets |
| Bars & nightlife | Pharmacies, dry cleaners |
| Beauty & grooming (salons, barbers, nails, lash/brow) | Lawyers, accountants |
| Experiences (yoga, climbing, pottery, escape rooms) | Necessity/utility businesses |
| Taste retail (vintage, bookshops, record stores, boutiques) | — nobody pins these |

**Beachhead — Morningside Heights + the Columbia/Barnard footprint.** *(assumption)* Roughly **150–250 qualifying social-discovery venues** sit within ~1 mile of campus. That's the entire initial serviceable market, and it's a feature, not a limitation: it's small enough to sell door-to-door and dense enough that word travels between owners.

**Expansion is campus-by-campus, not city-by-city.** Each new campus (NYU, Fordham, then Boston/Philly clusters) is a self-contained beachhead with its own dense venue set and its own student graph. The consumer product's invite-only campus model *is* the business product's go-to-market segmentation.

### 4. Why now / why Filo wins

- **The graph is the moat.** Anyone can build a business-analytics dashboard. Almost no one can build the trusted student discovery graph underneath it. Filo builds the hard thing (consumer) first and monetizes the easy thing (dashboard) second.
- **Zero marginal data cost.** The insight a venue pays for is a byproduct of student behavior. No sensors, no receipt scanning (Phase 3), no owner data entry.
- **Attribution nobody else has.** Because pins are attached to named users, boards, and a follow graph, Filo can answer *"where did this customer come from?"* at the person/board level — the holy grail Yelp/Google structurally cannot offer.

### 5. Business model — Freemium SaaS

Land the venue for free on undeniable proof; expand to paid as they get hooked on the insight.

| Tier | Price *(assumption)* | What the venue gets |
|---|---|---|
| **Free** | $0 | This-week discovery count + weekly delta, category rank near campus. Enough to prove the data is real and get them logging in. |
| **Pro** | **$49 / mo** | Everything in Free + **superfans** (who drives your word-of-mouth), **drifting regulars** (win-back), the **weekly AI action**, and trend history. |
| **Premium** | **$149 / mo** | Everything in Pro + **promoted pins**, **student offers/deals**, and **multi-location** rollups for small chains. |

Design intent: Free is a *hook*, not a demo — the discovery count is genuinely useful and creates a login habit. Pro converts the owner who now asks *"okay, who are these students and how do I keep them?"* Premium converts the owner who wants to *act* (offers, promotion), turning the dashboard from analytics into a growth channel.

### 6. Unit economics *(directional — assumptions labeled)*

Founder-led, walk-in sales means customer acquisition is mostly time, not spend.

| Assumption | Value | Note |
|---|---|---|
| CAC (early, founder-led) | ~$50–150 / venue | Mostly founder hours; ~$0 paid marketing |
| Paying-tier price | $49 (Pro) / $149 (Premium) | Blended ARPA across payers ≈ $60–75/mo |
| Gross margin | ~85% | Supabase/Mapbox/hosting are the only COGS |
| SMB monthly churn | ~3–5% | ⇒ avg paid lifetime ≈ 20–30 mo |
| LTV (Pro) | ≈ $49 × 0.85 × 24 ≈ **$1,000** | LTV:CAC ≈ 7–20× at founder-led CAC |
| Fixed burn (pre-team) | ~$150–400 / mo | Infra + tools |

**Break-even is small.** *(illustrative)* At ~$60 blended ARPA and ~$400/mo burn, **~7 paying venues** covers infrastructure; **~35–40 paying venues** supports a modest founder salary. In a 200-venue beachhead, claiming 30% (60 venues) and converting 30% of those to paid (≈18 venues) yields **~$1,000–1,300 MRR from one campus** — thin alone, but it's the *proof unit* that makes campus #2..N a repeatable playbook.

**What the 200-user / 500-pin consumer milestone unlocks:** it is the sales asset. Below that density the pitch is a promise; above it, the founder can print a real venue's real discovery data and lead with proof. The consumer KPI and the sales-readiness KPI are the same number.

### 7. Go-to-market

**The cold open is the product.** The founder walks into a Morningside venue with a one-page printout of *that venue's own Filo discovery data* — "here's what Columbia students are already saying about you." No other analytics tool can do a cold open with the prospect's own customer data.

1. **Claim-your-venue self-serve.** Owner signs up, finds their venue (it already exists as a `places` row via Google Places), verifies ownership, sees the Free dashboard immediately.
2. **First 10 venues = hand-sold, in person**, walking the blocks around campus. These become references and case studies.
3. **Peer proof travels a dense block.** Owners on the same street talk; a visible "claimed on Filo" and a few promoted student offers create local FOMO.
4. **Expand to paid** once the owner has logged in a few weeks and starts asking *who* and *how* — that's the Pro trigger.

### 8. Business-side success metrics

| Metric | Why it matters |
|---|---|
| Venues claimed (per campus) | Supply-side density; the sales funnel top |
| Free → paid conversion | Does the insight justify $49? |
| Logo (venue) retention / churn | Is the dashboard a habit or a novelty? |
| Promoted-pin / offer revenue | Premium-tier pull; the two-sided loop working |
| Discovery events attributed | Proof the attribution engine is credible to owners |

### 9. Risks & mitigations

- **Chicken-and-egg (supply vs demand).** *Mitigation:* never sell the business side before the consumer density exists on that campus. The 200/500 gate is a hard prerequisite, not a target.
- **Data thinness at launch.** A venue with 3 pins isn't a compelling dashboard. *Mitigation:* lead sales with the *densest* venues first (the café everyone already pins); let the long tail claim free and grow into paid.
- **Privacy / trust.** Students must trust that businesses can't see their private activity. *Mitigation:* the dashboard is aggregate + public-only by construction and enforced at the database layer (see Part 2 §5). This is a feature to market to students, not just a constraint.
- **Owner is not analytics-native.** *Mitigation:* Free tier is one number, not a chart wall; the weekly AI action (Pro) removes the need to interpret anything.

---

## Part 2 — Phase-2 Dashboard: Build Spec

Built in the pragmatic, step-by-step style of the consumer PRD. The dashboard is a **read layer over existing consumer data** — the wedge is **Discovery Analytics** only. Superfans, drift, AI action, and offers are deliberately *later*.

### 1. Venue claiming & verification

A business owner signs up (separate auth role from students), searches for their venue — which usually **already exists as a `places` row** (created when the first student pinned it, keyed by `google_place_id`) — and claims it. Verification for MVP, cheapest-first:

1. **Email domain match** against the venue's website domain (auto-approve).
2. **Phone/postcard/Google-Business** verification for venues without a matching domain email.
3. **Manual founder approval** as the fallback while volume is low.

### 2. Data-model deltas

The consumer schema is untouched. Add a thin business layer on top.

```sql
-- A claimed business account (separate from consumer `users`).
create table businesses (
  id            uuid primary key default gen_random_uuid(),
  owner_auth_id uuid not null,               -- Supabase auth user (business role)
  place_id      uuid references places(id),  -- the claimed venue
  name          text not null,
  tier          text not null default 'free' -- free | pro | premium
                 check (tier in ('free','pro','premium')),
  created_at    timestamptz default now(),
  unique(place_id)                            -- one owner per venue
);

-- Verification / claim audit trail.
create table venue_claims (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid references businesses(id) on delete cascade,
  place_id    uuid references places(id),
  method      text not null,                 -- email_domain | phone | manual
  status      text not null default 'pending'-- pending | verified | rejected
                 check (status in ('pending','verified','rejected')),
  evidence    text,
  created_at  timestamptz default now()
);

-- Phase-2 Premium (defined now, built later): offers + promoted pins.
create table offers (            -- student-facing deals
  id uuid primary key default gen_random_uuid(),
  business_id uuid references businesses(id) on delete cascade,
  title text not null, terms text, active boolean default true,
  created_at timestamptz default now()
);
create table promoted_pins (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references businesses(id) on delete cascade,
  starts_at timestamptz, ends_at timestamptz, weekly_rate_cents int
);
```

**Analytics access path:** the dashboard never queries raw consumer tables from the client. It calls `SECURITY DEFINER` RPCs that (a) verify the caller owns a verified claim on the `place_id`, and (b) return only **aggregate or already-public** data. RLS on `businesses`/`venue_claims` restricts a business to its own rows.

### 3. Discovery-analytics logic (the wedge)

All three metrics are computed from existing `pins` / `boards` / `board_pins` / `follows`, scoped to the venue's `place_id`.

**a) "Who discovered you this week" — count + WoW delta.**
```
this_week  = count(distinct pins.user_id)
             where pins.place_id = $venue and pins.created_at >= now() - 7d
prior_week = same, for the 7d before that
delta      = this_week - prior_week
```
Shown as a single number and an ↑/↓ delta. Aggregate only — the business sees *"34 students,"* never the roster.

**b) "Where discovery came from" — attribution.**
For pins on the venue in the window, walk two public signals:
- **Board attribution:** which **public** boards contain this venue's pin, ordered by how many distinct viewers/followers those boards reach. Surfaces *"@maya's 'Morningside Coffee' board → 9 discoveries."*
- **Follow-graph attribution:** among students who pinned the venue this week, how many follow an earlier public pinner of the same venue — i.e. the word-of-mouth chain.
Only **public** boards and **public** pins are ever traversed.

**c) "Category rank near campus."**
```
rank of $venue among places where category = $venue.category
        and place within the Columbia bbox (40.7625–40.8525, -74.0226–-73.9026)
        ordered by count(distinct pinner) desc
```
Yields *"#2 cafe near campus."* Reuses the same bbox constant the consumer discovery lenses use.

### 4. Dashboard v1 screens

1. **"This Week" home** — the hero is the discovery count + WoW delta; below it, the top discovery source and the category rank. One glance, no analytics literacy required.
2. **Venue profile** — the claimed venue's public presence on Filo (name, category, public impressions count) + claim/verification status.
3. **Upgrade path** — Pro/Premium capabilities shown as **locked sticker cards** ("Superfans — see who drives your word-of-mouth · unlock with Pro") so the value is legible before purchase.

Everything beyond the discovery-analytics wedge is a locked card in v1.

### 5. Build steps (Claude Code prompts)

**Step 1 — Business schema & RLS.** *Prompt:* "Add the `businesses`, `venue_claims`, `offers`, `promoted_pins` tables from the spec. Add RLS so a business row is readable/writable only by its `owner_auth_id`, and `venue_claims` only by the owning business. Add a `businesses.place_id` unique constraint." *Test:* two business accounts can't read each other's rows; a claim requires a real `place_id`.

**Step 2 — Claim & verify flow.** *Prompt:* "Build the business signup + venue-claim screen: search `places` by name/`google_place_id`, create a `venue_claims` row, auto-verify when the signup email domain matches the venue website domain, else mark pending for manual review." *Test:* claiming a place with a matching domain email flips the claim to `verified` and creates the `businesses` row.

**Step 3 — Discovery-analytics RPCs.** *Prompt:* "Write three `SECURITY DEFINER` RPCs — `venue_discovery_counts(place_id)`, `venue_discovery_sources(place_id)`, `venue_category_rank(place_id)` — each asserting the caller owns a verified claim on `place_id` and returning ONLY aggregate/public data per the spec's formulas. Traverse only public boards and public pins." *Test:* an unverified caller gets `forbidden`; private pins never appear in any count.

**Step 4 — 'This Week' dashboard.** *Prompt:* "Build the business dashboard home consuming the three RPCs: big discovery number + ↑/↓ delta, top source line, category-rank line, in the Filo sticker/serif design system. Locked Pro/Premium cards below." *Test:* a claimed dense venue shows a non-zero count and a plausible rank; an unclaimed venue can't load it.

**Step 5 — Billing.** *Prompt:* "Wire Stripe subscriptions to `businesses.tier` (free/pro/premium at $0/$49/$149). Gate Pro/Premium RPCs on tier." *Test:* downgrading to free re-locks the Pro cards and blocks Pro RPCs.

### 6. Privacy & trust — what a business can and cannot see

| Can see (aggregate / public) | Can **never** see |
|---|---|
| Count of distinct students who pinned it this week | Any individual student's identity in the count |
| Public boards that feature it (already shareable) | Private boards, private pins, `want_to_go` of private accounts |
| Its category rank near campus | The follow graph of any individual |
| Public impressions on its own venue | A student's other pins, DMs (none exist), or profile beyond public |

Enforcement is at the **database layer**: dashboards read only through `SECURITY DEFINER` RPCs that (1) check a verified claim and (2) emit counts/public rows only — never raw consumer tables. This mirrors the consumer app's own RLS posture (private pins are already hidden from other users). *"Businesses see the crowd, never the person"* is a trust promise Filo can market to students.

### Phase-3 preview — the AI action agent

Once Discovery Analytics (v2), Superfans + Drift (Pro), and Offers (Premium) exist, the data supports **one AI-suggested action per week** per venue — "post your lavender latte, it's your most-pinned item among first-years" or "your Tuesdays are cold; offer a student happy-hour." It requires the earlier lenses as inputs and turns Filo from a dashboard a busy owner forgets to open into a weekly nudge that does the interpreting for them. That is the wedge from "analytics tool" to "growth partner" — and the eventual bridge to a managed-marketing revenue line.

---

*Filo — build the consumer side, get the pins, then show businesses the thread.*
