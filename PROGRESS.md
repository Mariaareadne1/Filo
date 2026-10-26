# Filo 2.0 — Progress

Branch: `feat/filo-2.0` (from `main` @ `766dcc2`). Companion engine: `fix/eval-leakage` in `filo-recommendation-engine` (from `origin/main` @ `1829c89`).
If interrupted, resume from this file and `git log main..feat/filo-2.0`.

## Status: M0–M8 complete on the branch. Not merged, not deployed.

| Milestone | Commit | What landed |
|---|---|---|
| M0 Audit + M1 Stability | `8d29efd` | `AUDIT.md`. Splash deadlock fixed. SDK-54 dependency alignment. Idempotent baseline migration. `20261026000000_filo2_integrity.sql` (campus gate, column privacy, follow self-approval, rankings privacy, `save_pin`, unified categories, API-key stripping, shared boards, feed crash, atomic rank/board RPCs). `npm run test:db`. |
| M2 Core map & places | `2024317` | React Query data layer. Native clustered map with a selected marker. Glass search capsule, scope and category controls. Real place search (Mapbox Search Box primary, Google fallback). Save → rank flow on `save_pin`. Detached glass place sheet. Pin edit/delete. Directions. Local Supabase stack (`npm run stack:up`). |
| M3 Rankings, boards, social | `fb39879` | Drag reorder and remove for rankings. Boards create/rename/delete/reorder/cover/share. Working `/b/<token>` web page via `get_shared_board`. Profiles, follow lists, follow-request accept/decline, feed (bounded, keyset), Taste Twins with tie-correct Spearman and shrinkage. |
| M6 Discovery | `1a11d16` | `search_places` (FTS + trigram + structured filters + distance) and `discover_lens` (5 SQL lenses), plus a taste-based "people like you" lens. Grounded natural-language parser with honest notes. Eval vs keyword baseline (`docs/RECOMMENDATIONS.md`). |
| M4–M5 Glass design system + redesign | `a4c7512` | `design/` tokens, theme, three-tier `Glass`, controls, dock. Auth, onboarding, year recap, twins, status scrims, dark mode (map style keyed by scheme), Reduce Transparency and Reduce Motion. |
| M7 Hardening | `18d547d` (+ docs commit) | Photo uploads fixed (0-byte objects). Picker needs no photo-library permission. Sheet respects the safe area. Repeat deep links reopen the sheet. Lint clean. |
| M8 Docs | docs commit | `docs/GLASS.md`, `CASE_STUDY.md`, README and AUDIT resolution, this file. Companion repo leakage fix. |

## Verification (latest run, 2026-10-26)

| Check | Result |
|---|---|
| `npm run typecheck` | ✅ clean |
| `npm run lint` | ✅ 0 errors, 0 warnings |
| `npm test` (Jest) | ✅ 65/65 across 7 suites: mapModel, parseQuery + email normalization, tasteMatch, explain, yearStats, rankInsert, streak |
| `npm run test:db` | ✅ every migration replayed on a fresh Postgres, re-applied for idempotency, then 72 assertions: `10_authorization`, `20_discovery`, `30_legacy_upgrade` |
| iOS simulator, iPhone 17 Pro / iOS 26.5, Debug, local stack | ✅ end to end. OTP sign-in → profile → onboarding (real Mapbox venues) → clustered map → place sheet → want/been → rank flow → boards → profile → Discover search and lenses → sign-out and sign-in. Deep link `filo://map?place=`. Photo upload (bytes verified in Storage, served 200). Dark mode. Reduce Transparency. |
| iOS production JS export | ✅ Hermes bundle. Server secrets absent from a `--no-bytecode` build; only public keys present. |
| Android | ⚠️ JS bundle exports (6.37 MB Hermes). **Not run on a device or emulator**: there's no Android SDK, emulator or JDK on this machine. |
| E2E (Maestro/Detox) | ⚠️ Not installed. Critical flows were exercised by hand in the simulator (above), not by an automated suite. |
| Web share page (`web/`) | ✅ `/b/<token>` renders a public board through `get_shared_board` against the local stack. |
| Companion engine | ✅ Retrained with held-out queries. MRR@5 is 1.0 for both base and fine-tuned, i.e. saturated on synthetic data (documented). |

Screenshots: `docs/screenshots/before/` (auth only; authenticated "before" screens were unreachable) and `docs/screenshots/after/00–13`.

## Blockers (need the owner)

1. **Production Supabase project doesn't resolve** (NXDOMAIN for the URL in `.env.local`). It's probably paused or deleted. Nothing could be verified against production.
2. **Apply migrations to production** once it's back: `supabase db push`. Not run from here. Order: `20260101000000_baseline` … `20261026010000_discovery`.
3. **Hosted OTP email template** must include `{{ .Token }}`. The app enters a 6-digit code, and the default magic-link template doesn't show one.
4. **Rotate the Mapbox `sk.` token.** It's in git history (`app.json`, 3 commits). History was not rewritten.
5. **Google Places key**: the project has no billing, so the Google fallback returns errors. Mapbox is the primary provider and works. If the key is kept, restrict it to the bundle id and the Places API.
6. **Android + E2E**: install the Android SDK/emulator and Maestro to cover these. See README → Testing.

## Pushes

| Repo | Branch | Head | Verified on remote |
|---|---|---|---|
| Mariaareadne1/Filo | `feat/filo-2.0` | see `git log -1 feat/filo-2.0` (docs commit follows `18d547d`) | `git ls-remote origin feat/filo-2.0` |
| Mariaareadne1/filo-recommendation-engine | `fix/eval-leakage` | `09e9ed8` | ✅ `git ls-remote` matched |

Nothing was force-pushed. `main` was not touched in either repo. The local `filo-recommendation-engine` checkout (on `main`, behind by 1, uncommitted `.gitignore` edit) was left as is; the fix was made in a separate worktree.
