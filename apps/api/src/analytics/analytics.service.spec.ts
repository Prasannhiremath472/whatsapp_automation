import { utcOffsetMinutes } from './analytics.service';

describe('utcOffsetMinutes', () => {
  it('knows fixed-offset zones', () => {
    expect(utcOffsetMinutes('Asia/Kolkata')).toBe(330);
    expect(utcOffsetMinutes('UTC')).toBe(0);
    expect(utcOffsetMinutes('Asia/Dubai')).toBe(240);
  });

  it('follows daylight saving time', () => {
    expect(utcOffsetMinutes('America/New_York', new Date('2026-01-15T12:00:00Z'))).toBe(-300);
    expect(utcOffsetMinutes('America/New_York', new Date('2026-07-15T12:00:00Z'))).toBe(-240);
  });
});
