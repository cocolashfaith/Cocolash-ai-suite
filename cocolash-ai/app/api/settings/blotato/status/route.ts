import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface StatusResponse {
  hasEnvKey: boolean;
  hasDbKey: boolean;
  lastTestedAt: string | null;
  accountsFound: number | null;
}

export async function GET(): Promise<NextResponse<StatusResponse>> {
  try {
    const hasEnvKey = !!process.env.BLOTATO_API_KEY;

    const supabase = await createClient();

    const { data: settings, error } = await supabase
      .from("caption_settings")
      .select("blotato_api_key, blotato_last_tested_at, blotato_accounts_found")
      .limit(1);

    if (error) {
      throw error;
    }

    const hasDbKey = !!(settings && settings.length > 0 && settings[0].blotato_api_key);
    const lastTestedAt =
      settings && settings.length > 0 ? settings[0].blotato_last_tested_at : null;
    const accountsFound =
      settings && settings.length > 0 ? settings[0].blotato_accounts_found : null;

    return NextResponse.json({
      hasEnvKey,
      hasDbKey,
      lastTestedAt,
      accountsFound,
    });
  } catch (error: unknown) {
    console.error("[settings/blotato/status] Error:", error);
    return NextResponse.json(
      {
        hasEnvKey: false,
        hasDbKey: false,
        lastTestedAt: null,
        accountsFound: null,
      },
      { status: 500 }
    );
  }
}
