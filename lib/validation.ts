/** Loose email shape check (the server is authoritative). */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Strip whitespace and invisible characters autofill/paste can insert. */
export function normalizeEmail(raw: string): string {
  return raw.normalize('NFKC').replace(/[\s ​-‍⁠﻿]/g, '').toLowerCase();
}
