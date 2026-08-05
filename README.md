# Filo

**The map your friends would draw.**

Filo is a social discovery app for cities. Instead of searching Yelp or scrolling TikTok, you open Filo and see a map of everywhere your friends have actually been — their pins, their impressions, their ranked favorites. Discovery through people you trust, not algorithms you don't.

---

## What Filo Is

Filo is built around a single idea: the best way to find a place is through someone you know. The name comes from the Italian/Greek word for thread — the red thread of fate (運命の赤い糸) — which connects people to the places and people they are meant to find. Every pin is a thread. Every friend's map is a web of threads you can follow.

The product launches at Columbia University, invite-only, with email verification (@columbia.edu / @barnard.edu) required. The constraint is the moat: every user is a real verified student, every place is somewhere a real person has been, and the graph is small enough to feel personal.

---

## Core Features

### The City Map
The central screen. A live map of New York City showing pins from you and your friends. Toggle between your own map and your friends' combined map. Tap any pin to see who saved it, what they thought, and how they ranked it. Filter by category, friend, or neighborhood.

### Pins
A pin is a place you've visited or want to go. Each pin has a category, a status (visited / want to go), an optional photo, and an optional short impression. No star ratings. No 0–10 scores. Just signal.

### Rankings
For places you've visited, you can rank them within a category — a living, drag-reorderable list. Rankings are the core of the taste graph. They power the Twins feature and fuel the discovery engine over time.

### Boards
Named collections of pins. "Morningside Essentials." "Late Night Eats." "Ideal Date Spots." Shareable via link (`filo.app/b/<token>`) — from a dating profile, in a text, in a social bio. The cover is a collage of the first four pin photos.

### Discover
Six named discovery lenses:
1. **Trending near you** — what's being pinned most this week
2. **New to your network** — places pinned by friends you haven't saved yet
3. **Friends disagree on** — places where your friends' rankings diverge most
4. **Hidden gems** — high-ranked by friends, rarely pinned by others
5. **Most pinned in [category]** — the consensus favorites
6. **Saved by people like you** — taste-match recommendations

### Taste Twins
You are someone's twin in a category if your ranked overlap is ≥3 places and your Spearman correlation on those overlapping ranks is ≥0.6. The Twins screen shows your top match per category — who you are most aligned with and where you diverge.

### Feed
A chronological activity feed of what your network is pinning and saving. No infinite scroll — it stops.

---

## Design System

Filo uses a tight, opinionated design system built around three core ideas:

**The thread.** Red (`#d8423a`) is the only accent color. It appears on the FAB, active rankings, save confirmations, and brand display text — and nowhere else. One accent, used with precision.

**Sticker shadow.** Every card has a hard offset shadow (2px Y, 0 blur, ink at 100%). No soft drop shadows, no elevation blur. Cards look like they're physically stuck to the surface.

**Italic accent word.** Display titles use Fraunces serif with one italicized word in red: "different *tastes*, same map." This is the brand voice signature — it appears on every major screen.

**Type stack:**
- `Fraunces` — display titles, place names
- `Inter` — UI, body, buttons
- `DM Mono` — labels, counts, addresses, ranks

**Palettes:** Paper (default), Concrete, Midnight, Sky. All four are supported; Paper ships.

---

## Architecture

The mobile app is **React Native + Expo** (Expo Router, file-based), iOS-first, on **Supabase** (Postgres + RLS + Storage + RPCs) with **Mapbox** for maps. State is fetched per-screen through feature hooks; the taste-graph math is pure and unit-tested.

**Stack:** React Native · Expo (Router, SDK 54) · Supabase · Mapbox (`@rnmapbox/maps`) · expo-image · PostHog · Jest.

**Layout:**
| Path | Role |
|---|---|
| `app/` | Screens + routing (`auth/`, `onboarding/`, `(app)/`, `pin/`, `board-modal/`) |
| `app/_layout.tsx` | Session/onboarding auth gate |
| `hooks/` | `usePins`, `useBoards`, `useFollow`, `useCurrentUserId` |
| `lib/` | `supabase`, `secureStore` (encrypted session), `places`, `params`, and the tested algorithm modules `tasteMatch` / `rankInsert` / `streak` |
| `contexts/` | `UploadContext` (background photo queue), `onboarding` |
| `constants/theme.ts` | The design system (palettes, type, sticker shadows) |
| `supabase/migrations/` | Schema deltas — **apply in order** |
| `schema.sql` | Original v1.0 baseline (superseded by migrations) |

