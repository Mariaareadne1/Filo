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
The central screen. A live map of New York City showing pins from you and your friends. Switch between Everyone, Mine and Friends, and filter by category. Pins cluster as you zoom out. Tap a place to see who saved it, what they thought and how they ranked it.

### Pins
A pin is a place you've visited or want to go. Each pin has a category, a status (visited / want to go), an optional photo, and an optional short impression. No star ratings. No 0–10 scores. Just signal.

### Rankings
For places you've visited, you can rank them within a category — a living, drag-reorderable list. Rankings are the core of the taste graph. They power the Twins feature and fuel the discovery engine over time.

### Boards
Named collections of pins. "Morningside Essentials." "Late Night Eats." "Ideal Date Spots." Shareable via link (`filo.app/b/<token>`) — from a dating profile, in a text, in a social bio. The cover is a collage of the first four pin photos.

### Discover
Six lenses, each computed in Postgres from real pins and rankings, and each hidden when there isn't enough data to say anything:
1. **New to your network** — places friends saved in the last 30 days that you haven't
2. **Saved by people like you** — favorites of people whose rankings correlate with yours
3. **Hidden gems** — a friend's top-third pick that few people have pinned
4. **Friends disagree** — places your friends rank very differently
5. **Trending near campus** — most distinct pinners nearby in the last 14 days
6. **Most pinned** — the consensus favorites, by category

Plus natural-language search ("quiet cafes to work in the afternoon", "vintage shops around the Lower East Side"). It's parsed into filters Filo actually stores (category, tags, neighborhood, radius, friends-only) and says plainly what it can't know, such as noise level, hours or prices. Every result carries a one-line reason built from real signals. See [`docs/RECOMMENDATIONS.md`](docs/RECOMMENDATIONS.md).

### Taste Twins
Taste match compares how two people rank the places they've both ranked: a tie-aware Spearman correlation, shrunk toward zero when the overlap is small (`rho · n/(n+5)`). It needs at least 3 shared places. A match is **strong** at ρ ≥ 0.6 over ≥ 5 places, and **promising** at ρ ≥ 0.4. With less overlap it says it's too early rather than inventing a percentage.

### Feed
A chronological activity feed of what your network is pinning and saving. It loads in pages until you're caught up, then it stops.

---

## Design System

Filo 2.0 is map-first. The map is the canvas, and the controls float above it in a glass material.

**The thread.** Red (`#D8423A`, `#E5554C` in dark mode) is the only accent: the add button, selected states, rank positions, the italic accent word. One accent, used with precision.

**Glass, honestly.** Floating chrome (dock, search capsule, chips, segmented control, icon buttons, place sheet, toasts) uses native iOS 26 Liquid Glass via `expo-glass-effect`. On older iOS and Android it falls back to a real blur, and with Reduce Transparency it becomes a solid surface. Content (lists, forms, rankings) is never on glass. See [`docs/GLASS.md`](docs/GLASS.md).

**Italic accent word.** Display titles use Fraunces with one italic word in the thread color: "Make it *yours*." "Check your *inbox*."

**Type stack:**
- `Fraunces` — display titles, place names
- `Inter` — UI, body, buttons
- `DM Mono` — labels, counts, ranks

**Light and dark** follow the system; the map switches to Mapbox's dark style. **Reduce Motion** swaps springs for short fades. Minimum hit targets are 44 pt, every icon button has an accessibility label, and selected states never rely on color alone.

---

## Architecture

**Stack:** Expo SDK 54 · React Native 0.81 (New Architecture) · Expo Router 6 · TanStack Query 5 · Reanimated 4 · @gorhom/bottom-sheet 5 · `@rnmapbox/maps` 10 · expo-glass-effect · Supabase (Postgres + RLS + Storage + GoTrue) · Mapbox Search Box · zod · Jest.

| Path | Role |
|---|---|
| `app/` | Routes only, as thin re-exports (`auth/`, `onboarding/`, `(app)/` tabs, `pin/`, `board-modal/`) |
| `app/_layout.tsx` | Providers and the root gate (session → profile → onboarding → app) |
| `features/` | Screens by domain: `map`, `places`, `search`, `rankings`, `boards`, `profile`, `social`, `discover`, `onboarding`, `auth` |
| `design/` | Tokens, theme (light/dark, accessibility settings), `Glass`, controls, dock |
| `lib/api/` | Supabase calls per domain; `lib/hooks.ts` wraps them in React Query |
| `lib/search/` | Place search: Mapbox Search Box (primary), Google Places (fallback) |
| `lib/discovery/` | Natural-language parser and result explanations (pure, unit-tested) |
| `lib/` | Session, errors, categories, validation, taste-match math, year stats, secure session storage |
| `supabase/migrations/` | Full schema from a fresh database, in filename order (idempotent) |
| `supabase/tests/` | SQL tests: authorization, discovery, legacy-data upgrade |
| `scripts/local-stack/` | Local Supabase-compatible stack for simulator testing |
| `web/` | Next.js: the public shared-board page `/b/<token>` |

