'use client';

import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { sendOtp, verifyOtp, type AuthState } from './actions';
import { Sticker } from '@/components/filo/Sticker';

export default function BusinessLogin() {
  const router = useRouter();
  const [sendState, sendAction, sending] = useActionState<AuthState, FormData>(sendOtp, {});

  const email = sendState.email ?? '';
  const codeSent = sendState.sent === true;

  const [verifyState, verifyAction, verifying] = useActionState<AuthState, FormData>(
    async (prev, formData) => {
      const result = await verifyOtp(prev, formData);
      // On success Supabase has set the session cookie; go to the dashboard,
      // which routes to claim/analytics based on the account state.
      if (!result.error) router.replace('/business');
      return result;
    },
    {},
  );

  return (
    <div className="mx-auto max-w-md">
      <h1 style={{ fontFamily: 'var(--font-display)' }} className="text-3xl font-semibold tracking-tight">
        Sign in to <span className="italic" style={{ color: 'var(--color-thread)' }}>Filo for business</span>
      </h1>
      <p style={{ color: 'var(--color-ink-soft)' }} className="mt-2 text-sm">
        See who’s discovering your venue — the word-of-mouth you could never measure.
      </p>

      <Sticker className="mt-6 p-6">
        {!codeSent ? (
          <form action={sendAction} className="space-y-4">
            <label className="block">
              <span style={{ fontFamily: 'var(--font-meta)', color: 'var(--color-ink-mute)' }} className="text-xs uppercase tracking-widest">
                Work email
              </span>
              <input
                type="email"
                name="email"
                required
                autoComplete="email"
                defaultValue={email}
                placeholder="you@yourvenue.com"
                aria-invalid={!!sendState.error}
                aria-describedby={sendState.error ? 'email-error' : undefined}
                className="mt-1 w-full rounded-lg px-3 py-2 text-sm outline-none sticker-sm"
                style={{ background: 'var(--color-surface)', color: 'var(--color-ink)' }}
              />
            </label>
            {sendState.error && (
              <p id="email-error" role="alert" className="text-sm" style={{ color: 'var(--color-thread)' }}>
                {sendState.error}
              </p>
            )}
            <button
              type="submit"
              disabled={sending}
              aria-busy={sending}
              className="w-full rounded-full px-6 py-3 text-sm font-semibold sticker-sm disabled:opacity-60"
              style={{ background: 'var(--color-thread)', color: 'var(--color-surface)' }}
            >
              {sending ? 'Sending…' : 'Email me a code'}
            </button>
          </form>
        ) : (
          <form action={verifyAction} className="space-y-4">
            <input type="hidden" name="email" value={email} />
            <p className="text-sm" style={{ color: 'var(--color-ink-soft)' }}>
              We sent a 6-digit code to <strong style={{ color: 'var(--color-ink)' }}>{email}</strong>.
            </p>
            <label className="block">
              <span style={{ fontFamily: 'var(--font-meta)', color: 'var(--color-ink-mute)' }} className="text-xs uppercase tracking-widest">
                Verification code
              </span>
              <input
                type="text"
                name="token"
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="123456"
                aria-invalid={!!verifyState.error}
                aria-describedby={verifyState.error ? 'token-error' : undefined}
                className="mt-1 w-full rounded-lg px-3 py-2 text-lg tracking-[0.3em] outline-none sticker-sm"
                style={{ background: 'var(--color-surface)', color: 'var(--color-ink)', fontFamily: 'var(--font-meta)' }}
              />
            </label>
            {verifyState.error && (
              <p id="token-error" role="alert" className="text-sm" style={{ color: 'var(--color-thread)' }}>
                {verifyState.error}
              </p>
            )}
            <button
              type="submit"
              disabled={verifying}
              aria-busy={verifying}
              className="w-full rounded-full px-6 py-3 text-sm font-semibold sticker-sm disabled:opacity-60"
              style={{ background: 'var(--color-thread)', color: 'var(--color-surface)' }}
            >
              {verifying ? 'Verifying…' : 'Verify & continue'}
            </button>
          </form>
        )}
      </Sticker>
    </div>
  );
}
