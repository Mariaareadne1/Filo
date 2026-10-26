# Filo 2.0 — Source Audit

*Audited 2026-10-26 on `main` @ `766dcc2` (Filo) and `main` @ `15dec1a` (filo-recommendation-engine).*
*Evidence key: **R** = reproduced at runtime (simulator, or migrations replayed on a real Postgres via `npm run test:db`); **C** = confirmed by reading code (deterministic, not executed); **S** = suspected, not verified.*

## Environment & baseline

| Check | Result |
|---|---|
| `npm run typecheck` | ✅ clean |
| `npm run lint` | ✅ 0 errors, 9 warnings (exhaustive-deps, unused var) |
| `npm test` (Jest) | ✅ 26/26: only the three pure algorithm modules (`rankInsert`, `streak`, `tasteMatch`) |
| `expo install --check` | ❌ 12 packages off-SDK. Worst: `react-native-worklets 0.8.3` (SDK 54 needs 0.5.1, native/JS mismatch with Reanimated 4.1), `expo-location 55.x` (an SDK-55 module on SDK 54), `react-native-gesture-handler 2.31`, `jest-expo 57`, `eslint-config-expo 57`. |
| iOS simulator (iPhone 17 Pro, iOS 26.5, existing July build) | ❌ **R** App never left the splash screen (see A1). |
| DB migrations replay on a fresh database | ❌ **R** Impossible. The chain assumed `schema.sql` had been applied by hand, and `20260813010000` was not re-runnable. |
| Tests for SQL / RLS / RPCs | ❌ None existed. |
| Native glass / blur / haptics deps | none installed |

Baseline screenshot: `docs/screenshots/before/01-auth-email.png`. It was only reachable after fixing A1. Every authenticated screen needs an OTP to a `@columbia.edu`/`@barnard.edu` inbox on the production project, so the "before" UI of authenticated screens could not be captured.

## Feature table

