/**
 * lib/chat/preflight.ts — Daily cost kill-switch.
 *
 * Sums chat_cost_events.total_cost_usd for the current UTC day and
 * compares to chat_settings.daily_cap_usd. Returns:
 *   { canProceed: true, spentToday, capUsd }  — under cap
 *   { canProceed: false, ... }                — at/over cap
 *
 * Callers translate the false case into a 503 graceful response.
 * Reading the cap inside the route on every call is fine — the table
 * is single-row and the read is sub-ms.
 */

import { type SupabaseClient } from "@supabase/supabase-js";
import { CHAT_SETTINGS_SINGLETON_ID } from "./db";

export interface PreflightResult {
  canProceed: boolean;
  spentToday: number;
  capUsd: number;
  reason?: "bot_disabled" | "cost_cap_exceeded";
}

export async function preflight(supabase: SupabaseClient): Promise<PreflightResult> {
  const { data: settings } = await supabase
    .from("chat_settings")
    .select("bot_enabled, daily_cap_usd")
    .eq("id", CHAT_SETTINGS_SINGLETON_ID)
    .maybeSingle();

  const cap = Number(settings?.daily_cap_usd ?? 50);
  const enabled = !!settings?.bot_enabled;

  if (!enabled) {
    return { canProceed: false, spentToday: 0, capUsd: cap, reason: "bot_disabled" };
  }

  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);

  const { data: rows } = await supabase
    .from("chat_cost_events")
    .select("total_cost_usd")
    .gte("created_at", dayStart.toISOString());

  const spent = (rows ?? []).reduce(
    (sum, r) => sum + Number((r as { total_cost_usd: number | string }).total_cost_usd),
    0
  );

  if (spent >= cap) {
    return { canProceed: false, spentToday: spent, capUsd: cap, reason: "cost_cap_exceeded" };
  }

  return { canProceed: true, spentToday: spent, capUsd: cap };
}
