import type { Platform } from "@/lib/types";

export const OPTIMAL_POSTING_TIMES: Record<
  Platform,
  { weekday: string[]; weekend: string[] }
> = {
  instagram: {
    weekday: ["11:00", "13:00", "19:00", "21:00"],
    weekend: ["10:00", "11:00", "14:00", "20:00"],
  },
  tiktok: {
    weekday: ["07:00", "12:00", "19:00", "22:00"],
    weekend: ["09:00", "12:00", "15:00", "19:00"],
  },
  facebook: {
    weekday: ["09:00", "13:00", "16:00"],
    weekend: ["12:00", "13:00"],
  },
  twitter: {
    weekday: ["08:00", "12:00", "17:00"],
    weekend: ["09:00", "12:00"],
  },
  linkedin: {
    weekday: ["07:30", "12:00", "17:00"],
    weekend: [],
  },
};

export const PLATFORM_LIMITS: Record<
  Platform,
  { caption: number; hashtags: number }
> = {
  instagram: { caption: 2200, hashtags: 25 },
  tiktok: { caption: 4000, hashtags: 5 },
  twitter: { caption: 280, hashtags: 3 },
  facebook: { caption: 63206, hashtags: 15 },
  linkedin: { caption: 3000, hashtags: 5 },
};

export function getNextOptimalTime(platform: Platform, now: Date = new Date()): Date {
  const isWeekend = [0, 6].includes(now.getDay());
  const times = OPTIMAL_POSTING_TIMES[platform][isWeekend ? "weekend" : "weekday"];

  if (times.length === 0) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    return tomorrow;
  }

  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  for (const time of times) {
    const [h, m] = time.split(":").map(Number);
    const timeMinutes = h * 60 + m;

    if (timeMinutes > nowMinutes) {
      const next = new Date(now);
      next.setHours(h, m, 0, 0);
      return next;
    }
  }

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isNextWeekend = [0, 6].includes(tomorrow.getDay());
  const nextTimes =
    OPTIMAL_POSTING_TIMES[platform][isNextWeekend ? "weekend" : "weekday"];
  const fallbackTimes = nextTimes.length > 0 ? nextTimes : ["09:00"];
  const [h, m] = fallbackTimes[0].split(":").map(Number);
  tomorrow.setHours(h, m, 0, 0);
  return tomorrow;
}
