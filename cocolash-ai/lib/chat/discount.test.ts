import { describe, it, expect } from "vitest";
import {
  selectDiscountForTurn,
  isWithinWindow,
  isOverLimit,
  intentMatches,
  productMatches,
  describeRule,
  type DiscountRule,
} from "./discount";

const baseRule: DiscountRule = {
  id: "00000000-0000-0000-0000-000000000001",
  code: "TEXT15",
  value: -15,
  value_type: "percentage",
  discount_class: "order",
  combinability: {},
  customer_selection: "all",
  intent_triggers: null,
  product_line_scope: null,
  campaign_window: null,
  applies_once_per_customer: true,
  usage_limit_per_code: null,
  times_used: 0,
  status: "active",
};

describe("isWithinWindow", () => {
  const now = new Date("2026-05-02T10:00:00Z");
  it("returns true when window is null", () => {
    expect(isWithinWindow(null, now)).toBe(true);
  });
  it("returns true when now is inside the window", () => {
    expect(
      isWithinWindow('["2026-04-01T00:00:00Z","2026-12-31T23:59:59Z")', now)
    ).toBe(true);
  });
  it("returns false when window has expired", () => {
    expect(
      isWithinWindow('["2024-01-01T00:00:00Z","2024-12-31T23:59:59Z")', now)
    ).toBe(false);
  });
  it("returns false when window is in the future", () => {
    expect(
      isWithinWindow('["2027-01-01T00:00:00Z","2027-12-31T23:59:59Z")', now)
    ).toBe(false);
  });
  it("treats 'infinity' upper bound as open-ended", () => {
    // Phase 14 regression: import script emits 'infinity' literally;
    // new Date("infinity") returns NaN, so the prior check rejected every
    // open-ended campaign and no discount ever fired in chat.
    expect(
      isWithinWindow('["2026-03-09 16:53:50+00",infinity)', now)
    ).toBe(true);
  });
  it("treats '-infinity' lower bound as open-ended", () => {
    expect(
      isWithinWindow('[-infinity,"2099-01-01T00:00:00Z")', now)
    ).toBe(true);
  });
});

describe("isOverLimit", () => {
  it("returns false when no limit set", () => {
    expect(isOverLimit({ times_used: 999, usage_limit_per_code: null })).toBe(false);
  });
  it("returns false when under limit", () => {
    expect(isOverLimit({ times_used: 5, usage_limit_per_code: 10 })).toBe(false);
  });
  it("returns true when at limit", () => {
    expect(isOverLimit({ times_used: 10, usage_limit_per_code: 10 })).toBe(true);
  });
});

describe("intentMatches", () => {
  it("matches when triggers are empty", () => {
    expect(intentMatches(null, "product")).toBe(true);
    expect(intentMatches([], "product")).toBe(true);
  });
  it("matches by exact label", () => {
    expect(intentMatches(["product"], "product")).toBe(true);
  });
  it("matches the intent: prefix form", () => {
    expect(intentMatches(["intent:product"], "product")).toBe(true);
  });
  it("rejects when no overlap", () => {
    expect(intentMatches(["lead_capture"], "product")).toBe(false);
  });
});

describe("productMatches", () => {
  it("matches when scope is empty", () => {
    expect(productMatches(null, ["violet"])).toBe(true);
  });
  it("requires intersection when scope is set", () => {
    expect(productMatches(["violet", "rose"], ["violet"])).toBe(true);
    expect(productMatches(["violet", "rose"], ["dahlia"])).toBe(false);
  });
  it("rejects empty product list when scope is set", () => {
    expect(productMatches(["violet"], [])).toBe(false);
  });
});

describe("describeRule", () => {
  it("formats percentage", () => {
    expect(describeRule(baseRule)).toBe("15% off your order");
  });
  it("formats fixed-amount product", () => {
    expect(
      describeRule({ ...baseRule, value: -5, value_type: "fixed_amount", discount_class: "product" })
    ).toBe("$5.00 off product");
  });
  it("formats shipping", () => {
    expect(
      describeRule({ ...baseRule, value: -100, value_type: "percentage", discount_class: "shipping" })
    ).toBe("100% off shipping");
  });
});

describe("selectDiscountForTurn", () => {
  const ctx = { intent: "product" as const, productHandles: ["violet"] };

  it("returns null when no rules", () => {
    expect(selectDiscountForTurn([], ctx)).toBeNull();
  });

  it("returns the only active rule", () => {
    const offered = selectDiscountForTurn([baseRule], ctx);
    expect(offered?.code).toBe("TEXT15");
    expect(offered?.description).toContain("15%");
  });

  it("filters out paused rules", () => {
    expect(
      selectDiscountForTurn(
        [{ ...baseRule, status: "paused" }],
        ctx
      )
    ).toBeNull();
  });

  it("filters by intent", () => {
    expect(
      selectDiscountForTurn(
        [{ ...baseRule, intent_triggers: ["lead_capture"] }],
        { ...ctx, intent: "product" }
      )
    ).toBeNull();
    expect(
      selectDiscountForTurn(
        [{ ...baseRule, intent_triggers: ["lead_capture"] }],
        { ...ctx, intent: "lead_capture" }
      )?.code
    ).toBe("TEXT15");
  });

  it("filters by product scope", () => {
    expect(
      selectDiscountForTurn(
        [{ ...baseRule, product_line_scope: ["dahlia"] }],
        ctx
      )
    ).toBeNull();
    expect(
      selectDiscountForTurn(
        [{ ...baseRule, product_line_scope: ["violet"] }],
        ctx
      )?.code
    ).toBe("TEXT15");
  });

  it("prefers higher percentage over lower percentage", () => {
    const fifteen = { ...baseRule, code: "TEXT15", value: -15 };
    const thirty = { ...baseRule, id: "x", code: "LASHDAY30", value: -30 };
    expect(selectDiscountForTurn([fifteen, thirty], ctx)?.code).toBe("LASHDAY30");
  });

  it("prefers percentage over fixed amount when same magnitude", () => {
    const pct = { ...baseRule, code: "PCT", value: -10, value_type: "percentage" as const };
    const fix = { ...baseRule, id: "x", code: "FIX", value: -10, value_type: "fixed_amount" as const };
    expect(selectDiscountForTurn([pct, fix], ctx)?.code).toBe("PCT");
  });
});
