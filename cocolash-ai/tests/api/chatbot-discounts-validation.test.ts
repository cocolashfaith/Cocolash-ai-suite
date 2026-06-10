import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import * as adminAuth from "@/lib/chat/admin-auth";
import * as supabaseServer from "@/lib/supabase/server";
import { ChatError } from "@/lib/chat/error";
import { POST, PATCH } from "@/app/api/chatbot/admin/discounts/route";

/**
 * Guards the self-service discount endpoints (Faith: promo codes editable
 * without a deploy). Two things must hold:
 *  1. Only chat admins can create/patch (auth gate).
 *  2. A non-finite / zero value can NEVER reach discount_rules (data integrity —
 *     the client computes Number("") = NaN which JSON-serialises to null).
 */

vi.mock("@/lib/chat/admin-auth");
vi.mock("@/lib/supabase/server");

function req(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/chatbot/admin/discounts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockAdminOk(): void {
  vi.mocked(adminAuth.requireChatAdmin).mockResolvedValue({
    authUserId: "u1",
    email: "admin@cocolash.com",
    role: "owner",
  });
}

const validBody = {
  code: "WELCOME10",
  value: 10,
  value_type: "percentage" as const,
  discount_class: "order" as const,
};

describe("POST /api/chatbot/admin/discounts — auth + value integrity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(supabaseServer.createClient).mockResolvedValue({} as never);
  });

  it("rejects non-admins with the ChatError status (no insert)", async () => {
    vi.mocked(adminAuth.requireChatAdmin).mockRejectedValue(
      new ChatError("forbidden", 403, "session_disabled")
    );
    const res = await POST(req(validBody));
    expect(res.status).toBe(403);
  });

  it("rejects a null/NaN value with 400 (never corrupts the row)", async () => {
    mockAdminOk();
    const res = await POST(req({ ...validBody, value: Number("") })); // NaN -> null
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("validation_failed");
  });

  it("rejects a zero value with 400", async () => {
    mockAdminOk();
    const res = await POST(req({ ...validBody, value: 0 }));
    expect(res.status).toBe(400);
  });

  it("accepts a valid code and returns the inserted row", async () => {
    mockAdminOk();
    const single = vi
      .fn()
      .mockResolvedValue({ data: { id: "d1", ...validBody }, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    vi.mocked(supabaseServer.createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ insert }),
    } as never);

    const res = await POST(req(validBody));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.row.id).toBe("d1");
  });
});

describe("PATCH /api/chatbot/admin/discounts — value integrity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(supabaseServer.createClient).mockResolvedValue({} as never);
  });

  it("rejects a NaN/null value with 400", async () => {
    mockAdminOk();
    const res = await PATCH(
      req({ id: "00000000-0000-0000-0000-000000000000", value: Number("x") })
    );
    expect(res.status).toBe(400);
  });
});
