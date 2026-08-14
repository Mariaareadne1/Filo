'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { searchPlaces, claimVenue, type PlaceHit } from './actions';
import { Sticker } from '@/components/filo/Sticker';

const CATEGORY_LABELS: Record<string, string> = {
  food: 'Food & Drink',
  bar: 'Bar & Nightlife',
  beauty: 'Beauty & Grooming',
  experience: 'Experience',
  retail: 'Taste Retail',
};

const SEARCH_DEBOUNCE_MS = 250;

export default function ClaimVenue() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<PlaceHit[]>([]);
  const [selected, setSelected] = useState<PlaceHit | null>(null);
  const [pendingNote, setPendingNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searching, startSearch] = useTransition();
  const [claiming, startClaim] = useTransition();

  // Guards against out-of-order search responses overwriting fresh results, and
  // holds the debounce timer so we fire one request per typing pause.
  const latestQuery = useRef('');
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function runSearch(next: string) {
    setQuery(next);
    setSelected(null);
    latestQuery.current = next;

    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    if (next.trim().length < 2) {
      setHits([]);
      return;
    }
    debounceTimer.current = setTimeout(() => {
      startSearch(async () => {
        const results = await searchPlaces(next);
        // Ignore a stale resolution the user has already typed past.
        if (latestQuery.current === next) setHits(results);
      });
    }, SEARCH_DEBOUNCE_MS);
  }

  function submit() {
    if (!selected) return;
    setError(null);
    startClaim(async () => {
      const result = await claimVenue(selected.id, selected.name);
      if (result.error) {
        setError(result.error);
      } else if (result.status === 'verified') {
        router.replace('/business');
      } else {
        setPendingNote(
          'Claim received. We’ll verify ownership and email you when your dashboard is live — usually within a day.',
        );
      }
    });
  }

  const statusMessage = searching
    ? 'Searching…'
    : query.trim().length >= 2 && hits.length === 0
      ? 'No venues match yet. A venue appears here once a student has pinned it.'
      : hits.length > 0
        ? `${hits.length} ${hits.length === 1 ? 'venue' : 'venues'} found`
        : '';

  return (
    <div className="mx-auto max-w-xl">
      <h1 style={{ fontFamily: 'var(--font-display)' }} className="text-3xl font-semibold tracking-tight">
        Claim your venue
      </h1>
      <p style={{ color: 'var(--color-ink-soft)' }} className="mt-2 text-sm">
        Find your spot below. If your business email matches your website, you’re verified instantly.
      </p>

      {pendingNote ? (
        <Sticker className="mt-6 p-6">
          <p className="text-sm" style={{ color: 'var(--color-ink)' }}>
            {pendingNote}
          </p>
        </Sticker>
      ) : (
        <Sticker className="mt-6 p-6">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <label className="block">
              <span style={{ fontFamily: 'var(--font-meta)', color: 'var(--color-ink-mute)' }} className="text-xs uppercase tracking-widest">
                Venue name
              </span>
              <input
                type="text"
                value={query}
                onChange={(e) => runSearch(e.target.value)}
                placeholder="e.g. Joe Coffee"
                autoFocus
                aria-controls="venue-results"
                className="mt-1 w-full rounded-lg px-3 py-2 text-sm outline-none sticker-sm"
                style={{ background: 'var(--color-surface)', color: 'var(--color-ink)' }}
              />
            </label>

            {/* Live region: announces search status + result count to screen readers. */}
            <div id="venue-results" aria-live="polite">
              {statusMessage && (query.trim().length >= 2 || searching) && (
                <p className="mt-3 text-sm" style={{ color: 'var(--color-ink-mute)' }}>
                  {statusMessage}
                </p>
              )}

              {hits.length > 0 && (
                <ul role="listbox" aria-label="Matching venues" className="mt-3 space-y-2">
                  {hits.map((hit) => {
                    const isSel = selected?.id === hit.id;
                    return (
                      <li key={hit.id} role="option" aria-selected={isSel}>
                        <button
                          type="button"
                          onClick={() => setSelected(hit)}
                          className="w-full rounded-lg px-3 py-2 text-left transition-transform hover:-translate-y-0.5 sticker-sm"
                          style={{
                            background: isSel ? 'var(--color-zone2)' : 'var(--color-surface)',
                            borderColor: isSel ? 'var(--color-thread)' : 'var(--color-ink)',
                          }}
                        >
                          <span className="block text-sm font-medium" style={{ color: 'var(--color-ink)' }}>
                            {hit.name}
                          </span>
                          <span className="block text-xs" style={{ color: 'var(--color-ink-mute)' }}>
                            {CATEGORY_LABELS[hit.category] ?? hit.category} <span aria-hidden>·</span> {hit.address}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {error && (
              <p id="claim-error" role="alert" className="mt-3 text-sm" style={{ color: 'var(--color-thread)' }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={!selected || claiming}
              aria-busy={claiming}
              aria-describedby={error ? 'claim-error' : undefined}
              className="mt-5 w-full rounded-full px-6 py-3 text-sm font-semibold sticker-sm disabled:opacity-50"
              style={{ background: 'var(--color-thread)', color: 'var(--color-surface)' }}
            >
              {claiming ? 'Claiming…' : selected ? `Claim ${selected.name}` : 'Select your venue'}
            </button>
          </form>
        </Sticker>
      )}
    </div>
  );
}