**Core data model** (`schema.sql` + migrations):
- `users` — profiles, handles, `is_private`, campus
- `places` — deduped venues (Google Places–backed), category, geo
- `pins` — the atomic unit; (user, place), status, photo, impression
- `rankings` — ordered lists per (user, category); re-ranked atomically via the `rerank_place` RPC
- `boards` / `board_pins` — named, shareable, drag-reorderable collections
- `follows` — the social graph (active / pending for private accounts)
- `auth_allowed_domains` — the campus-email allowlist

**Server-side logic (RPCs):** `get_friends_feed` (bounded friend feed), `get_discover_counts` (all six discovery lenses in one round trip), `rerank_place` (atomic ranking insertion), `notify_new_follow` (push). All identity-bound to `auth.uid()`.

---

## Getting Started

```bash
npm install
cp .env.example .env.local     # then fill in the values (see below)
npm start                      # Expo dev server
```

**Environment** — copy `.env.example` to `.env.local` and set:
- `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` — public, RLS-protected
- `EXPO_PUBLIC_MAPBOX_TOKEN` — Mapbox public (`pk.`) token
- `EXPO_PUBLIC_GOOGLE_PLACES_KEY` — **must** be restricted to the app bundle id + Places API in Google Cloud
- `RNMAPBOX_MAPS_DOWNLOAD_TOKEN` — Mapbox `sk.` build secret (injected via `app.config.js`; an EAS secret in CI)
- `SUPABASE_SERVICE_ROLE_KEY` — server/seed scripts only, never shipped

`.env.local` is gitignored — never commit real values.

**Database** — apply the SQL migrations to your Supabase project in filename order:
```bash
supabase db push          # or run supabase/migrations/*.sql in order
```

**Scripts:**
| Command | What |
|---|---|
| `npm start` | Expo dev server |
| `npm run ios` / `android` | Native builds |
| `npm run typecheck` | `tsc --noEmit` (RN app only) |
| `npm run lint` | ESLint (react-hooks rules enforced) |
| `npm test` | Jest — algorithm unit tests |

---

## Security

The invite-only model is enforced **server-side**, not just in the UI:

- **Campus gate** — signup is restricted to domains in the `auth_allowed_domains` table (seeded `columbia.edu` / `barnard.edu`) by a trigger on `users`. Add a domain with one `INSERT` to allow demo accounts.
- **Row-Level Security** on every table. `is_private` actually hides pins; private-account follows land as `pending` (status is forced by a trigger, never trusted from the client); board pins can only reference your own or public pins.
- **Identity-bound RPCs** — every `SECURITY DEFINER` function checks `auth.uid()` and pins its `search_path`.
- **Encrypted session** — auth tokens are persisted with an AES key in the device Keychain/Keystore (`lib/secureStore.ts`), not plain `AsyncStorage`.
- **Secrets** — no secrets in tracked source; the Mapbox `sk.` token is injected from the environment via `app.config.js`.

> ⚠️ A Mapbox `sk.` download token was previously committed to `app.json` and remains in git history — **rotate it** in the Mapbox account.


---

## Target Categories

Filo is for businesses where word-of-mouth is already the primary growth engine:

| Category | Examples |
|---|---|
| Food & Drink | Restaurants, cafes, coffee shops, bakeries |
| Bars & Nightlife | Bars, cocktail lounges, rooftops, clubs |
| Beauty & Grooming | Hair salons, nail studios, barbershops, lash bars |
| Experiences | Yoga studios, climbing gyms, pottery classes |
| Taste Retail | Vintage stores, bookshops, boutiques, record stores |

Not included: doctor, vet, lawyer, pharmacy, dry cleaner. Nobody pins these.

---

## Anti-Patterns

Things Filo will never do:

- ❌ Public star ratings or 0–10 scores
- ❌ Sponsored or algorithmic content in the feed
- ❌ Infinite scroll
- ❌ Emoji in core UI (allowed in user-generated content only)
- ❌ Gradient backgrounds
- ❌ Beige/cream backgrounds (we tried; rejected)
- ❌ More than 4 cards visible without scroll

---

## Business Model (Phase 2)

Businesses will have a dashboard showing: who discovered them this week, where discovery came from, who their word-of-mouth superfans are, and which regulars are drifting. One AI-suggested action per week — no marketing knowledge required. Verified check-ins (location ping or receipt scan) keep signal quality high.

---

## Status

**Current:** Consumer MVP, prototype complete, React Native mobile build in progress.
**Next:** Columbia campus launch, invite-only, targeting 200 active users + 500 pins in 30 days.

---

*Filo — the thread connects everything: your people, your places, your city. The more you use it, the harder it is to leave.*
