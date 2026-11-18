// Discovery retrieval evaluation (LOCAL stack only).
//
//   node --experimental-strip-types scripts/eval/discovery-eval.mts
//
// Corpus: the real venues seeded into the local stack from Mapbox Search
// Box (scripts/local-stack/seed.mjs). Judgments: each query's relevant set
// is defined by an explicit RULE over stored attributes (category, provider
// tags, neighborhood/distance, friends' pins) and computed in SQL — so the
// labels are reproducible and not hand-picked. Limitation (stated in the
// report): this measures retrieval of attribute-matching venues, not
// subjective quality ("best", "cozy").
//
// Methods compared through the real API path (PostgREST + RLS as @you):
//   keyword  — name ILIKE any query word (what the old map search did)
//   fts      — search_places with the raw query, no parsing
//   hybrid   — parseQuery() → search_places with structured filters,
//              relaxed to category/area when nothing matches the words
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { parseQuery } from '../../lib/discovery/parseQuery.ts';

const API = 'http://127.0.0.1:55321/rest/v1';
const SECRET = 'filo-local-dev-jwt-secret-not-for-production-use';
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
const sign = (claims: object) => {
  const h = b64({ alg: 'HS256', typ: 'JWT' });
  const p = b64(claims);
  return `${h}.${p}.${crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url')}`;
};
const psql = (sql: string) =>
  execFileSync('docker', ['exec', 'filo-db', 'psql', '-At', '-U', 'supabase_admin', '-d', 'postgres', '-c', sql]).toString().trim();

const me = psql("select id from users where username = 'you'");
const anon = sign({ role: 'anon', iss: 'supabase-local', iat: 1700000000, exp: 2000000000 });
const jwt = sign({ sub: me, role: 'authenticated', aud: 'authenticated', email: 'you@filo.test', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 });
const headers = { apikey: anon, Authorization: `Bearer ${jwt}`, 'content-type': 'application/json' };

const CAMPUS = '40.8075, -73.9626';
const near = (km: number) => `geo_distance_m(${CAMPUS}, lat, lng) <= ${km * 1000}`;
const friendPinned = `id IN (SELECT place_id FROM pins WHERE user_id IN (SELECT following_id FROM follows WHERE follower_id = '${me}' AND status = 'active'))`;

const QUERIES: { q: string; rule: string }[] = [
  { q: 'coffee near campus', rule: `category = 'cafe' AND ${near(1.5)}` },
  { q: 'cocktail bar upper west side', rule: `'cocktail bar' = ANY(tags) AND neighborhood = 'Upper West Side'` },
  { q: 'pizza on the upper west side', rule: `'pizza' = ANY(tags) AND neighborhood = 'Upper West Side'` },
  { q: 'sushi', rule: `'sushi restaurant' = ANY(tags)` },
  { q: 'climbing gym', rule: `'climbing gym' = ANY(tags)` },
  { q: 'museums on the upper west side', rule: `'museum' = ANY(tags) AND neighborhood = 'Upper West Side'` },
  { q: 'bookstores', rule: `'bookstore' = ANY(tags)` },
  { q: 'nail salon', rule: `'nail salon' = ANY(tags)` },
  { q: 'vintage clothing on the lower east side', rule: `category = 'retail' AND neighborhood = 'Lower East Side'` },
  { q: 'wine bar', rule: `'wine bar' = ANY(tags)` },
  { q: 'burgers', rule: `'burger restaurant' = ANY(tags)` },
  { q: 'dinner near campus', rule: `category = 'food' AND ${near(1.5)}` },
  { q: 'quiet cafes where I could work', rule: `category = 'cafe'` },
  { q: 'first date drinks in the lower east side', rule: `category = 'bar' AND neighborhood = 'Lower East Side'` },
  { q: 'bars my friends saved', rule: `category = 'bar' AND ${friendPinned}` },
  { q: 'chinese food', rule: `'chinese restaurant' = ANY(tags)` },
  { q: 'mediterranean', rule: `'mediterranean restaurant' = ANY(tags)` },
  { q: 'bubble tea', rule: `'bubble tea' = ANY(tags)` },
  { q: 'sports bar', rule: `'sports bar' = ANY(tags)` },
  { q: 'breakfast', rule: `'breakfast restaurant' = ANY(tags)` },
  { q: 'donuts', rule: `'donut shop' = ANY(tags)` },
  { q: 'climbing in harlem', rule: `'climbing gym' = ANY(tags) AND neighborhood IN ('Harlem','East Harlem')` },
  { q: 'shake shack', rule: `name ILIKE 'shake shack%'` },
  { q: 'somewhere to get my nails done on the upper west side', rule: `'nail salon' = ANY(tags) AND neighborhood = 'Upper West Side'` },
];