| Feature | Actual implementation | Status | Evidence | Severity | Fix |
|---|---|---|---|---|---|
| **A1 App launch** | `SplashScreen.hideAsync()` only ran from the root view's `onLayout`, which fires once, before the encrypted session read resolves | **Broken** | **R** Stuck on the splash indefinitely | Critical | Hide from an effect keyed on fonts + session; catch `getSession` rejection |
| A2 Dependency health | 12 packages off the Expo SDK 54 manifest | **Broken** | **R** After fixing A1: `Exception in HostFunction` from Reanimated on the first import of `react-native-draggable-flatlist` | Critical | Pinned to SDK-54 versions, native rebuild |
| Email OTP sign-in | `auth/email` → `auth/otp` → `profile-setup` | Partially working | **C** Flow exists. Client regex plus server trigger. | — | — |
| **Campus gate** | `enforce_campus_email` checked `NEW.email`, the value the **client** writes into `users` | **Broken (security)** | **R** A Gmail-authenticated session could insert a profile claiming `x@columbia.edu`. Now covered by a failing-then-passing test. | Critical | Trigger binds to `auth.email()`. `email`/`campus`/`is_verified` are no longer client-writable. |
| **User privacy** | `users` SELECT policy `USING (true)` over the whole row | **Broken (security)** | **R** Any signed-in user could read every user's `email` and `expo_push_token` | High | Column-level grants. No client query read those columns. |
| **Private follow requests** | `follows` UPDATE policy allowed `follower_id = uid` | **Broken (security)** | **R** A requester could `UPDATE … SET status='active'` on their own pending request and bypass the private-account gate | Critical | Only the followed party may change status (trigger + policy); `respond_follow_request` RPC |
| Accept / reject requests UI | — | **Missing** | **C** No screen lists pending requests | High | New requests UI |
| **Rankings privacy** | `rankings` SELECT `USING (true)` | **Broken (privacy)** | **R** Private users' rankings were visible to strangers | High | Policy mirrors pins |
| **Saving a place** | Client upserts `places` `ON CONFLICT DO UPDATE`, then pins | **Broken** | **C** No UPDATE policy on `places`, so RLS rejects the upsert for the 2nd user who pins a venue someone already pinned. The 1st writer could also rename/move a shared venue. | Critical | `save_pin()` RPC: dedupe on `google_place_id`, first writer wins, pin upsert, validation. Direct place inserts removed. |
| **Category vocabulary** | Places use `food|bar|beauty|experience|retail`; rankings/discover use `cafes|food|bars|shops|experiences` | **Broken** | **C** "Rank it" from the map wrote `category='bar'`; the Rankings screen only queries `bars`, so the ranking is invisible. Beauty has no ranking list. | High | One vocabulary, `cafe|food|bar|beauty|experience|retail`, CHECKed on both tables. Legacy rows merged (tested). |
| Ranking insertion (compare flow) | Binary search, `rerank_place` RPC | Partially working | **C** Re-ranking an already-ranked place compares it against itself. The RPC accepted any place, even one never pinned. | Medium | Exclude self from the pool; RPC requires a pin |
| **Drag-to-reorder rankings** | README advertises it | **Missing** | **C** `rankings.tsx` is a plain `FlatList`, with no reorder and no remove | High | Build it |
| Remove ranked place | — | **Missing** | **C** | Medium | `remove_ranking` RPC + UI |
| **Friends map / activity feed** | `get_friends_feed` (plpgsql, `RETURNS TABLE(... status ...)`) | **Broken** | **R** Raises `column reference "status" is ambiguous` on every call since `20260723000000`, so the friends map mode and the feed both error | Critical | Qualified columns; keyset cursor; bounded page |
| Map rendering | One `MarkerView` (React view) per pin | Partially working | **C** No clustering. Pins sharing a venue stack exactly on top of each other. All markers are React views, so it gets heavy past ~100 pins. | Medium | Native `ShapeSource` clustering + data-driven layers |
| Map "search" field | Filters loaded pins by name substring | Partially working | **C** Doesn't search real places | Low | Glass search capsule → real place search |
| Location permission | Requested on mount, no denied UX | Partially working | **C** | Low | Contextual request + recenter control |
| Place search (Google) | Autocomplete plus **details for the top 5 predictions on every debounced keystroke** | Working but costly | **C** 6 billed calls per keystroke, no session token, no stale-response guard | Medium | Autocomplete only; details on select; session tokens; abort stale requests |
| **Google API key in DB** | `photo_url` stored with `&key=…` | **Broken (security)** | **C** The key was persisted in `places` and readable by every user, outliving any key rotation | High | Stripped by migration, CHECK prevents re-insert, key appended at render time |
| Star rating on confirm | 5-star picker | **Fake control** | **C** Never saved anywhere, and contradicts "no star ratings" | Medium | Removed |
| Photo upload | Background queue → Storage → `pins.photo_url` | Working (as coded) | **C** Not exercised end to end (needs auth) | — | Keep; wire into the new save flow |
| Pin edit / delete | — | **Missing** | **C** No way to edit an impression or delete a pin. Deleting would also have left orphan rankings. | High | Edit/delete UI; trigger cleans rankings |
| Directions | — | **Missing** | **C** | Medium | Apple/Google Maps deep link |
| Boards: create/add | Modal + sheet | Partially working | **C** `share_token` from `Math.random()` (predictable); add-to-board does a count-then-insert race for position | Medium | Server CSPRNG token, `add_pin_to_board` RPC |
| Boards: rename/delete/reorder | Long-press drag exists in board view; rename/delete absent | Partially working | **C** Reorder persists with N updates (non-atomic) | Medium | `reorder_board` RPC, rename/delete UI |
| **Shared board link** `/b/<token>` | Next.js page queries tables with the anon key | **Broken** | **C** Every board/pin policy is `TO authenticated`, so anon reads return nothing and every shared link renders not-found | High | `get_shared_board()` SECURITY DEFINER for anon. Public-only, never emails, excludes private authors (tested). |
| Board covers | README: "collage of first four pin photos" | Partially working | **C** | Low | Cover composition in redesign |
| **Discovery lenses** | 5 cards with counts from `get_discover_counts` | **Broken (dead controls)** | **C** Every card `router.push('/(app)', {discover})`, which redirects back to Discover, so no lens ever shows results. README lists 6 lenses; 5 exist. | High | Real lens result lists (Milestone 6) |
| Taste twins | Spearman over overlap ≥ 3 | Partially working | **C** `indexOf`-based re-ranking mishandles ties; n=3 overlap gives an overconfident 100% | Medium | Average-rank ties + confidence shrinkage |
| Push notifications | `notify_new_follow` via pg_net | Partially working | **C** Could be invoked for any target with no follow edge | Low | Requires the edge; request vs follow copy |
| Session persistence | AES-CTR key in Keychain, ciphertext in AsyncStorage | Working | **C** Reasonable. CTR without a MAC is malleable but needs local device access. | Low | Keep |
| Deep links | `filo://` scheme; web `/b/<token>` | Partially working | **C** No universal links / associated domains; app can't open board links | Medium | `filo://board/<id>` handling + shared web page |
| Analytics | `lib/posthog.ts` constants only | Missing | **C** No provider mounted despite the comment | Low | Leave off (no consent flow) |
| Web business dashboard | Next.js `web/` (phase 2) | Not yet tested | — | — | Out of scope for the mobile revival |

