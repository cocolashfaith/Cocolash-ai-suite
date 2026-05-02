import { describe, it, expect } from "vitest";
import { LeadPayloadSchema } from "./lead-validation";

const VALID_UUID = "00000000-0000-4000-8000-000000000000";

describe("LeadPayloadSchema", () => {
  it("accepts a minimal valid payload", () => {
    const r = LeadPayloadSchema.safeParse({
      sessionId: VALID_UUID,
      email: "user@example.com",
      consent: true,
    });
    expect(r.success).toBe(true);
  });

  it("rejects an invalid uuid", () => {
    const r = LeadPayloadSchema.safeParse({
      sessionId: "not-a-uuid",
      email: "user@example.com",
      consent: true,
    });
    expect(r.success).toBe(false);
  });

  it("rejects an invalid email", () => {
    const r = LeadPayloadSchema.safeParse({
      sessionId: VALID_UUID,
      email: "not-an-email",
      consent: true,
    });
    expect(r.success).toBe(false);
  });

  it("requires consent boolean", () => {
    const r = LeadPayloadSchema.safeParse({
      sessionId: VALID_UUID,
      email: "user@example.com",
    });
    expect(r.success).toBe(false);
  });

  it("accepts optional fields", () => {
    const r = LeadPayloadSchema.safeParse({
      sessionId: VALID_UUID,
      email: "user@example.com",
      consent: true,
      intentAtCapture: "lead_capture",
      discountOffered: "TEXT15 (15% off your order)",
      notes: "fan of natural styles",
    });
    expect(r.success).toBe(true);
  });

  it("rejects an over-long email", () => {
    const r = LeadPayloadSchema.safeParse({
      sessionId: VALID_UUID,
      email: "a".repeat(255) + "@example.com",
      consent: true,
    });
    expect(r.success).toBe(false);
  });
});
