import { z } from 'zod';

/**
 * expo-router's useLocalSearchParams returns `string | string[] | undefined`
 * at runtime regardless of the TS annotation. These helpers validate an `id`
 * route param so a malformed/duplicated deep link redirects cleanly instead
 * of throwing a Postgres cast error mid-render.
 */

const idSchema = z.string().uuid();

/** Returns a valid UUID string, or null if the param is missing/malformed. */
export function parseIdParam(raw: string | string[] | undefined): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const result = idSchema.safeParse(value);
  return result.success ? result.data : null;
}