**Data model:** `users` (profile, handle, `is_private`), `places` (deduped venues, category, tags, neighborhood, geo, generated search document), `pins` (user × place: status, impression, photo), `rankings` (ordered per user × category), `boards` / `board_pins`, `follows` (active / pending), `auth_allowed_domains`.

**Server-side logic (RPCs):** `save_pin`, `rerank_place`, `remove_ranking`, `add_pin_to_board`, `reorder_board`, `get_shared_board` (anon), `get_friends_feed`, `respond_follow_request`, `search_places`, `discover_lens`. Each one is bound to `auth.uid()` with a pinned `search_path`.

---

## Getting Started

```bash
npm install
cp .env.example .env.local     # fill in the values below
npm run ios                    # native dev build (Xcode 26 for native glass)
```

**Environment** (`.env.local`, gitignored):

| Variable | Where it's used | Secret? |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` | App | Public (RLS-protected) |
| `EXPO_PUBLIC_MAPBOX_TOKEN` | App: map + place search (`pk.` token) | Public; scope it to the needed APIs |
| `EXPO_PUBLIC_GOOGLE_PLACES_KEY` | App: optional search fallback | Public; **must** be restricted to the bundle id + Places API |
| `RNMAPBOX_MAPS_DOWNLOAD_TOKEN` | Native build only (`sk.`), injected by `app.config.js` | **Secret** (EAS secret in CI) |
| `SUPABASE_SERVICE_ROLE_KEY` | Seed scripts only | **Secret**, never shipped |
| `EXPO_PUBLIC_SUPABASE_URL_OVERRIDE`, `…_ANON_KEY_OVERRIDE` | Set only by `npm run start:local` | Local dev JWTs |

**Database:** apply `supabase/migrations/*.sql` in filename order (`supabase db push`). The hosted "Magic Link" and "Confirm signup" email templates must include `{{ .Token }}`, because the app signs in with a 6-digit code.

**Local stack (no production access needed):**
```bash
npm run stack:up                   # Postgres, GoTrue, PostgREST, Storage, Mailpit + migrations + seed
node scripts/local-stack/gateway.mjs
npm run start:local                # Metro pointed at http://127.0.0.1:55321
```
Sign in as `you@filo.test`; codes arrive in Mailpit at http://127.0.0.1:55025. `filo.test` is allow-listed only locally. See [`scripts/local-stack/README.md`](scripts/local-stack/README.md).

**Scripts:**
| Command | What |
|---|---|
| `npm run ios` / `android` | Native dev builds |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (react-hooks enforced) |
| `npm test` | Jest: map model, query parser, taste match, explanations, year stats, rank insertion, streaks |
| `npm run test:db` | Replays every migration on a fresh Postgres twice (idempotency), then runs `supabase/tests/*.sql` |
| `node --experimental-strip-types scripts/eval/discovery-eval.mts` | Discovery eval vs keyword baseline (needs the local stack) |

**Testing status:** iOS was verified end to end in the simulator (iPhone 17 Pro, iOS 26.5). Android is untested on a device: the JS bundle builds, but no emulator was available. There is no automated E2E suite yet. Maestro flows for sign-in → save → rank are the next step.

---

## Security

The invite-only model and privacy are enforced **server-side**:

- **Campus gate:** a trigger checks the *authenticated* email (`auth.email()`) against `auth_allowed_domains`. `email`, `campus` and `is_verified` aren't client-writable.
- **Row-Level Security** on every table, plus column-level grants: other users can't read your email or push token. Private accounts' pins and rankings are hidden from non-followers. Only the followed person can accept a follow request.
- **Writes go through validated RPCs** (`save_pin`, `rerank_place`, `reorder_board`, …), so the client can't rename shared venues or write rankings for places it never pinned.
- **Shared boards** are served to anonymous visitors only through `get_shared_board()`, which returns public boards with no emails and nothing from private accounts.
- **Encrypted session:** auth tokens are stored with an AES key in the Keychain/Keystore (`lib/secureStore.ts`).
- **Secrets:** no provider secret ships in the app. Only public keys are in the bundle (checked on a non-bytecode export). Google keys are stripped from stored photo URLs, and a CHECK constraint blocks them.
- **Tests:** `supabase/tests/10_authorization.sql` covers the above, including negative cases.

> ⚠️ A Mapbox `sk.` download token was previously committed to `app.json` and remains in git history. **Rotate it** in the Mapbox account.

Known limitation: the `pin-photos` and `avatars` buckets are public-read, so a private account's photo is reachable by anyone who has its URL. Signed URLs would close this.

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

## Status

**Filo 2.0** is on branch `feat/filo-2.0`: revived, redesigned, verified on iOS against a local stack. See [`PROGRESS.md`](PROGRESS.md) for test results and open owner actions (production project unreachable, migrations to apply, token rotation), [`AUDIT.md`](AUDIT.md) for what was broken and how it was fixed, and [`CASE_STUDY.md`](CASE_STUDY.md) for the story.

**Next:** Android device pass, Maestro E2E, universal links, Columbia campus launch.

---

*Filo — the thread connects everything: your people, your places, your city.*
