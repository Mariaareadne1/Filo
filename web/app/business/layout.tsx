import type { Metadata } from 'next';
import { Fraunces, Inter, DM_Mono } from 'next/font/google';
import Link from 'next/link';

// Filo type stack, ported from the native app: Fraunces (display/numbers),
// Inter (UI/body), DM Mono (tiny meta labels). Exposed as CSS variables that
// globals.css maps to --font-display / --font-body / --font-meta.
const fraunces = Fraunces({
  variable: '--font-fraunces',
  subsets: ['latin'],
  display: 'swap',
});
const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
});
const dmMono = DM_Mono({
  variable: '--font-dm-mono',
  weight: ['400', '500'],
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Filo for Business',
  description: 'See who is discovering your venue — the word-of-mouth you could never measure.',
};

export default function BusinessLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`${fraunces.variable} ${inter.variable} ${dmMono.variable} min-h-full`}
      style={{ background: 'var(--color-paper)', color: 'var(--color-ink)', fontFamily: 'var(--font-body)' }}
    >
      <header className="border-b" style={{ borderColor: 'var(--color-ink-line)' }}>
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/business" className="flex items-center gap-2">
            {/* The one red orb — Filo's single-accent rule. */}
            <span
              aria-hidden
              className="inline-block h-3 w-3 rounded-full"
              style={{ background: 'var(--color-thread)' }}
            />
            <span style={{ fontFamily: 'var(--font-display)' }} className="text-lg font-semibold tracking-tight">
              Filo <span className="italic" style={{ color: 'var(--color-ink-soft)' }}>for business</span>
            </span>
          </Link>
          <span
            style={{ fontFamily: 'var(--font-meta)', color: 'var(--color-ink-mute)' }}
            className="text-xs uppercase tracking-widest"
          >
            Morningside Heights
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
    </div>
  );
}
