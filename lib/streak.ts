/**
 * Weekly pin streak — how many consecutive ISO-ish weeks (Mon-anchored),
 * counting back from the current week, contain at least one pin.
 */

/** Midnight on the Monday of the week containing `d`. */
export function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay(); // 0 = Sun, 1 = Mon, … 6 = Sat
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}

/**
 * Consecutive weeks with ≥1 pin, counting back from the week containing `now`.
 * `now` is injectable for testing; defaults to the current time.
 */
export function computeStreak(
  pins: { created_at: string }[],
  now: Date = new Date(),
): number {
  if (pins.length === 0) return 0;

  const key = (d: Date) => d.toISOString().slice(0, 10);
  const weeksWithPin = new Set<string>();
  for (const p of pins) {
    weeksWithPin.add(key(startOfWeek(new Date(p.created_at))));
  }

  let streak = 0;
  const cursor = startOfWeek(now);
  while (weeksWithPin.has(key(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 7);
  }
  return streak;
}