## Security

| Item | Finding |
|---|---|
| **Mapbox `sk.` token** | **C** Present in git history (`app.json` in 3 historical commits, value not reproduced here). Current code injects it from env via `app.config.js` and it is not in tracked files. **Owner action required:** rotate the token in the Mapbox account. History was *not* rewritten (needs authorization, and the token must be rotated anyway). |
| Service-role key | **C** Only in `.env.local` (gitignored) and `scripts/seed-mock-data.ts` reads it from env. Not referenced by app code. ✅ |
| Supabase anon key / Mapbox `pk.` / Google key in bundle | Public by design. Google key **must** be app-restricted (owner action). |
| RLS coverage | All tables have RLS. Gaps above (users columns, follows UPDATE, rankings, places upsert) are fixed and covered by `supabase/tests/10_authorization.sql` (57 assertions, incl. negative cases). |
| Storage | `pin-photos` and `avatars` are public buckets with owner-folder writes. Photos of a private account are reachable by anyone holding the URL. **Accepted limitation**, documented (signed URLs would be the fix). |
| Location privacy | Device location is never uploaded (used for camera centering only). ✅ |
| Secrets in logs | Confirm screen alerted raw Postgres error details (`code/details/hint`) to users. Replaced with user-safe messages. |

## Recommendation engine (`filo-recommendation-engine`)

| Question | Finding (evidence: `data/process.py`, `train/*.py`, `api/main.py`, plus an independent re-evaluation) |
|---|---|
| Venue data | **100% synthetic**: 500 venues `syn_0000…0499`, ~5 template names per category, some borrowed from real NYC businesses, coordinates jittered around neighborhood centroids. The Foursquare path, if used, would conflict with its caching terms. |
| IDs ↔ Filo | Not mappable to `google_place_id`. The engine's 12 categories don't match Filo's (no beauty/experience/retail). |
| Training/eval | 50 hand-written queries; relevance = category label. **Validation queries are a subset of training queries** (`finetune.py:182` vs `:185`), so the reported MRR@5 = 1.0 is leaked. Base MiniLM and even BM25 also score 1.0 on that split. |
| Real lift | On 20 fresh paraphrases: fine-tuned MRR@5 0.82 vs base 0.79 vs BM25 0.66. Within noise on synthetic text. |
| API | `POST /recommend`. No auth, no rate limit, no query length cap. CORS localhost only. p50 9.6 ms CPU. |
| Integration | None. Nothing in the app calls it. |
| Decision | Do **not** run it as separate infrastructure. Filo 2.0 implements grounded hybrid retrieval in Supabase over *real* `places` rows. Reused: the description-building idea and the MRR/P@K evaluation method. See `docs/RECOMMENDATIONS.md`. |
