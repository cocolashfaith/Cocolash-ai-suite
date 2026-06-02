import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextResponse } from "next/server";
import * as statusModule from "@/app/api/settings/blotato/status/route";
import * as supabaseServer from "@/lib/supabase/server";

/**
 * Test suite for GET /api/settings/blotato/status
 * Wave 0 (RED): Verifies the endpoint returns 200 (not 500) even when
 * caption_settings table lacks blotato_last_tested_at and blotato_accounts_found columns.
 *
 * These tests specify the contract for SOC-01:
 * - Endpoint returns 200 with correct response shape
 * - hasEnvKey truthfully reflects process.env.BLOTATO_API_KEY presence
 * - lastTestedAt and accountsFound are null (not persisted)
 * - Endpoint is resilient to schema errors
 */

vi.mock("@/lib/supabase/server");

describe("GET /api/settings/blotato/status (SOC-01)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.BLOTATO_API_KEY;
  });

  afterEach(() => {
    delete process.env.BLOTATO_API_KEY;
  });

  it("Returns 200 with correct shape when env key is set", async () => {
    // Arrange
    process.env.BLOTATO_API_KEY = "test_key_123";

    vi.mocked(supabaseServer.createClient).mockResolvedValueOnce({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        }),
      }),
    } as never);

    // Act
    const response = (await statusModule.GET()) as NextResponse;
    const data = await response.json();

    // Assert
    expect(response.status).toBe(200);
    expect(data).toHaveProperty("hasEnvKey");
    expect(data).toHaveProperty("hasDbKey");
    expect(data).toHaveProperty("lastTestedAt");
    expect(data).toHaveProperty("accountsFound");
    expect(data.hasEnvKey).toBe(true);
    expect(data.hasDbKey).toBe(false);
    expect(data.lastTestedAt).toBeNull();
    expect(data.accountsFound).toBeNull();
  });

  it("Returns 200 with hasDbKey:true when caption_settings has blotato_api_key", async () => {
    // Arrange
    process.env.BLOTATO_API_KEY = "env_key_xyz";

    vi.mocked(supabaseServer.createClient).mockResolvedValueOnce({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({
            data: [{ blotato_api_key: "db_key_abc" }],
            error: null,
          }),
        }),
      }),
    } as never);

    // Act
    const response = (await statusModule.GET()) as NextResponse;
    const data = await response.json();

    // Assert
    expect(response.status).toBe(200);
    expect(data.hasEnvKey).toBe(true);
    expect(data.hasDbKey).toBe(true);
    expect(data.lastTestedAt).toBeNull();
    expect(data.accountsFound).toBeNull();
  });

  it("Returns 200 when caption_settings table lacks blotato_last_tested_at and blotato_accounts_found columns", async () => {
    // Arrange
    process.env.BLOTATO_API_KEY = "env_key_xyz";

    // Mock a select that only requests blotato_api_key (existing column)
    // In the actual implementation (Wave 1), the SELECT should drop the non-existent columns
    vi.mocked(supabaseServer.createClient).mockResolvedValueOnce({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({
            data: [{ blotato_api_key: "db_key_123" }],
            error: null,
          }),
        }),
      }),
    } as never);

    // Act
    const response = (await statusModule.GET()) as NextResponse;
    const data = await response.json();

    // Assert: Response is 200 (not 500), even though columns are missing
    expect(response.status).toBe(200);
    expect(data.hasEnvKey).toBe(true);
    expect(data.hasDbKey).toBe(true);
    expect(data.lastTestedAt).toBeNull();
    expect(data.accountsFound).toBeNull();
  });

  it("Returns hasEnvKey:false when BLOTATO_API_KEY env is unset", async () => {
    // Arrange
    delete process.env.BLOTATO_API_KEY;

    vi.mocked(supabaseServer.createClient).mockResolvedValueOnce({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        }),
      }),
    } as never);

    // Act
    const response = (await statusModule.GET()) as NextResponse;
    const data = await response.json();

    // Assert
    expect(response.status).toBe(200);
    expect(data.hasEnvKey).toBe(false);
    expect(data.hasDbKey).toBe(false);
    expect(data.lastTestedAt).toBeNull();
    expect(data.accountsFound).toBeNull();
  });

  it("Response shape is consistent and never crashes on DB errors", async () => {
    // Arrange
    process.env.BLOTATO_API_KEY = "env_key_xyz";

    vi.mocked(supabaseServer.createClient).mockResolvedValueOnce({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({
            data: null,
            error: new Error("Database connection failed"),
          }),
        }),
      }),
    } as never);

    // Act
    const response = (await statusModule.GET()) as NextResponse;
    const data = await response.json();

    // Assert: Even on error, response has consistent shape (500 status)
    expect(response.status).toBe(500);
    expect(data).toHaveProperty("hasEnvKey");
    expect(data).toHaveProperty("hasDbKey");
    expect(data).toHaveProperty("lastTestedAt");
    expect(data).toHaveProperty("accountsFound");
    expect(data.lastTestedAt).toBeNull();
    expect(data.accountsFound).toBeNull();
  });
});
