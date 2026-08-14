'use server';

import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export type AuthState = { error?: string; sent?: boolean; email?: string };

// Server Actions are public POST endpoints — validate inputs before use.
const EmailSchema = z.string().trim().toLowerCase().email().max(254);
const TokenSchema = z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code.');

// Step 1 — send a 6-digit OTP to the business owner's email. Supabase creates
// the auth user on first sign-in; the business account itself is created later
// during the claim flow.
//
// NOTE: Supabase Auth applies its own per-address/IP OTP send throttle. Before
// broad launch, add an explicit app-level rate limit here (IP + email) to fully
// close the email-bombing / quota-burn vector — tracked in phase-2-progress.md.
export async function sendOtp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = EmailSchema.safeParse(formData.get('email') ?? '');
  if (!parsed.success) return { error: 'Enter a valid email address.' };
  const email = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });
  if (error) return { error: error.message, email };

  return { sent: true, email };
}

// Step 2 — verify the code and establish the session (cookies set via SSR).
export async function verifyOtp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const emailParsed = EmailSchema.safeParse(formData.get('email') ?? '');
  if (!emailParsed.success) return { error: 'Something went wrong — please start over.' };
  const email = emailParsed.data;

  const tokenParsed = TokenSchema.safeParse(formData.get('token') ?? '');
  if (!tokenParsed.success) {
    return { error: tokenParsed.error.issues[0]?.message ?? 'Enter the 6-digit code.', sent: true, email };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({ email, token: tokenParsed.data, type: 'email' });
  if (error) return { error: error.message, sent: true, email };

  // Session cookie is now set; the dashboard route resolves the rest.
  return { sent: true, email };
}
