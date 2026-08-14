import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentBusiness, getVenueAnalytics } from '@/lib/business';
import { Sticker } from '@/components/filo/Sticker';
import { DiscoveryHero } from '@/components/filo/DiscoveryHero';
import { LockedCard } from '@/components/filo/LockedCard';

export const dynamic = 'force-dynamic'; // per-request auth; never statically cached

export default async function BusinessDashboard() {
  const business = await getCurrentBusiness();
  if (!business) redirect('/business/login');
  if (!business.place_id) redirect('/business/claim');

  const { counts, sources, rank } = await getVenueAnalytics(business.place_id);

  return (
    <div className="space-y-8">
      <div>
        <h1
          style={{ fontFamily: 'var(--font-display)' }}
          className="text-3xl font-semibold tracking-tight"
        >
          {business.name}
        </h1>
        <p style={{ color: 'var(--color-ink-mute)', fontFamily: 'var(--font-meta)' }} className="mt-1 text-xs uppercase tracking-widest">
          This week <span aria-hidden>·</span> {business.tier} plan
        </p>
      </div>

      {/* Hero: the one number that proves the data is real. */}
      <DiscoveryHero thisWeek={counts?.this_week ?? 0} delta={counts?.delta ?? 0} />

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Top discovery source */}
        <Sticker small className="p-5">
          <h2 style={{ fontFamily: 'var(--font-meta)', color: 'var(--color-ink-mute)' }} className="text-xs font-normal uppercase tracking-widest">
            Where discovery came from
          </h2>
          {sources.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {sources.map((s) => (
                <li key={`${s.source_type}-${s.label}`} className="flex items-baseline justify-between gap-3">
                  <span className="text-sm" style={{ color: 'var(--color-ink)' }}>
                    {s.source_type === 'board' ? `“${s.label}” board` : s.label}
                  </span>
                  <span
                    style={{ fontFamily: 'var(--font-display)', color: 'var(--color-thread)' }}
                    className="text-lg font-semibold tabular-nums"
                  >
                    {s.reach}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ color: 'var(--color-ink-soft)' }} className="mt-3 text-sm">
              No public boards feature you yet. As students add you to shared boards, they’ll show up here.
            </p>
          )}
        </Sticker>

        {/* Category rank near campus */}
        <Sticker small className="p-5">
          <h2 style={{ fontFamily: 'var(--font-meta)', color: 'var(--color-ink-mute)' }} className="text-xs font-normal uppercase tracking-widest">
            Rank near campus
          </h2>
          {rank?.rank != null ? (
            <div className="mt-3 flex items-end gap-2">
              <span style={{ fontFamily: 'var(--font-display)', color: 'var(--color-ink)' }} className="text-4xl font-semibold tabular-nums">
                #{rank.rank}
              </span>
              <span style={{ color: 'var(--color-ink-soft)' }} className="mb-1 text-sm">
                of {rank.total} {rank.category} spots
              </span>
            </div>
          ) : (
            <p style={{ color: 'var(--color-ink-soft)' }} className="mt-3 text-sm">
              Not enough pins yet to rank you near campus.
            </p>
          )}
        </Sticker>
      </div>

      {/* Upgrade path — value legible before purchase. */}
      <div>
        <h2 style={{ fontFamily: 'var(--font-display)', color: 'var(--color-ink-soft)' }} className="mb-3 text-sm font-semibold uppercase tracking-widest">
          Unlock more
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <LockedCard tier="Pro" title="Superfans" blurb="See who drives your word-of-mouth — your most loyal student discoverers." />
          <LockedCard tier="Pro" title="Drifting regulars" blurb="Students who used to pin you and haven’t lately. Win them back." />
          <LockedCard tier="Premium" title="Student offers" blurb="Post a deal students see in-app and turn discovery into visits." />
        </div>
        <Link
          href="/business/upgrade"
          className="mt-5 inline-block rounded-full px-6 py-3 text-sm font-semibold sticker-sm transition-transform hover:-translate-y-0.5"
          style={{ background: 'var(--color-thread)', color: 'var(--color-surface)' }}
        >
          Compare plans →
        </Link>
      </div>
    </div>
  );
}
