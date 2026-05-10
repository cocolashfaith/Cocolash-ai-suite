import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createBlotatoClient } from "@/lib/blotato/client";

interface TestResponse {
  success: boolean;
  connected: boolean;
  accounts_found?: number;
  error?: string;
}

/**
 * GET /api/settings/blotato/test
 *
 * Tests the Blotato API key configured in process.env.BLOTATO_API_KEY.
 * Used by BlotatoApiKeyInput when the form is empty AND an env-var key is
 * known to be present (D-27-17).
 */
export async function GET(): Promise<NextResponse<TestResponse>> {
  return runTest(process.env.BLOTATO_API_KEY, "env");
}

/**
 * POST /api/settings/blotato/test
 *
 * Body: { apiKey: string }
 *
 * Tests a freshly pasted key WITHOUT saving it to the database. Phase 27,
 * Wave-6 (27-09) addition — closes review finding #3. Before this handler,
 * users had to Save first (which wrote the key to the DB) before they could
 * Test Connection on it. Now they can paste, Test, and only Save once the
 * key is confirmed working.
 */
const PostBodySchema = z.object({
  apiKey: z.string().trim().min(1, "apiKey is required"),
});

export async function POST(
  request: NextRequest
): Promise<NextResponse<TestResponse>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        success: false,
        connected: false,
        error: "Invalid JSON body",
      },
      { status: 400 }
    );
  }

  const parsed = PostBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        connected: false,
        error: parsed.error.issues[0]?.message ?? "Invalid body",
      },
      { status: 400 }
    );
  }

  return runTest(parsed.data.apiKey, "form");
}

async function runTest(
  apiKey: string | undefined,
  source: "env" | "form"
): Promise<NextResponse<TestResponse>> {
  try {
    if (!apiKey) {
      const error =
        source === "env"
          ? "No Blotato API key configured in environment"
          : "No Blotato API key provided in request body";
      return NextResponse.json(
        { success: false, connected: false, error },
        { status: 400 }
      );
    }

    const client = createBlotatoClient(apiKey);
    const valid = await client.testConnection();

    if (!valid) {
      return NextResponse.json(
        {
          success: false,
          connected: false,
          error: "Invalid Blotato API key. Could not connect to Blotato.",
        },
        { status: 401 }
      );
    }

    const accounts = await client.getAccounts();

    return NextResponse.json({
      success: true,
      connected: true,
      accounts_found: accounts.length,
    });
  } catch (error: unknown) {
    console.error("[settings/blotato/test] Error:", error);
    return NextResponse.json(
      {
        success: false,
        connected: false,
        error: "Failed to test Blotato connection",
      },
      { status: 500 }
    );
  }
}
