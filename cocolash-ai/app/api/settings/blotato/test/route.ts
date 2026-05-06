import { NextResponse } from "next/server";
import { createBlotatoClient } from "@/lib/blotato/client";

interface TestResponse {
  success: boolean;
  connected: boolean;
  accounts_found?: number;
  error?: string;
}

export async function GET(): Promise<NextResponse<TestResponse>> {
  try {
    const apiKey = process.env.BLOTATO_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          connected: false,
          error: "No Blotato API key configured in environment",
        },
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
