import { isValidTimeZone, zonedTimeToUtc } from './timezone';

describe('zonedTimeToUtc', () => {
  it('converts India Standard Time (UTC+05:30, no DST)', () => {
    expect(zonedTimeToUtc('2026-11-20', '09:00', 'Asia/Kolkata')?.toISOString()).toBe('2026-11-20T03:30:00.000Z');
  });

  it('handles negative offsets and DST (US Eastern, winter vs summer)', () => {
    expect(zonedTimeToUtc('2026-01-15', '09:00', 'America/New_York')?.toISOString()).toBe('2026-01-15T14:00:00.000Z');
    expect(zonedTimeToUtc('2026-07-15', '09:00', 'America/New_York')?.toISOString()).toBe('2026-07-15T13:00:00.000Z');
  });

  it('returns UTC unchanged', () => {
    expect(zonedTimeToUtc('2026-11-20', '23:59', 'UTC')?.toISOString()).toBe('2026-11-20T23:59:00.000Z');
  });

  it('crosses the date line correctly', () => {
    // 00:30 on the 21st in Kolkata is 19:00 on the 20th UTC.
    expect(zonedTimeToUtc('2026-11-21', '00:30', 'Asia/Kolkata')?.toISOString()).toBe('2026-11-20T19:00:00.000Z');
  });

  it('returns null for a wall-clock time skipped by a DST jump', () => {
    // US clocks jumped 02:00 -> 03:00 on 2026-03-08.
    expect(zonedTimeToUtc('2026-03-08', '02:30', 'America/New_York')).toBeNull();
  });

  it('throws for an unknown timezone', () => {
    expect(() => zonedTimeToUtc('2026-11-20', '09:00', 'Mars/Olympus')).toThrow(RangeError);
  });
});

describe('isValidTimeZone', () => {
  it('accepts IANA zones and rejects junk', () => {
    expect(isValidTimeZone('Asia/Kolkata')).toBe(true);
    expect(isValidTimeZone('Not/AZone')).toBe(false);
  });
});
