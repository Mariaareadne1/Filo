# Discovery & recommendations

Filo's discovery has one rule: **every result is a real `places` row, and every reason shown is backed by a stored fact.** Generative AI does not pick places. Taste and friends rerank them.

## Architecture

```
natural-language query
        │  lib/discovery/parseQuery.ts  (pure, unit-tested)
        ▼
structured, grounded filters ──► search_places() RPC (SECURITY INVOKER → RLS applies)
  category · real provider tags         │  lexical: tsvector(name A, tags B, category B,
  neighborhood → distance radius        │           neighborhood C, address D) + pg_trgm
  "friends saved" → social filter       │  social:  friends who pinned it (visible only),
  honest notes for unknowable attrs     │           best friend rank, your own status
                                        │  geo:     great-circle distance
                                        ▼
                        rows + score components ──► lib/discovery/explain.ts
                                                     reasons only from those fields
```

* **Query understanding** (`parseQuery`) maps phrases onto data Filo really has: category, Mapbox POI tags, neighborhood centroid plus radius, and the social graph. Phrases about **noise, price, hours or "romantic"** are never turned into fake filters. They produce a visible note, for example "Prices aren't available yet, so results aren't filtered by cost".
* **Relaxation:** provider tags are coarse (vintage shops are usually just "clothes store"). If the specific words match nothing but a category or area was understood, the search falls back to that and **tells the user it did**.
* **Lenses** (`discover_lens` RPC + `fetchLikeYou`):

| Lens | Definition | Threshold (shows nothing below it) |
|---|---|---|
| New to your network | friends' pins from the last 30 days that you haven't saved | ≥ 1 friend |
| Saved by people like you | top-third places of people whose rankings correlate with yours | you've ranked ≥ 3 places in that category; their match is "promising" or "strong" |
| Hidden gems | a friend ranks it in their top third and ≤ 3 people pinned it | friend's list ≥ 3 |
| Friends disagree | ≥ 2 friends ranked it, percentile spread ≥ 0.5 | 2 rankings |
| Trending near campus | distinct pinners within 2.5 km of campus in 14 days | ≥ 2 people |
| Most pinned | distinct pinners | ≥ 2 people |

* **Taste matching** (`lib/tasteMatch.ts`) uses tie-correct Spearman (Pearson on average ranks; the old `indexOf` version mis-ranked ties). It is shrunk by evidence: `similarity = rho · n/(n+5)`. Labels never overstate. Three shared places with perfect agreement is "promising"; "strong" needs ≥ 5 shared places and rho ≥ 0.6.
* **Privacy:** every query runs as the caller. A private account you don't follow can't contribute social counts, rankings or taste signal. This is tested in `supabase/tests/20_discovery.sql`.

## Evaluation (local, reproducible)

`node --experimental-strip-types scripts/eval/discovery-eval.mts` writes `docs/eval/discovery-results.json`.

* **Corpus:** 79 real NYC venues pulled from Mapbox Search Box into the local stack (`scripts/local-stack/seed.mjs`). Social data comes from test accounts (`@filo.test`) that exist only locally.
* **Judgments:** 24 queries. Each query's relevant set is an explicit SQL rule over stored attributes, such as `'cocktail bar' = ANY(tags) AND neighborhood = 'Upper West Side'`, so labels are reproducible rather than hand-picked.
* **Method:** each query runs through the real PostgREST + RLS path as `@you`, once to warm up and then 3 timed runs.

| Method | P@5 | R@10 | MRR | nDCG@10 | p50 ms | p95 ms |
|---|---|---|---|---|---|---|
| keyword: name ILIKE (what the old map search did) | 0.200 | 0.354 | 0.361 | 0.316 | 1.9 | 3.8 |
| full-text on the raw query | 0.350 | 0.715 | 0.708 | 0.705 | 2.1 | 4.1 |
| **hybrid**: parser + filters + relaxation | **0.575** | **0.901** | **1.000** | **0.930** | 2.3 | 4.0 |

**What these numbers do and don't show.**
* The judgments use the same attribute vocabulary the parser targets. The hybrid result therefore shows that the parser maps language onto those attributes correctly and much better than keywords. It is *not* evidence of subjective quality ("best", "cozy").
* P@5 is capped when a query has fewer than 5 relevant venues.
* 24 queries over 79 venues is small, so treat the differences as directional.
* Latency is local (single machine, warm cache).
* Real relevance labels should come from Filo search logs ("searched X → saved Y") once there's real usage.

## The companion engine (`filo-recommendation-engine`) — audited, not deployed

* All 500 venues are **synthetic** (`syn_0000…0499`, template names, jittered coordinates). Its IDs can't map to Filo places, and its categories don't match Filo's.
* Its reported MRR@5 = 1.0 is **leaked**: the validation queries are a subset of the training queries. Base MiniLM and even BM25 also score 1.0 on that split.
* On 20 fresh paraphrases, the fine-tuned model scored MRR@5 0.82 vs base MiniLM 0.79 vs BM25 0.66. That is within noise on synthetic text.
* The API has no auth, no rate limit and no input cap, and nothing in the app called it.
* **Leak fixed** on `filo-recommendation-engine` branch `fix/eval-leakage` (`09e9ed8`). Queries are split before pairs are built, and the splits are asserted disjoint. On the 13 held-out queries, base and fine-tuned models both score MRR@5 = 1.0: the metric saturates on synthetic text, so it can't show a benefit from fine-tuning. That repo's README now documents this and the synthetic provenance.

**Decision:** don't run it as separate infrastructure. Reused from it: the description-building idea (name + tags + neighborhood → document) and the MRR/P@K evaluation method.

## Adding embeddings later (contract, not enabled)

If real usage shows lexical + structured retrieval missing paraphrases:

1. `CREATE EXTENSION vector;` then `place_embeddings(place_id uuid PK, model text, embedding vector(384))` with an HNSW cosine index. Embed `name · category · tags · neighborhood` with **one** model for both places and queries (e.g. `gte-small` in a Supabase Edge Function). Never mix models.
2. Add a `p_embedding vector(384)` argument to `search_places` and blend `1 - cosine_distance` into `score` with a minimum similarity cutoff, so irrelevant queries still return nothing.
3. Keep the provider key server-side: the Edge Function embeds; the app never sees the key.
4. Re-run `discovery-eval.mts`. Ship only if it beats the current hybrid on held-out, real queries.
