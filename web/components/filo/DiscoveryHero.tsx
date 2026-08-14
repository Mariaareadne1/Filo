import { Sticker } from './Sticker';

/**
 * The dashboard hero: the single number that proves the data is real —
 * distinct students who discovered this venue this week, with a WoW delta.
 * One glance, no analytics literacy required (business-plan.md Part 2 §4).
 */
export function DiscoveryHero({
  thisWeek,
  delta,
}: {
  thisWeek: number;
  delta: number;
}) {
  const up = delta > 0;
  const flat = delta === 0;
  const deltaColor = up
    ? 'var(--color-thread)'
    : flat
      ? 'var(--color-ink-mute)'
      : 'var(--color-ink-soft)';

  return (
    <Sticker className="p-8">
      <h2
        style={{ fontFamily: 'var(--font-meta)', color: 'var(--color-ink-mute)' }}
        className="text-xs font-normal uppercase tracking-widest"
      >
        Discovered you this week
      </h2>
      <div className="mt-2 flex items-end gap-4">
        <span
          style={{ fontFamily: 'var(--font-display)', color: 'var(--color-ink)' }}
          className="text-7xl font-semibold leading-none tabular-nums"
        >
          {thisWeek}
        </span>
        <span className="mb-2 text-lg font-medium" style={{ color: deltaColor }}>
          <span aria-hidden>{up ? '↑' : flat ? '→' : '↓'}</span>
          <span className="sr-only">{up ? 'Increased by ' : flat ? 'No change, ' : 'Decreased by '}</span>
          {Math.abs(delta)}
          <span
            style={{ fontFamily: 'var(--font-meta)', color: 'var(--color-ink-mute)' }}
            className="ml-2 text-xs uppercase tracking-widest"
          >
            vs last week
          </span>
        </span>
      </div>
      <p style={{ color: 'var(--color-ink-soft)' }} className="mt-3 text-sm">
        {thisWeek === 1 ? '1 student' : `${thisWeek} students`} pinned you in the last 7 days.
      </p>
    </Sticker>
  );
}
