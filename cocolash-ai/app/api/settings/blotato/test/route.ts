import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createBlotatoClient } from "@/lib/blotato/client";
import { createClient } from "@/lib/supabase/server";

interface TestResponse {
  success: boolean;
  connected: boolean;
  accounts_found?: number;
  error?: string;
}

/**
 * GET /api/settings/blotato/test
 *
 * Tests the configured Blotato API key when the form is empty. Prefers the
 * environment key (process.env.BLOTATO_API_KEY); if none is set, falls back to
 * a key saved in caption_settings so "Test Connection" also works for a
 * DB-stored key — not just the env var (fixes the greyed-out button when the
 * key lives in the database).
 */
export async function GET(): Promise<NextResponse<TestResponse>> {
  const envKey = process.env.BLOTATO_API_KEY;
  if (envKey) return runTest(envKey, "env");

  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("caption_settings")
      .select("blotato_api_key")
      .limit(1);
    const dbKey = data?.[0]?.blotato_api_key as string | undefined;
    return runTest(dbKey, "db");
  } catch (error: unknown) {
    console.error("[settings/blotato/test] DB key lookup failed:", error);
    return runTest(undefined, "db");
  }
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
  source: "env" | "form" | "db"
): Promise<NextResponse<TestResponse>> {
  try {
    if (!apiKey) {
      const error =
        source === "env"
          ? "No Blotato API key configured in environment"
          : source === "db"
            ? "No Blotato API key configured. Paste your key and try again."
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
