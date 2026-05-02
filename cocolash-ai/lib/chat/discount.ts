/**
 * lib/chat/discount.ts — pick the right discount code for the current turn.
 *
 * Reads `discount_rules` from the database, filters by:
 *   - status = 'active'
 *   - campaign_window contains now (or is null)
 *   - usage_limit_per_code not exceeded
 *   - intent_triggers contains the current intent (or is empty)
 *   - product_line_scope intersects the discussed product handles (or empty)
 *
 * Returns the strongest applicable rule, or null. Stage 1 returns ONE code
 * per turn (D-02); stacking is Stage 2 / App Proxy work.
 */

import { type SupabaseClient } from "@supabase/supabase-js";
import type { IntentLabel } from "./types";

export interface DiscountRule {
  id: string;
  code: string;
  value: number;
  value_type: "percentage" | "fixed_amount";
  discount_class: "order" | "product" | "shipping";
  combinability: Record<string, unknown>;
  customer_selection: string;
  intent_triggers: string[] | null;
  product_line_scope: string[] | null;
  campaign_window: string | null; // tstzrange returned as raw range string
  applies_once_per_customer: boolean | null;
  usage_limit_per_code: number | null;
  times_used: number;
  status: "active" | "paused" | "expired";
}

export interface OfferContext {
  intent: IntentLabel;
  productHandles: ReadonlyArray<string>;
  now?: Date;
}

export interface OfferedDiscount {
  code: string;
  description: string;
  rule: DiscountRule;
}

/**
 * Pure helper used by the route + tests. Filters the candidate rules
 * against the offer context and returns the best match.
 */
export function selectDiscountForTurn(
  rules: ReadonlyArray<DiscountRule>,
  ctx: OfferContext
): OfferedDiscount | null {
  const now = ctx.now ?? new Date();
  const applicable = rules
    .filter((r) => r.status === "active")
    .filter((r) => isWithinWindow(r.campaign_window, now))
    .filter((r) => !isOverLimit(r))
    .filter((r) => intentMatches(r.intent_triggers, ctx.intent))
    .filter((r) => productMatches(r.product_line_scope, ctx.productHandles));

  if (applicable.length === 0) return null;
  // Tie-break: highest absolute value for percentage codes; then by code asc for stability.
  applicable.sort((a, b) => {
    if (a.value_type !== b.value_type) {
      return a.value_type === "percentage" ? -1 : 1;
    }
    if (b.value !== a.value) return Math.abs(b.value) - Math.abs(a.value);
    return a.code.localeCompare(b.code);
  });
  const winner = applicable[0];
  return {
    code: winner.code,
    description: describeRule(winner),
    rule: winner,
  };
}

export async function fetchActiveDiscounts(
  supabase: SupabaseClient
): Promise<DiscountRule[]> {
  const { data, error } = await supabase
    .from("discount_rules")
    .select("*")
    .eq("status", "active");
  if (error) {
    return [];
  }
  return (data ?? []) as DiscountRule[];
}

// ── Pure helpers ──────────────────────────────────────────────

export function isWithinWindow(rangeRaw: string | null, now: Date): boolean {
  if (!rangeRaw) return true;
  // Postgres tstzrange syntax: '["2024-11-04T13:38:20-05:00","2025-12-31T23:59:59-05:00")'
  const m = rangeRaw.match(/^[\[(]([^,]*),([^)]*)[\])]$/);
  if (!m) return true;
  const startRaw = m[1].replace(/^"/, "").replace(/"$/, "").trim();
  const endRaw = m[2].replace(/^"/, "").replace(/"$/, "").trim();
  const startOk = startRaw === "" || new Date(startRaw).getTime() <= now.getTime();
  const endOk = endRaw === "" || new Date(endRaw).getTime() > now.getTime();
  return startOk && endOk;
}

export function isOverLimit(rule: Pick<DiscountRule, "times_used" | "usage_limit_per_code">): boolean {
  if (rule.usage_limit_per_code == null) return false;
  return rule.times_used >= rule.usage_limit_per_code;
}

export function intentMatches(
  triggers: string[] | null | undefined,
  intent: IntentLabel
): boolean {
  if (!triggers || triggers.length === 0) return true;
  return triggers.includes(intent) || triggers.includes(`intent:${intent}`);
}

export function productMatches(
  scope: string[] | null | undefined,
  productHandles: ReadonlyArray<string>
): boolean {
  if (!scope || scope.length === 0) return true;
  if (productHandles.length === 0) return false;
  return scope.some((s) => productHandles.includes(s));
}

export function describeRule(rule: DiscountRule): string {
  const v =
    rule.value_type === "percentage"
      ? `${Math.abs(rule.value).toFixed(0)}% off`
      : `$${Math.abs(rule.value).toFixed(2)} off`;
  const scope =
    rule.discount_class === "shipping"
      ? "shipping"
      : rule.discount_class === "product"
        ? "product"
        : "your order";
  return `${v} ${scope}`;
}
