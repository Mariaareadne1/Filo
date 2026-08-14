import Link from 'next/link';
import { Sticker } from '@/components/filo/Sticker';

type Plan = {
  name: string;
  price: string;
  tagline: string;
  features: string[];
  featured?: boolean;
};

const PLANS: Plan[] = [
  {
    name: 'Free',
    price: '$0',
    tagline: 'Prove the data is real.',
    features: ['This-week discovery count + WoW delta', 'Category rank near campus', 'Top public discovery source'],
  },
  {
    name: 'Pro',
    price: '$49',
    tagline: 'Know who drives your word-of-mouth.',
    features: ['Everything in Free', 'Superfans — your loyal discoverers', 'Drifting regulars to win back', 'Weekly AI action + trend history'],
    featured: true,
  },
  {
    name: 'Premium',
    price: '$149',
    tagline: 'Turn discovery into visits.',
    features: ['Everything in Pro', 'Student offers & deals', 'Promoted pins', 'Multi-location rollups'],
  },
];

export default function UpgradePage() {
  return (
    <div>
      <h1 style={{ fontFamily: 'var(--font-display)' }} className="text-3xl font-semibold tracking-tight">
        Plans
      </h1>
      <p style={{ color: 'var(--color-ink-soft)' }} className="mt-2 text-sm">
        Start free. Upgrade when you want to act on who’s discovering you.
      </p>

      <div className="mt-8 grid gap-5 md:grid-cols-3">
        {PLANS.map((plan) => (
          <Sticker
            key={plan.name}
            className="flex flex-col p-6"
            style={plan.featured ? { borderColor: 'var(--color-thread)' } : undefined}
          >
            {plan.featured && (
              <span
                style={{ fontFamily: 'var(--font-meta)', color: 'var(--color-thread)' }}
                className="mb-2 text-xs font-medium uppercase tracking-widest"
              >
                Most popular
              </span>
            )}
            <h2 style={{ fontFamily: 'var(--font-display)' }} className="text-xl font-semibold">
              {plan.name}
            </h2>
            <div className="mt-1 flex items-baseline gap-1">
              <span style={{ fontFamily: 'var(--font-display)' }} className="text-3xl font-semibold tabular-nums">
                {plan.price}
              </span>
              <span className="text-sm" style={{ color: 'var(--color-ink-mute)' }}>
                / mo
              </span>
            </div>
            <p className="mt-2 text-sm" style={{ color: 'var(--color-ink-soft)' }}>
              {plan.tagline}
            </p>
            <ul className="mt-4 flex-1 space-y-2">
              {plan.features.map((f) => (
                <li key={f} className="flex gap-2 text-sm" style={{ color: 'var(--color-ink)' }}>
                  <span aria-hidden style={{ color: 'var(--color-thread)' }}>
                    ·
                  </span>
                  {f}
                </li>
              ))}
            </ul>
            <button
              type="button"
              disabled={plan.name === 'Free'}
              className="mt-6 w-full rounded-full px-6 py-3 text-sm font-semibold sticker-sm disabled:opacity-50"
              style={
                plan.name === 'Free'
                  ? { background: 'var(--color-zone2)', color: 'var(--color-ink-soft)' }
                  : { background: 'var(--color-thread)', color: 'var(--color-surface)' }
              }
            >
              {plan.name === 'Free' ? 'Your current plan' : `Choose ${plan.name}`}
            </button>
          </Sticker>
        ))}
      </div>

      <p className="mt-6 text-sm" style={{ color: 'var(--color-ink-mute)' }}>
        Checkout is wired up in{' '}
        <Link href="/business" style={{ color: 'var(--color-thread)' }}>
          the next release
        </Link>
        . Prices are introductory and subject to change.
      </p>
    </div>
  );
}
