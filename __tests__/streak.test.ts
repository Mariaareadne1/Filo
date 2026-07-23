import { startOfWeek, computeStreak } from '../lib/streak';

// A fixed "now": Wednesday 2026-07-22 (UTC-safe midday to avoid TZ edge flips).
const NOW = new Date('2026-07-22T12:00:00');

describe('startOfWeek', () => {
  test('anchors to Monday midnight', () => {
    const monday = startOfWeek(new Date('2026-07-22T12:00:00')); // a Wednesday
    expect(monday.getDay()).toBe(1); // Monday
    expect(monday.getHours()).toBe(0);
    expect(monday.getMinutes()).toBe(0);
  });

  test('Sunday belongs to the week that started the previous Monday', () => {
    const sunday = new Date('2026-07-26T12:00:00'); // Sunday
    const monday = startOfWeek(sunday);
    expect(monday.getDay()).toBe(1);
    expect(monday.getDate()).toBe(20); // Mon 2026-07-20
  });
});

describe('computeStreak', () => {
  test('no pins → streak 0', () => {
    expect(computeStreak([], NOW)).toBe(0);
  });

  test('a pin this week → streak 1', () => {
    const pins = [{ created_at: '2026-07-21T09:00:00' }]; // Tue, this week
    expect(computeStreak(pins, NOW)).toBe(1);
  });

  test('pins in 3 consecutive weeks including this one → streak 3', () => {
    const pins = [
      { created_at: '2026-07-21T09:00:00' }, // this week
      { created_at: '2026-07-15T09:00:00' }, // last week
      { created_at: '2026-07-08T09:00:00' }, // two weeks ago
    ];
    expect(computeStreak(pins, NOW)).toBe(3);
  });

  test('a gap breaks the streak', () => {
    const pins = [
      { created_at: '2026-07-21T09:00:00' }, // this week
      // (skip last week)
      { created_at: '2026-07-08T09:00:00' }, // two weeks ago
    ];
    expect(computeStreak(pins, NOW)).toBe(1);
  });

  test('only older pins (not the current week) → streak 0', () => {
    const pins = [{ created_at: '2026-07-08T09:00:00' }];
    expect(computeStreak(pins, NOW)).toBe(0);
  });

  test('multiple pins in the same week count once', () => {
    const pins = [
      { created_at: '2026-07-20T09:00:00' },
      { created_at: '2026-07-21T09:00:00' },
      { created_at: '2026-07-22T09:00:00' },
    ];
    expect(computeStreak(pins, NOW)).toBe(1);
  });
});
