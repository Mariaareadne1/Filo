# Filo 2.0 — Progress

Branch: `feat/filo-2.0` (from `main` @ `766dcc2`). Resume from this file and `git log` after any interruption.

## Current milestone
**M2: core map & place workflows.** M0 audit and M1 stability are committed.

## Done
- **M0 Audit:** `AUDIT.md` covers the feature table, security review, and recommendation-engine evaluation. Baseline screenshot is in `docs/screenshots/before/`.
- **M1 Stability**
  - Expo SDK 54 dependency alignment: worklets 0.5.1, gesture-handler 2.28, expo-location 19, jest-expo 54, eslint-config-expo 10, and others.
  - Splash deadlock fixed (`app/_layout.tsx`). App launches to auth in the simulator.
  - Fresh-database replay: added an idempotent baseline migration (`20260101000000_baseline.sql`) and made phase-2 policies re-runnable.
  - `20261026000000_filo2_integrity.sql` closes the security gaps and functional bugs listed in AUDIT.md: campus gate, column privacy, follow self-approval, rankings privacy, `save_pin`, unified categories, API key stripping, shared boards, feed crash, atomic rank/board ops.
  - `npm run test:db` replays all migrations on a throwaway Supabase Postgres, re-applies them (idempotency check), and runs the authorization suite (57 assertions) plus a legacy-data upgrade test.
- New deps: expo-glass-effect, expo-blur, expo-haptics, expo-symbols, @tanstack/react-query, @testing-library/react-native.

## Tests (latest run)
| Suite | Result |
|---|---|
| `npm run typecheck` | see latest commit message |
| `npm test` | 26/26 (baseline) |
| `npm run test:db` | ✅ all migrations, idempotent re-apply, 10_authorization (57), 30_legacy_upgrade |
| iOS simulator build (Debug, iPhone 17 Pro / iOS 26.5) | ✅ builds and launches to auth |

## Known blockers
- **Auth-gated runtime testing.** The app's `.env.local` points at the production Supabase project, and sign-in needs an OTP to a campus inbox. Docker image pulls stall on this machine, so `supabase start` (with local GoTrue/Inbucket) can't run. DB behavior is instead verified on the Supabase Postgres image directly.
- **Production migration not applied.** `20261026000000_filo2_integrity.sql` has to be pushed by the owner (`supabase db push`). It was not run against production from here.
- **Mapbox `sk.` token** in git history must be rotated by the account owner.

## Next
1. M2: React Query data layer; save flow on `save_pin`; place sheet; clustered native map; edit/delete pin; directions.
2. M3: rankings drag/remove; boards rename/delete/reorder/share; follow requests UI.
3. M4–M5: glass design system (foundation in `design/`), full redesign.
4. M6: hybrid search in Supabase (pgvector + FTS) and grounded lenses.

## Pushes
| Repo | Branch | Commit | Verified |
|---|---|---|---|
| Filo | feat/filo-2.0 | (pending) | — |
