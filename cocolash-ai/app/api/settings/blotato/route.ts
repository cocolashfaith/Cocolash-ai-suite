import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createBlotatoClient } from "@/lib/blotato/client";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { api_key } = body as { api_key?: string };

    if (!api_key || typeof api_key !== "string" || !api_key.trim()) {
      return NextResponse.json(
        { error: "api_key is required" },
        { status: 400 }
      );
    }

    const trimmedKey = api_key.trim();

    const client = createBlotatoClient(trimmedKey);
    const valid = await client.testConnection();

    if (!valid) {
      return NextResponse.json(
        { error: "Invalid Blotato API key. Could not connect to Blotato." },
        { status: 401 }
      );
    }

    const supabase = await createClient();

    const { data: existing } = await supabase
      .from("caption_settings")
      .select("id")
      .limit(1);

    if (!existing || existing.length === 0) {
      await supabase.from("caption_settings").insert({
        blotato_api_key: trimmedKey,
        default_style: "casual",
        always_include_hashtags: [],
        never_include_hashtags: [],
      });
    } else {
      await supabase
        .from("caption_settings")
        .update({
          blotato_api_key: trimmedKey,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing[0].id);
    }

    const accounts = await client.getAccounts();

    return NextResponse.json({
      success: true,
      connected: true,
      accounts_found: accounts.length,
    });
  } catch (error: unknown) {
    console.error("[settings/blotato] Error:", error);
    return NextResponse.json(
      { error: "Failed to save Blotato API key" },
      { status: 500 }
    );
  }
}