async function rpc(fn: string, body: object): Promise<{ place_id: string }[]> {
  const r = await fetch(`${API}/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${fn} ${r.status} ${await r.text()}`);
  return r.json();
}

async function keyword(q: string): Promise<string[]> {
  const words = q.toLowerCase().split(/\s+/).filter((w) => w.length > 2).map((w) => w.replace(/[^a-z]/g, '')).filter(Boolean);
  if (!words.length) return [];
  const or = words.map((w) => `name.ilike.*${w}*`).join(',');
  const r = await fetch(`${API}/places?select=id&or=(${or})&order=name&limit=10`, { headers });
  return ((await r.json()) as { id: string }[]).map((x) => x.id);
}

const fts = async (q: string) => (await rpc('search_places', { p_text: q, p_limit: 10 })).map((x) => x.place_id);

async function hybrid(q: string): Promise<string[]> {
  const p = parseQuery(q);
  const center = p.near;
  const args = {
    p_text: p.text, p_terms: p.terms, p_category: p.category,
    p_near_lat: center?.lat ?? null, p_near_lng: center?.lng ?? null,
    p_radius_m: center ? p.radiusM : null, p_friends_only: p.friendsOnly, p_limit: 10,
  };
  let rows = await rpc('search_places', args);
  if (rows.length === 0 && (p.category || center)) rows = await rpc('search_places', { ...args, p_text: '', p_terms: [] });
  return rows.map((x) => x.place_id);
}

const precisionAt = (ranked: string[], rel: Set<string>, k: number) => ranked.slice(0, k).filter((x) => rel.has(x)).length / k;
const recallAt = (ranked: string[], rel: Set<string>, k: number) => (rel.size ? ranked.slice(0, k).filter((x) => rel.has(x)).length / rel.size : 0);
const mrr = (ranked: string[], rel: Set<string>) => { const i = ranked.findIndex((x) => rel.has(x)); return i < 0 ? 0 : 1 / (i + 1); };
const ndcgAt = (ranked: string[], rel: Set<string>, k: number) => {
  const dcg = ranked.slice(0, k).reduce((s, x, i) => s + (rel.has(x) ? 1 / Math.log2(i + 2) : 0), 0);
  const ideal = Array.from({ length: Math.min(k, rel.size) }, (_, i) => 1 / Math.log2(i + 2)).reduce((a, b) => a + b, 0);
  return ideal ? dcg / ideal : 0;
};

const METHODS = { keyword, fts, hybrid } as const;
type M = keyof typeof METHODS;
const agg: Record<M, { p5: number[]; r10: number[]; mrr: number[]; ndcg: number[]; ms: number[] }> =
  { keyword: { p5: [], r10: [], mrr: [], ndcg: [], ms: [] }, fts: { p5: [], r10: [], mrr: [], ndcg: [], ms: [] }, hybrid: { p5: [], r10: [], mrr: [], ndcg: [], ms: [] } };
const perQuery: object[] = [];

for (const { q, rule } of QUERIES) {
  const rel = new Set(psql(`select id from places where ${rule}`).split('\n').filter(Boolean));
  const row: Record<string, unknown> = { q, relevant: rel.size };
  for (const m of Object.keys(METHODS) as M[]) {
    // warm-up + 3 timed runs
    await METHODS[m](q);
    const times: number[] = [];
    let ranked: string[] = [];
    for (let i = 0; i < 3; i++) {
      const t0 = performance.now();
      ranked = await METHODS[m](q);
      times.push(performance.now() - t0);
    }
    const a = agg[m];
    a.p5.push(precisionAt(ranked, rel, 5)); a.r10.push(recallAt(ranked, rel, 10));
    a.mrr.push(mrr(ranked, rel)); a.ndcg.push(ndcgAt(ranked, rel, 10)); a.ms.push(...times);
    row[m] = { p5: +precisionAt(ranked, rel, 5).toFixed(2), mrr: +mrr(ranked, rel).toFixed(2), returned: ranked.length };
  }
  perQuery.push(row);
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const pct = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const summary = Object.fromEntries((Object.keys(METHODS) as M[]).map((m) => [m, {
  'P@5': +mean(agg[m].p5).toFixed(3), 'R@10': +mean(agg[m].r10).toFixed(3), MRR: +mean(agg[m].mrr).toFixed(3),
  'nDCG@10': +mean(agg[m].ndcg).toFixed(3), p50_ms: +pct(agg[m].ms, 0.5).toFixed(1), p95_ms: +pct(agg[m].ms, 0.95).toFixed(1),
}]));
const corpus = psql('select count(*) from places');
const out = { generated_at: new Date().toISOString(), corpus_places: Number(corpus), queries: QUERIES.length, summary, perQuery };
fs.mkdirSync('docs/eval', { recursive: true });
fs.writeFileSync('docs/eval/discovery-results.json', JSON.stringify(out, null, 2));
console.table(summary);
