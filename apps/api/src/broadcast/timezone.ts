/**
 * Converts a wall-clock date + time in an IANA timezone (e.g. "2026-11-20",
 * "09:00", "Asia/Kolkata") to the corresponding UTC instant, using only the
 * platform's Intl database — no date library needed.
 *
 * Throws RangeError for an unknown timezone and returns null for a wall-clock
 * time that does not exist (a DST "spring forward" gap).
 */
export function zonedTimeToUtc(date: string, time: string, timeZone: string): Date | null {
  const [y, mo, d] = date.split('-').map(Number) as [number, number, number];
  const [h, mi] = time.split(':').map(Number) as [number, number];
  const wallAsUtc = Date.UTC(y, mo - 1, d, h, mi);

  // Offset of `timeZone` from UTC at the given instant, in ms.
  const offsetAt = (instant: number): number => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(new Date(instant));
    const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
    return asUtc - Math.floor(instant / 1000) * 1000;
  };

  // Two refinement passes handle offsets that change around the target time.
  let guess = wallAsUtc - offsetAt(wallAsUtc);
  guess = wallAsUtc - offsetAt(guess);

  // Verify the round trip: a nonexistent local time (DST gap) will not match.
  const check = new Date(guess + offsetAt(guess));
  const same =
    check.getUTCFullYear() === y &&
    check.getUTCMonth() === mo - 1 &&
    check.getUTCDate() === d &&
    check.getUTCHours() === h &&
    check.getUTCMinutes() === mi;
  return same ? new Date(guess) : null;
}

/** True when `timeZone` is a valid IANA identifier. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}
