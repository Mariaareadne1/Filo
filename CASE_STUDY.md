# Filo 2.0 — Case Study

*Reviving a social map app: making it work, making it native, and making its recommendations honest.*

## The starting point

Filo is a map of the places your friends have actually been, with rankings in place of star ratings. It was built for a Columbia/Barnard launch. By October 2026 it looked complete in the README but didn't work:

- **It didn't launch.** The splash screen waited on a layout event that fired before the encrypted session finished loading, so it never hid. Behind that, 12 packages had drifted off the Expo SDK 54 manifest, and Reanimated crashed on its first import.
- **Its core action failed.** Saving a place upserted into a shared `places` table that had no UPDATE policy. The second person to pin a venue was rejected by RLS. The first person could rename or move it for everyone.
- **Its privacy model had holes.** The campus gate checked an email the *client* supplied. Any signed-in user could read every other user's email and push token. A requester could approve their own follow request to a private account. Rankings ignored privacy entirely.
- **Several features were dead.** The friends map and feed raised `column reference "status" is ambiguous` on every call. Every shared-board link rendered "not found", because anonymous visitors could read nothing. All five discovery cards routed back to themselves.
- **Two category vocabularies** (`bar` vs `bars`) meant a ranking saved from the map was invisible on the Rankings screen.
- **The companion "AI recommendation engine"** reported MRR@5 = 1.0, but its validation queries were a subset of its training queries and its 500 venues were synthetic.

None of this was visible from the code's structure. It took running the app, replaying the migrations on a real Postgres, and reading every policy. Each item in [`AUDIT.md`](AUDIT.md) is marked as reproduced, confirmed in code, or suspected.

## Approach

**1. Make it testable before fixing it.** The production project needed an OTP sent to a campus inbox, and the Supabase CLI's image pulls hung on this machine. So I built a small Supabase-compatible stack (Postgres, GoTrue, PostgREST, Storage, Mailpit and a gateway) from images already on disk, with `filo.test` allow-listed *only there*. I also made the migration chain replayable from an empty database. `npm run test:db` replays every migration twice to check idempotency, then runs 72 SQL assertions: authorization (including negative cases), discovery, and a legacy-data upgrade.

**2. Fix integrity on the server, not in the UI.** Writes moved behind validated RPCs (`save_pin`, `rerank_place`, `reorder_board`, `add_pin_to_board`), and column-level grants hide private fields. A follow-status trigger lets only the followed person accept, and the campus gate now uses `auth.email()`. Each fix started as a failing test. One migration unified the categories and merged legacy rows, including the collision case (`bars` + `bar` for the same user).

**3. Rebuild the client around data, not screens.** React Query hooks over a per-domain API layer replaced per-screen fetching, and screens moved into `features/` with thin routes. The map became a native clustered `ShapeSource`, with the selected place drawn from an unclustered source so it never disappears into a cluster.

## Design: native glass, honestly

The redesign is map-first: the city is the canvas, and the controls float above it. On iOS 26 those controls use real Liquid Glass (`UIGlassEffect` via `expo-glass-effect`), and the dock and its add button share a `GlassContainer`, so they blend as one material. Elsewhere they fall back to an actual blur, and with Reduce Transparency to a solid surface. I chose not to fake refraction with gradients on platforms that can't render it. Glass is limited to floating chrome; anything you read sits on a solid surface.

Identity was kept: the single red thread (`#D8423A`), Fraunces with one italic accent word, ranking-first rather than star ratings, and no invented social proof. Dark mode switches the map style too, and Reduce Motion replaces springs with short fades. The details are in [`docs/GLASS.md`](docs/GLASS.md).

## Discovery: grounded, not generated

The brief asked for natural-language discovery. The tempting answer is an LLM, or the companion embedding model. Neither fits the data Filo has:

- **What Filo knows** about a place: name, category, tags, neighborhood, location, and who pinned or ranked it.
- **What it doesn't know:** whether a place is quiet, open late or cheap.

So search parses the query into filters over stored attributes (category, tags, neighborhood radius, friends-only). It relaxes those filters step by step when nothing matches, and states its limits in the UI ("Filo doesn't know noise levels — friends' notes are the best signal"). Every result's one-line explanation comes from real signals, for example "Saved by @ada and @dee" or "Top pick on a friend's cafes list".

The six lenses (new to your network, people like you, hidden gems, friends disagree, trending near campus, most pinned) each have a minimum-evidence threshold and show nothing below it. Taste match uses tie-correct Spearman with shrinkage, so three shared places can't produce "100% match".

**Evaluation** (24 queries, 79 real NYC venues, rule-based relevance labels, through the real RLS path):

| Method | P@5 | R@10 | MRR | nDCG@10 |
|---|---|---|---|---|
| name keyword (the old map search) | 0.200 | 0.354 | 0.361 | 0.316 |
| full-text on the raw query | 0.350 | 0.715 | 0.708 | 0.705 |
| **hybrid parser + filters + relaxation** | **0.575** | **0.901** | **1.000** | **0.930** |

The caveat matters as much as the table. The labels use the same attribute vocabulary as the parser, so this shows the parser maps language onto Filo's data correctly. It says nothing about subjective quality. Real labels should come from usage ("searched X → saved Y").

**The companion engine** wasn't deployed. Its IDs can't map to real places, and its categories don't match Filo's. I fixed its evaluation leak on a branch, which splits queries before building pairs and asserts the splits are disjoint. On held-out queries, base and fine-tuned models both score MRR@5 = 1.0. That isn't a win: the metric saturates on synthetic text, and the repo's README now says so. Its description-building idea and its evaluation method were reused; the model wasn't.

## What I'd flag

- **Verified:** iOS end to end in the simulator against the local stack, SQL authorization in tests, and the web share page.
- **Not verified:**
  - Android on a device (only the JS bundle builds).
  - Anything against production, whose Supabase URL no longer resolves.
  - Automated E2E: there's no Maestro or Detox suite yet.
- **Owner actions:**
  - Rotate the Mapbox `sk.` token in git history.
  - Apply the migrations.
  - Add `{{ .Token }}` to the hosted OTP email template.
  - Restrict or remove the Google key.
- **Accepted limitation:** photo buckets are public-read. Signed URLs are the fix if private accounts' photos must stay private.

## Small things that turned out to matter

- **Uploads stored 0-byte objects.** Photo uploads "succeeded" with 0-byte files: React Native's `fetch(uri).blob()` uploads empty through supabase-js. Uploads now send bytes read with expo-file-system, and the URL is versioned so a replaced photo isn't served from cache.
- **Repeat deep links were ignored.** A deep link to the same place twice did nothing, because the route param hadn't changed. The map now consumes the param once and re-opens the sheet on every link.
- **Dev builds ignored the local env.** Expo's `.env` context overrode shell variables in dev, so the "local" app quietly talked to production. Explicit `*_OVERRIDE` variables, set only by `npm run start:local`, fixed it.
- **The photo picker asked for too much.** It requested full Photo Library access, which the system picker doesn't need, so the app no longer asks.

Each of these looked fine in code review and only showed up when the flow was run for real.
