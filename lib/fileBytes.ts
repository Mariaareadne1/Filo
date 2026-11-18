import { File } from 'expo-file-system';

/**
 * Reads a local file:// URI as bytes for Supabase Storage. In React Native,
 * `fetch(uri).blob()` uploads through supabase-js as a 0-byte object, so we
 * hand storage an ArrayBuffer instead.
 */
export async function readFileBytes(uri: string): Promise<ArrayBuffer> {
  const bytes = await new File(uri).arrayBuffer();
  if (bytes.byteLength === 0) throw new Error('The selected photo is empty.');
  return bytes;
}
