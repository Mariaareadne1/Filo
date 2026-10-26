/**
 * Turns Supabase/PostgREST/network errors into short, actionable copy for
 * people, while keeping the detail for the developer console. Never surface
 * raw SQL codes, hints or table names in the UI.
 */
export class UserFacingError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'UserFacingError';
  }
}

interface PgLikeError {
  code?: string;
  message?: string;
}

const KNOWN: { test: (e: PgLikeError) => boolean; message: string }[] = [
  { test: (e) => /network request failed|fetch failed|timeout|aborted/i.test(e.message ?? ''), message: "You're offline or the connection dropped. Try again." },
  { test: (e) => e.code === '42501' || /forbidden|insufficient_privilege|row-level security/i.test(e.message ?? ''), message: "You don't have access to that." },
  { test: (e) => e.code === '23505' && /username/i.test(e.message ?? ''), message: 'That username is taken.' },
  { test: (e) => e.code === '23505', message: 'That already exists.' },
  { test: (e) => e.code === '40001' || /board changed/i.test(e.message ?? ''), message: 'This changed somewhere else. Refreshing…' },
  { test: (e) => /pin this place before ranking/i.test(e.message ?? ''), message: 'Save this place before ranking it.' },
  { test: (e) => /impression too long/i.test(e.message ?? ''), message: 'Keep your note under 150 characters.' },
  { test: (e) => /campus email|domain .* not permitted/i.test(e.message ?? ''), message: 'Filo is invite-only for Columbia and Barnard emails.' },
  { test: (e) => /JWT expired|invalid JWT|refresh token/i.test(e.message ?? ''), message: 'Your session expired. Please sign in again.' },
];

export function toUserMessage(error: unknown, fallback = 'Something went wrong. Try again.'): string {
  if (error instanceof UserFacingError) return error.message;
  const e = (error ?? {}) as PgLikeError;
  const hit = KNOWN.find((k) => k.test(e));
  return hit?.message ?? fallback;
}

/** Throw a Supabase `{ error }` as an Error so React Query sees it. */
export function unwrap<T>(result: { data: T; error: unknown }): T {
  if (result.error) {
    if (__DEV__) console.warn('[filo] request failed', result.error);
    throw result.error;
  }
  return result.data;
}
