import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import aesjs from 'aes-js';

/**
 * Encrypted storage adapter for the Supabase auth session.
 *
 * expo-secure-store (Keychain / Keystore) has a ~2 KB per-item limit, but a
 * Supabase session blob (access + refresh JWTs) routinely exceeds that. So we
 * use the Supabase-recommended "large secure store" split:
 *
 *   - a fresh 256-bit AES key per value lives in SecureStore (hardware-backed)
 *   - the AES-CTR ciphertext lives in AsyncStorage (no size limit)
 *
 * Neither store holds anything useful alone: AsyncStorage has only ciphertext,
 * the Keychain has only the key. This replaces the previous plain-AsyncStorage
 * persistence, which left refresh tokens readable on a compromised/rooted
 * device or in an unencrypted backup.
 *
 * Note: existing sessions written by the old plain-AsyncStorage adapter can't
 * be decrypted (no SecureStore key exists for them) — getItem returns null and
 * the user signs in once more. This is a one-time, expected transition.
 */

// SecureStore keys accept only [A-Za-z0-9._-]; Supabase storage keys can
// contain other characters, so sanitize before use.
const SECURE_KEY_PREFIX = 'sb_enc_key_';

function secureKeyName(key: string): string {
  return SECURE_KEY_PREFIX + key.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function encrypt(value: string): { cipherHex: string; keyHex: string } {
  const key = Array.from(Crypto.getRandomBytes(32));
  const cipher = new aesjs.ModeOfOperation.ctr(key, new aesjs.Counter(1));
  const cipherBytes = cipher.encrypt(aesjs.utils.utf8.toBytes(value));
  return {
    cipherHex: aesjs.utils.hex.fromBytes(cipherBytes),
    keyHex: aesjs.utils.hex.fromBytes(key),
  };
}

function decrypt(cipherHex: string, keyHex: string): string {
  const key = Array.from(aesjs.utils.hex.toBytes(keyHex));
  const cipher = new aesjs.ModeOfOperation.ctr(key, new aesjs.Counter(1));
  const decryptedBytes = cipher.decrypt(aesjs.utils.hex.toBytes(cipherHex));
  return aesjs.utils.utf8.fromBytes(decryptedBytes);
}

export const LargeSecureStore = {
  async getItem(key: string): Promise<string | null> {
    const cipherHex = await AsyncStorage.getItem(key);
    if (!cipherHex) return null;
    const keyHex = await SecureStore.getItemAsync(secureKeyName(key));
    if (!keyHex) return null;
    try {
      return decrypt(cipherHex, keyHex);
    } catch {
      // Corrupt/rotated key — treat as no session rather than crashing auth.
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    const { cipherHex, keyHex } = encrypt(value);
    await SecureStore.setItemAsync(secureKeyName(key), keyHex);
    await AsyncStorage.setItem(key, cipherHex);
  },

  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
    await SecureStore.deleteItemAsync(secureKeyName(key));
  },
};
