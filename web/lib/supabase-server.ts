import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Server-side Supabase client bound to the request's auth cookies. Use this in
 * Server Components / Server Actions / Route Handlers so RPC calls run AS the
 * signed-in business owner — which is what the discovery-analytics RPCs
 * authorize against (assert_owns_verified_venue reads auth.uid()).
 *
 * The anon key is public by design; row access is governed by RLS + the RPC
 * authorization guard, never by key secrecy.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // setAll can be called from a Server Component render, where cookies
            // are read-only. Session refresh is handled in middleware instead;
            // this is safe to ignore.
          }
        },
      },
    },
  );
}
