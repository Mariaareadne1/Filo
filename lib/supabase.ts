import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { LargeSecureStore } from './secureStore';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  // Fail fast with a clear message rather than a cryptic runtime error deep
  // in the first query.
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. ' +
      'Copy .env.example to .env.local and fill them in.',
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Session persisted encrypted (AES key in Keychain/Keystore, ciphertext in
    // AsyncStorage) instead of plain AsyncStorage — see lib/secureStore.ts.
    storage: LargeSecureStore,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
