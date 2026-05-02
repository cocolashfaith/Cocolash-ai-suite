/**
 * lib/chat/hours.ts — Business-hours check for the chatbot.
 *
 * Per the System 3 KB: support is online Monday–Friday, 9 AM – 5 PM EST.
 * The voice composer toggles the after-hours suffix when isBusinessHours
 * returns false.
 *
 * Implementation uses Intl.DateTimeFormat to derive the EST hour without
 * pulling in date-fns or dayjs. EST = America/New_York handles DST.
 */

const TZ = "America/New_York";

export interface BusinessHoursState {
  isBusinessHours: boolean;
  /** 0 (Sun) – 6 (Sat) in the EST timezone. */
  weekday: number;
  /** 0–23 in the EST timezone. */
  hour: number;
}

export function getBusinessHoursState(now: Date = new Date()): BusinessHoursState {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hour: "numeric",
    hour12: false,
    weekday: "short",
  });
  const parts = fmt.formatToParts(now);
  const weekdayShort = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hourStr = parts.find((p) => p.type === "hour")?.value ?? "0";
  const hour = parseInt(hourStr, 10) % 24;

  // Map the short weekday to a 0..6 index (Sun=0).
  const map: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const weekday = map[weekdayShort] ?? 0;

  // Mon..Fri (1..5) and 9..16 (i.e. 9:00–16:59) are inside business hours.
  const isWeekday = weekday >= 1 && weekday <= 5;
  const isHour = hour >= 9 && hour < 17;
  return {
    isBusinessHours: isWeekday && isHour,
    weekday,
    hour,
  };
}

export function isBusinessHours(now: Date = new Date()): boolean {
  return getBusinessHoursState(now).isBusinessHours;
}
