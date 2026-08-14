import { Sticker } from './Sticker';

/**
 * A locked capability teaser for Pro/Premium features. Shown in v1 so the value
 * of an upgrade is legible before purchase (per business-plan.md Part 2 §4).
 * Deliberately muted — the padlock and greyed ink signal "not yet yours."
 */
export function LockedCard({
  title,
  blurb,
  tier,
}: {
  title: string;
  blurb: string;
  tier: 'Pro' | 'Premium';
}) {
  return (
    <Sticker
      small
      className="relative overflow-hidden p-5"
      style={{ background: 'var(--color-zone1)' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3
            style={{ fontFamily: 'var(--font-display)', color: 'var(--color-ink-soft)' }}
            className="text-base font-semibold"
          >
            {title}
          </h3>
          <p style={{ color: 'var(--color-ink-mute)' }} className="mt-1 text-sm leading-snug">
            {blurb}
          </p>
        </div>
        <span aria-hidden className="text-lg" style={{ color: 'var(--color-ink-mute)' }}>
          🔒
        </span>
      </div>
      <span
        style={{ fontFamily: 'var(--font-meta)', color: 'var(--color-thread)' }}
        className="mt-3 inline-block text-xs font-medium uppercase tracking-widest"
      >
        Unlock with {tier}
      </span>
    </Sticker>
  );
}
